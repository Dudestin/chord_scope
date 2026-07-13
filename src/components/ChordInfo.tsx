import type { ChordResult, NoteInfo } from '../theory/analyze'
import type { ChordRole } from '../theory/roles'

function prettifyChordSymbol(symbol: string): string {
  return symbol
    .replace(/m7b5/g, 'ø7')       // half-diminished
    .replace(/#/g, '♯')            // sharps
    .replace(/b(?=\d)/g, '♭')     // flat intervals: b5, b9, b13 …
    .replace(/([A-G])b/g, '$1♭')  // root flats: Bb, Eb, Ab …
}

interface ChordInfoProps {
  chord: ChordResult | null
  notes: NoteInfo[]
  noteCount: number
  roles: Map<number, ChordRole>
  romanNumeral?: string | null
}

export function ChordInfo({ chord, notes, noteCount, roles, romanNumeral }: ChordInfoProps) {
  if (noteCount < 3) {
    return <p className="chord-info placeholder">&nbsp;</p>
  }

  if (!chord) {
    return <p className="chord-info placeholder">Unknown chord</p>
  }

  return (
    <div className="chord-info">
      <div className="chord-header">
        <span className="chord-symbol">{prettifyChordSymbol(chord.symbol)}</span>
        {romanNumeral && (
          <span className="chord-roman-numeral">{romanNumeral}</span>
        )}
      </div>
      <span className="chord-alternates">
        {chord.alternates.length > 0 ? chord.alternates.map(prettifyChordSymbol).join(' / ') : ' '}
      </span>
      <div className="chord-roles">
        {notes.map((note) => {
          const role = roles.get(note.midi)
          if (!role) return null
          return (
            <span
              key={note.midi}
              className="chord-role-chip"
              style={{ background: role.color }}
            >
              {note.name} {role.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
