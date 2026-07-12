import { Chord, Note } from 'tonal'

export interface ChordRole {
  degree: number
  label: string
  color: string
}

const ROLE_STYLES: Record<number, { label: string; color: string }> = {
  1: { label: 'R', color: '#d97706' },
  3: { label: '3', color: '#2563eb' },
  5: { label: '5', color: '#16a34a' },
  7: { label: '7', color: '#9333ea' },
}

const EXTENSION_COLOR = '#64748b'

function roleForDegree(degree: number): ChordRole {
  const style = ROLE_STYLES[degree]
  return style
    ? { degree, ...style }
    : { degree, label: String(degree), color: EXTENSION_COLOR }
}

export function computeChordRoles(
  midiNotes: number[],
  chordSymbol: string,
): Map<number, ChordRole> {
  const roles = new Map<number, ChordRole>()
  const chord = Chord.get(chordSymbol)
  if (chord.empty) return roles

  const chordChromas = chord.notes.map((n) => Note.chroma(n))

  for (const midi of midiNotes) {
    const chroma = midi % 12
    const index = chordChromas.indexOf(chroma)
    if (index === -1) continue
    const degreeMatch = /^\d+/.exec(chord.intervals[index])
    if (!degreeMatch) continue
    roles.set(midi, roleForDegree(Number(degreeMatch[0])))
  }

  return roles
}
