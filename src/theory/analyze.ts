import { Chord, Key, Midi, Note, Progression, Scale } from 'tonal'

export interface NoteInfo {
  midi: number
  name: string
}

export interface ChordResult {
  symbol: string
  alternates: string[]
}

export function analyzeNotes(midiNotes: number[], sharps: boolean): NoteInfo[] {
  return [...midiNotes]
    .sort((a, b) => a - b)
    .map((midi) => ({ midi, name: Midi.midiToNoteName(midi, { sharps }) }))
}

export function detectChord(
  midiNotes: number[],
  sharps: boolean,
): ChordResult | null {
  if (midiNotes.length < 3) return null

  const sorted = [...midiNotes].sort((a, b) => a - b)
  const noteNames = sorted.map((midi) => Midi.midiToNoteName(midi, { sharps }))
  const candidates = Chord.detect(noteNames)

  if (candidates.length === 0) return null

  const [symbol, ...alternates] = candidates
  return { symbol, alternates }
}

export interface TensionResult {
  tensions: string[]
  avoids: string[]
}

export function computeTensions(
  chordSymbol: string,
  keyTonic: string,
  mode: 'major' | 'minor',
): TensionResult {
  const scaleNotes: readonly string[] =
    mode === 'minor'
      ? Key.minorKey(keyTonic).natural.scale
      : Key.majorKey(keyTonic).scale

  const chord = Chord.get(chordSymbol)
  if (chord.empty) return { tensions: [], avoids: [] }

  const chordChromas = new Set(
    chord.notes.map((n) => Note.chroma(n)).filter((c): c is number => c !== undefined),
  )

  const tensions: string[] = []
  const avoids: string[] = []

  for (const scaleTone of scaleNotes) {
    const chroma = Note.chroma(scaleTone)
    if (chroma === undefined) continue
    if (chordChromas.has(chroma)) continue

    // avoid = half step (1 semitone) above any chord tone
    const isAvoid = [...chordChromas].some((cc) => (chroma - cc + 12) % 12 === 1)
    if (isAvoid) avoids.push(scaleTone)
    else tensions.push(scaleTone)
  }

  return { tensions, avoids }
}

const COMMON_SCALE_TYPES = new Set([
  'major',
  'minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'major pentatonic',
  'minor pentatonic',
  'harmonic minor',
  'melodic minor',
  'blues',
  'whole tone',
  'diminished',
  'augmented',
])

export function detectScales(noteNames: string[]): string[] {
  if (noteNames.length < 2) return []
  const pcs = noteNames.map((n) => n.replace(/\d+$/, ''))
  return Scale.detect(pcs)
    .filter((name) => COMMON_SCALE_TYPES.has(Scale.get(name).type))
    .slice(0, 5)
}

export function detectRomanNumeral(
  chordSymbol: string,
  tonic: string,
): string | null {
  const result = Progression.toRomanNumerals(tonic, [chordSymbol])
  return result[0] ?? null
}
