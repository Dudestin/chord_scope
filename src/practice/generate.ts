import { Chord, Key, Midi, Note, Scale } from 'tonal'
import { CLEF_MIDDLE_LINE, diatonicPosition } from '../theory/clefs'
import type { ClefName } from '../theory/clefs'

export const MEASURES = 2
export const STEPS_PER_MEASURE = 4

export type DrillKind = 'notes' | 'hands' | 'chords' | 'symbols'
export type StaffName = 'top' | 'bottom'
export type ChordPool = 'triads' | 'sevenths' | 'mixed'

export interface PracticeSettings {
  drill: DrillKind
  staff: StaffName | 'alternate'
  // Ledger lines allowed beyond the staff (0–3).
  ledger: number
  // Largest melodic interval in diatonic steps; 0 picks any note in range.
  leap: number
  // Notes per chord (2–4); 0 mixes all sizes.
  chordSize: number
  pool: ChordPool
  accidentals: boolean
}

export const DEFAULT_SETTINGS: PracticeSettings = {
  drill: 'notes',
  staff: 'top',
  ledger: 1,
  leap: 4,
  chordSize: 3,
  pool: 'sevenths',
  accidentals: false,
}

export interface PracticeConfig extends PracticeSettings {
  keySpec: string
  topClef: ClefName
  bottomClef: ClefName
}

export interface TargetNote {
  midi: number
  name: string
  staff: StaffName
}

export type Step =
  | { kind: 'notes'; notes: TargetNote[] }
  | { kind: 'symbol'; symbol: string; chromas: number[] }

const LETTERS = 'CDEFGAB'
const SHARPENED = 'CDFGA'
const FLATTENED = 'DEGAB'

const ALTER_CHANCE = 0.15
const CHORD_ALTER_CHANCE = 0.25
const RESOLVE_CHANCE = 0.5
const KEEP_DIRECTION = 0.65
const MIN_HAND_GAP = 3
const HAND_ATTEMPTS = 40

// Relative likelihood of a melodic interval, indexed by its size in steps:
// mostly stepwise, an occasional repeated note, rarer wide leaps.
const INTERVAL_WEIGHTS = [0.5, 6, 3, 1.5, 1.5, 0.5, 0.5, 0.5]

// Diatonic offsets from the lowest note: intervals up to an octave, triads and
// seventh chords in every inversion.
const CHORD_SHAPES: Record<number, number[][]> = {
  2: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]],
  3: [[0, 2, 4], [0, 2, 5], [0, 3, 5]],
  4: [[0, 2, 4, 6], [0, 2, 4, 5], [0, 2, 3, 5], [0, 1, 3, 5]],
}

interface Rng {
  next: () => number
  state: () => number
}

// mulberry32. The state left after a run seeds the next one, so consecutive
// measures draw from a single deterministic stream.
function createRng(seed: number): Rng {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    state: () => state,
  }
}

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng.next() * items.length)]
}

function pickWeighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  let roll = rng.next() * items.reduce((sum, [, weight]) => sum + weight, 0)
  for (const [item, weight] of items) {
    roll -= weight
    if (roll < 0) return item
  }
  return items[items.length - 1][0]
}

// The accidental ('', '#' or 'b') each letter carries under the key signature.
function keyAccidentals(keySpec: string): string[] {
  const accidentals = Array.from(LETTERS, () => '')
  for (const name of Scale.get(`${keySpec} major`).notes) {
    accidentals[LETTERS.indexOf(name[0])] = name.slice(1)
  }
  return accidentals
}

// Notes are spelled from their staff position, never from a MIDI number, so
// that Cb4 or E#4 land on the line the key signature expects.
function noteAt(position: number, accidental: string, staff: StaffName): TargetNote {
  const name = `${LETTERS[position % 7]}${accidental}${Math.floor(position / 7)}`
  return { midi: Note.midi(name) ?? 0, name, staff }
}

