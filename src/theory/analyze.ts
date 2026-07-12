import { Chord, Midi } from 'tonal'

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
