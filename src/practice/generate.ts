import { Chord, Key, Midi, Note, Scale } from 'tonal'
import { CLEF_MIDDLE_LINE, diatonicPosition } from '../theory/clefs'
import type { ClefName } from '../theory/clefs'

export const MEASURES = 2
export const STEPS_PER_MEASURE = 4

export type DrillKind = 'notes' | 'hands' | 'chords' | 'symbols' | 'cadence'
export type StaffName = 'top' | 'bottom'
export type ChordPool = 'triads' | 'sevenths' | 'mixed'
export type CadenceKind = 'basic' | 'sixFour'

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
  cadence: CadenceKind
  // Inversion the right hand starts a cadence in (0–2); 3 varies it.
  inversion: number
  // Move one key round the circle of fifths after every cadence.
  cycleKeys: boolean
}

export const DEFAULT_SETTINGS: PracticeSettings = {
  drill: 'notes',
  staff: 'top',
  ledger: 1,
  leap: 4,
  chordSize: 3,
  pool: 'sevenths',
  accidentals: false,
  cadence: 'basic',
  inversion: 0,
  cycleKeys: false,
}

export interface PracticeConfig extends PracticeSettings {
  keySpec: string
  // Cadences follow the relative minor of the key signature.
  minor: boolean
  topClef: ClefName
  bottomClef: ClefName
}

export interface TargetNote {
  midi: number
  name: string
  staff: StaffName
}

// A cadence chord: its roman numeral and the key it is heard in ('Eb', 'Cm').
export interface ChordFunction {
  numeral: string
  key: string
}

export type Step =
  | { kind: 'notes'; notes: TargetNote[]; chord?: ChordFunction }
  | { kind: 'symbol'; symbol: string; chromas: number[] }

const LETTERS = 'CDEFGAB'
// Scale degrees (0 = tonic) an accidental may raise or lower. The ones left
// out would land on the scale tone next door: E# or Cb in C major.
const RAISED_DEGREES = [0, 1, 3, 4, 5]
const LOWERED_DEGREES = [1, 2, 4, 5, 6]

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

// Right-hand shapes as diatonic offsets from the tonic, one set per starting
// inversion. Each chord keeps the tones it shares with the one before and
// moves the others by step; V7 leaves out its fifth.
const CADENCE_SHAPES = [
  { I: [0, 2, 4], IV: [0, 3, 5], V7: [-1, 3, 4] },
  { I: [2, 4, 7], IV: [3, 5, 7], V7: [3, 4, 6] },
  { I: [4, 7, 9], IV: [5, 7, 10], V7: [4, 6, 10] },
]

type CadenceChord = keyof (typeof CADENCE_SHAPES)[number]

// `bass` is the left hand's scale degree as an offset from the tonic.
const CADENCES: Record<CadenceKind, { chord: CadenceChord; bass: number; numeral: string }[]> = {
  basic: [
    { chord: 'I', bass: 0, numeral: 'I' },
    { chord: 'IV', bass: 3, numeral: 'IV' },
    { chord: 'V7', bass: 4, numeral: 'V7' },
    { chord: 'I', bass: 0, numeral: 'I' },
  ],
  sixFour: [
    { chord: 'I', bass: 0, numeral: 'I' },
    { chord: 'IV', bass: 3, numeral: 'IV' },
    { chord: 'I', bass: 4, numeral: 'I6/4' },
    { chord: 'V7', bass: 4, numeral: 'V7' },
    { chord: 'I', bass: 0, numeral: 'I' },
  ],
}

const LEADING_TONE = 6
// The bass moves between the tonic and the fifth above it.
const BASS_SPAN = 4
// The right hand sits a little below the middle of its staff, close to the left.
const RIGHT_HAND_DROP = 2

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

// A semitone up or down from what the key signature gives a letter: a flat is
// raised to a natural, a sharp to a double sharp.
function sharpen(accidental: string): string {
  return accidental === 'b' ? '' : `${accidental}#`
}

function flatten(accidental: string): string {
  return accidental === '#' ? '' : `${accidental}b`
}

