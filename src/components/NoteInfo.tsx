import type { NoteInfo as NoteInfoData } from '../theory/analyze'
import type { ChordRole } from '../theory/roles'

function prettifyNoteName(name: string): string {
  return name.replace(/#/, '♯').replace(/([A-G])b/, '$1♭')
}

interface NoteInfoProps {
  notes: NoteInfoData[]
  roles: Map<number, ChordRole>
}

export function NoteInfo({ notes, roles }: NoteInfoProps) {
  if (notes.length === 0) {
    return <p className="note-info empty">Play a note</p>
  }

  return (
    <div className="note-info">
      {notes.map((note) => {
        const role = roles.get(note.midi)
        return (
          <span
            key={note.midi}
            className="note-pill"
            style={
              role
                ? { background: role.color, borderColor: role.color, color: '#fff' }
                : undefined
            }
          >
            {prettifyNoteName(note.name)}
            {role && <span className="note-pill-role">{role.label}</span>}
          </span>
        )
      })}
    </div>
  )
}
