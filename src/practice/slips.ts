import { Note } from 'tonal'
import { CLEF_MIDDLE_LINE, diatonicPosition } from '../theory/clefs'
import type { ClefName } from '../theory/clefs'
import { keyAccidentals, nameAt } from './generate'
import type { TargetNote } from './generate'

// The likeliest reason a wrong key was played. On a staff: the key signature
// or an accidental was not applied, the right note in the wrong octave, the
// key next door, the note the other staff's clef puts on that line, or a line
// or space too far. For a chord symbol: the chord tone that came out wrong.
export type SlipKind =
  | 'signature'
  | 'accidental'
  | 'octave'
  | 'step'
  | 'clef'
  | 'third'
  | 'chordThird'
  | 'chordFifth'
  | 'chordSeventh'
  | 'other'

// Semitones spanned by a second and by a third.
const SECOND = 2
const THIRD = 4

// One wrong key says little by itself: between a treble and a bass staff the
// other clef's note lies a third away, so it is told from a miscounted line
// only by its direction. The counts over a session are what is worth reading.
export function staffSlip(
  played: number,
  target: TargetNote,
  keySpec: string,
  clef: ClefName,
  otherClef: ClefName,
): SlipKind {
  const { letter, acc, oct, step } = Note.get(target.name)
  const inKey = keyAccidentals(keySpec)
  const signed = inKey[step]
  const onLine = (accidental: string) => Note.midi(`${letter}${accidental}${oct}`)

  if (acc === signed && signed !== '' && played === onLine('')) return 'signature'
  if (acc !== signed && played === onLine(signed)) return 'accidental'
  if (played % 12 === target.midi % 12) return 'octave'

  const distance = Math.abs(played - target.midi)
  if (distance <= SECOND) return 'step'
  if (clef !== otherClef) {
    const misread = diatonicPosition(target.name) + CLEF_MIDDLE_LINE[otherClef] - CLEF_MIDDLE_LINE[clef]
    if (Note.chroma(nameAt(misread, inKey[misread % 7])) === played % 12) return 'clef'
  }
  return distance <= THIRD ? 'third' : 'other'
}

// `chromas` are the chord's pitch classes from the root up. A wrong key in
// reach of a chord tone is taken for that tone: the other third, an altered
// fifth, the other seventh.
export function chordSlip(played: number, chromas: number[]): SlipKind {
  const interval = (((played - chromas[0]) % 12) + 12) % 12
  if (interval === 3 || interval === 4) return 'chordThird'
  if (interval >= 6 && interval <= 8) return 'chordFifth'
  if (interval >= 10) return 'chordSeventh'
  return 'other'
}