// A letter the key signature alters becomes natural; a natural one takes a
// sharp or flat that never spells E#, B#, Cb or Fb.
function alteredAccidental(rng: Rng, letter: string, inKey: string): string {
  if (inKey !== '') return ''
  const options = []
  if (SHARPENED.includes(letter)) options.push('#')
  if (FLATTENED.includes(letter)) options.push('b')
  return pick(rng, options)
}

function staffRange(clef: ClefName, ledger: number): [number, number] {
  const reach = 5 + 2 * ledger
  return [CLEF_MIDDLE_LINE[clef] - reach, CLEF_MIDDLE_LINE[clef] + reach]
}

interface Walker {
  position: number | null
  direction: number
}

// Picks up the line where the previous measure left it on this staff.
function walkerAfter(prev: Step[] | null, staff: StaffName, rng: Rng): Walker {
  const direction = rng.next() < 0.5 ? 1 : -1
  for (const step of [...(prev ?? [])].reverse()) {
    const note = step.kind === 'notes' ? step.notes.find((n) => n.staff === staff) : undefined
    if (note) return { position: diatonicPosition(note.name), direction }
  }
  return { position: null, direction }
}

function moveTo(walker: Walker, position: number) {
  if (walker.position !== null && position !== walker.position) {
    walker.direction = position > walker.position ? 1 : -1
  }
  walker.position = position
}

function nextPosition(rng: Rng, walker: Walker, low: number, high: number, leap: number): number {
  const from = walker.position
  if (from === null) {
    const margin = Math.floor((high - low) / 4)
    return low + margin + Math.floor(rng.next() * (high - low - 2 * margin + 1))
  }

  const candidates: [number, number][] = []
  for (let position = low; position <= high; position++) {
    const size = Math.abs(position - from)
    if (leap === 0) {
      if (size > 0) candidates.push([position, 1])
    } else if (size <= leap) {
      const along =
        size === 0 ? 1 : Math.sign(position - from) === walker.direction ? KEEP_DIRECTION : 1 - KEEP_DIRECTION
      candidates.push([position, INTERVAL_WEIGHTS[size] * along])
    }
  }
  if (candidates.length === 0) return Math.min(high, Math.max(low, from))
  return pickWeighted(rng, candidates)
}

// Hands should not cross. If the clef choice makes that impossible, settle for
// two different keys rather than spin forever.
function handsFit(top: TargetNote, bottom: TargetNote, attempt: number): boolean {
  if (attempt > 2 * HAND_ATTEMPTS) return true
  const gap = top.midi - bottom.midi
  return attempt > HAND_ATTEMPTS ? gap !== 0 : gap >= MIN_HAND_GAP
}

function isAscending(notes: TargetNote[]): boolean {
  return notes.every((note, i) => i === 0 || note.midi > notes[i - 1].midi)
}

function staffSteps(config: PracticeConfig, rng: Rng, slot: number, prev: Step[] | null): Step[] {
  const inKey = keyAccidentals(config.keySpec)
  const ranges: Record<StaffName, [number, number]> = {
    top: staffRange(config.topClef, config.ledger),
    bottom: staffRange(config.bottomClef, config.ledger),
  }
  const walkers: Record<StaffName, Walker> = {
    top: walkerAfter(prev, 'top', rng),
    bottom: walkerAfter(prev, 'bottom', rng),
  }
  const solo: StaffName =
    config.staff === 'alternate' ? (slot % 2 === 0 ? 'top' : 'bottom') : config.staff

  const wantsAlter = (chance: number) => config.accidentals && rng.next() < chance
  const spell = (position: number, staff: StaffName, alter: boolean): TargetNote => {
    const accidental = inKey[position % 7]
    return noteAt(
      position,
      alter ? alteredAccidental(rng, LETTERS[position % 7], accidental) : accidental,
      staff,
    )
  }
  const propose = (staff: StaffName): TargetNote => {
    const [low, high] = ranges[staff]
    const position = nextPosition(rng, walkers[staff], low, high, config.leap)
    return spell(position, staff, wantsAlter(ALTER_CHANCE))
  }
  const commit = (note: TargetNote) => moveTo(walkers[note.staff], diatonicPosition(note.name))

  return Array.from({ length: STEPS_PER_MEASURE }, (): Step => {
    if (config.drill === 'hands') {
      let top = propose('top')
      let bottom = propose('bottom')
      for (let attempt = 1; !handsFit(top, bottom, attempt); attempt++) {
        top = propose('top')
        bottom = propose('bottom')
      }
      commit(top)
      commit(bottom)
      return { kind: 'notes', notes: [bottom, top].sort((a, b) => a.midi - b.midi) }
    }

    if (config.drill === 'chords') {
      const shapes = CHORD_SHAPES[config.chordSize || pick(rng, [2, 3, 4])] ?? CHORD_SHAPES[3]
      const shape = pick(rng, shapes)
      const [low, high] = ranges[solo]
      const root = nextPosition(rng, walkers[solo], low, high - shape[shape.length - 1], config.leap)
      moveTo(walkers[solo], root)

      let notes = shape.map((offset) => spell(root + offset, solo, false))
      if (wantsAlter(CHORD_ALTER_CHANCE)) {
        const index = Math.floor(rng.next() * notes.length)
        const altered = notes.map((note, i) =>
          i === index ? spell(root + shape[i], solo, true) : note,
        )
        // Flattening G above F# (or the like) would put two noteheads on one key.
        if (isAscending(altered)) notes = altered
      }
      return { kind: 'notes', notes }
    }

    const note = propose(solo)
    commit(note)
    return { kind: 'notes', notes: [note] }
  })
}

