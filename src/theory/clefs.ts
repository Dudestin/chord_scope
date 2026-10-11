import { Note } from 'tonal'

export type ClefName = 'treble' | 'alto' | 'bass'

// Diatonic position (octave * 7 + letter index, C = 0) of each clef's middle
// line: B4 for treble, C4 for alto, D3 for bass.
export const CLEF_MIDDLE_LINE: Record<ClefName, number> = {
  treble: 34,
  alto: 28,
  bass: 22,
}

export function diatonicPosition(name: string): number {
  const note = Note.get(name)
  return (note.oct ?? 0) * 7 + note.step
}

// Staff line of a note under a clef: 1 is the bottom line, 5 the top line,
// halves are spaces, and anything below 1 or above 5 sits on ledger lines.
export function staffLine(name: string, clef: ClefName): number {
  return (diatonicPosition(name) - CLEF_MIDDLE_LINE[clef]) / 2 + 3
}
