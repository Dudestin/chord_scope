function prettifyScale(name: string): string {
  return name.replace(/^([A-G])(#|b)/, (_, note, acc) =>
    note + (acc === '#' ? '♯' : '♭'),
  )
}

interface ScaleInfoProps {
  scales: string[]
  selectedScale?: string
}

export function ScaleInfo({ scales, selectedScale }: ScaleInfoProps) {
  return (
    <div className="scale-info">
      {scales.length > 0 && <span className="scale-info-label">Scale</span>}
      {scales.map((name) => (
        <span
          key={name}
          className={name === selectedScale ? 'scale-chip scale-chip-active' : 'scale-chip'}
        >
          {prettifyScale(name)}
        </span>
      ))}
    </div>
  )
}