interface PoolChord {
  symbol: string
  // Scale degree of the root (0 = tonic), used to resolve down a fifth.
  degree: number
}

function chordPool(keySpec: string, pool: ChordPool): PoolChord[] {
  const key = Key.majorKey(keySpec)
  const chords: PoolChord[] = []
  if (pool !== 'sevenths') key.triads.forEach((symbol, degree) => chords.push({ symbol, degree }))
  if (pool !== 'triads') key.chords.forEach((symbol, degree) => chords.push({ symbol, degree }))
  if (pool === 'mixed') {
    // Indexed by the degree each dominant resolves to; its own root sits a fifth above.
    key.secondaryDominants.forEach((symbol, target) => {
      if (symbol) chords.push({ symbol, degree: (target + 4) % 7 })
    })
  }
  return chords
}

function symbolSteps(config: PracticeConfig, rng: Rng, prev: Step[] | null): Step[] {
  const pool = chordPool(config.keySpec, config.pool)
  const last = prev?.[prev.length - 1]
  let previous = last?.kind === 'symbol' ? last.symbol : null

  return Array.from({ length: STEPS_PER_MEASURE }, (): Step => {
    const before = pool.find((chord) => chord.symbol === previous)
    let candidates = pool.filter((chord) => chord.symbol !== previous)
    if (before && rng.next() < RESOLVE_CHANCE) {
      const resolved = candidates.filter((chord) => chord.degree === (before.degree + 3) % 7)
      if (resolved.length > 0) candidates = resolved
    }
    const { symbol } = pick(rng, candidates)
    previous = symbol
    const chromas = Chord.get(symbol)
      .notes.map((note) => Note.chroma(note))
      .filter((c): c is number => c !== undefined)
    return { kind: 'symbol', symbol, chromas }
  })
}

export function generateMeasure(
  config: PracticeConfig,
  seed: number,
  slot: number,
  prev: Step[] | null,
): { steps: Step[]; seed: number } {
  const rng = createRng(seed)
  const steps =
    config.drill === 'symbols'
      ? symbolSteps(config, rng, prev)
      : staffSteps(config, rng, slot, prev)
  return { steps, seed: rng.state() }
}

// Spells a played key the way the staff shows it without an accidental:
// pitches of the key take the key's spelling, the rest follow its sharp or flat side.
export function spellForStaff(midi: number, keySpec: string): string {
  const key = Key.majorKey(keySpec)
  const plain = Midi.midiToNoteName(midi, { sharps: key.alteration >= 0 })
  const inKey = key.scale.find((pc) => Note.chroma(pc) === midi % 12)
  return inKey ? Note.enharmonic(plain, inKey) : plain
}
