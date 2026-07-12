import type { ChordResult, NoteInfo } from '../theory/analyze'
import type { ChordRole } from '../theory/roles'

interface ChordInfoProps {
  chord: ChordResult | null
  notes: NoteInfo[]
  noteCount: number
  roles: Map<number, ChordRole>
}

export function ChordInfo({ chord, notes, noteCount, roles }: ChordInfoProps) {
  if (noteCount < 3) {
    return <p className="chord-info placeholder">&nbsp;</p>
  }

  if (!chord) {
    return <p className="chord-info placeholder">Unknown chord</p>
  }

  return (
    <div className="chord-info">
      <span className="chord-symbol">{chord.symbol}</span>
      {chord.alternates.length > 0 && (
        <span className="chord-alternates">
          {chord.alternates.join(' / ')}
        </span>
      )}
      {roles.size > 0 && (
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
      )}
    </div>
  )
}