// An accidental is spelled the way its key would write it, by scale degree:
// Eb major raises its fourth to A natural and lowers its sixth to Cb.
function alteredAccidental(rng: Rng, degree: number, inKey: string): string {
  const options = []
  if (RAISED_DEGREES.includes(degree)) options.push(sharpen(inKey))
  if (LOWERED_DEGREES.includes(degree)) options.push(flatten(inKey))
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

function staffSteps(config: PracticeConfig, rng: Rng, slot: number, prev: Step[] | null): Step[] {
  const inKey = keyAccidentals(config.keySpec)
  // Staff drills only read the key signature, so degrees count from the major tonic.
  const tonic = LETTERS.indexOf(config.keySpec[0])
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
      alter ? alteredAccidental(rng, (position - tonic + 7) % 7, accidental) : accidental,
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

      // One altered note at most. It never lands on the scale tone next to
      // it, so every notehead of the chord keeps a key of its own.
      const altered = wantsAlter(CHORD_ALTER_CHANCE) ? Math.floor(rng.next() * shape.length) : -1
      const notes = shape.map((offset, i) => spell(root + offset, solo, i === altered))
      return { kind: 'notes', notes }
    }

    const note = propose(solo)
    commit(note)
    return { kind: 'notes', notes: [note] }
  })
}

// The octave that puts a shape spanning `low`..`high` (offsets from the tonic)
// closest to `centre`.
function tonicNear(letter: number, low: number, high: number, centre: number): number {
  const octave = Math.round((centre - (low + high) / 2 - letter) / 7)
  return octave * 7 + letter
}

// Keyboard-style cadence: three-note chords in the right hand over the bass
// note in the left. Minor keys take the harmonic form, so V7 gets a raised
// leading tone.
function cadenceSteps(config: PracticeConfig, rng: Rng): Step[] {
  const inKey = keyAccidentals(config.keySpec)
  const major = LETTERS.indexOf(config.keySpec[0])
  const letter = config.minor ? (major + 5) % 7 : major
  const key = `${LETTERS[letter]}${inKey[letter]}${config.minor ? 'm' : ''}`

  const shapes = CADENCE_SHAPES[config.inversion] ?? pick(rng, CADENCE_SHAPES)
  const offsets = Object.values(shapes).flat()
  const low = Math.min(...offsets)
  const high = Math.max(...offsets)
  const upperCentre = CLEF_MIDDLE_LINE[config.topClef] - RIGHT_HAND_DROP
  const lowerCentre = CLEF_MIDDLE_LINE[config.bottomClef]
  let tonic = tonicNear(letter, low, high, upperCentre)
  let bassTonic = tonicNear(letter, 0, BASS_SPAN, lowerCentre)
  // Where the hands would overlap, move apart whichever strays least from its
  // staff; on a near tie the right hand goes up, which keeps the bass in its staff.
  while (bassTonic + BASS_SPAN >= tonic + low) {
    const raised = Math.abs(tonic + 7 + (low + high) / 2 - upperCentre)
    const lowered = Math.abs(bassTonic - 7 + BASS_SPAN / 2 - lowerCentre)
    if (raised <= lowered + 1) tonic += 7
    else bassTonic -= 7
  }

  return CADENCES[config.cadence].map(({ chord, bass, numeral }): Step => {
    const upper = shapes[chord].map((offset) => {
      const position = tonic + offset
      const accidental = inKey[position % 7]
      const raised = config.minor && chord === 'V7' && (offset + 7) % 7 === LEADING_TONE
      return noteAt(position, raised ? sharpen(accidental) : accidental, 'top')
    })
    const lower = noteAt(bassTonic + bass, inKey[(bassTonic + bass) % 7], 'bottom')
    return {
      kind: 'notes',
      notes: [lower, ...upper],
      chord: { numeral: config.minor && chord !== 'V7' ? numeral.toLowerCase() : numeral, key },
    }
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

// `keySpec` lets a measure sit in another key than the one the session started
// in, which is how cadences travel round the circle of fifths.
export function generateMeasure(
  config: PracticeConfig,
  seed: number,
  slot: number,
  prev: Step[] | null,
  keySpec: string = config.keySpec,
): { steps: Step[]; seed: number } {
  const rng = createRng(seed)
  const local = keySpec === config.keySpec ? config : { ...config, keySpec }
  const steps =
    local.drill === 'symbols'
      ? symbolSteps(local, rng, prev)
      : local.drill === 'cadence'
        ? cadenceSteps(local, rng)
        : staffSteps(local, rng, slot, prev)
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
