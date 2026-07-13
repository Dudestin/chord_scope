import type { TensionResult } from '../theory/analyze'

interface TensionInfoProps {
  tension: TensionResult | null
}

function prettifyNote(note: string): string {
  return note.replace('#', '♯').replace('b', '♭')
}

export function TensionInfo({ tension }: TensionInfoProps) {
  if (!tension || (tension.tensions.length === 0 && tension.avoids.length === 0)) {
    return <div className="tension-info" />
  }

  return (
    <div className="tension-info">
      {tension.tensions.length > 0 && (
        <div className="tension-group">
          <span className="tension-group-label tension-group-label-t">T</span>
          {tension.tensions.map((note) => (
            <span key={note} className="tension-chip">
              {prettifyNote(note)}
            </span>
          ))}
        </div>
      )}
      {tension.avoids.length > 0 && (
        <div className="tension-group">
          <span className="tension-group-label tension-group-label-avoid">✕</span>
          {tension.avoids.map((note) => (
            <span key={note} className="avoid-chip">
              {prettifyNote(note)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
