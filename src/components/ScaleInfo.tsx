function prettifyScale(name: string): string {
  return name.replace(/^([A-G])(#|b)/, (_, note, acc) =>
    note + (acc === '#' ? '♯' : '♭'),
  )
}

interface ScaleInfoProps {
  scales: string[]
}

export function ScaleInfo({ scales }: ScaleInfoProps) {
  if (scales.length === 0) return <div className="scale-info" />

  return (
    <div className="scale-info">
      <span className="scale-info-label">Scale</span>
      {scales.map((name) => (
        <span key={name} className="scale-chip">
          {prettifyScale(name)}
        </span>
      ))}
    </div>
  )
}
