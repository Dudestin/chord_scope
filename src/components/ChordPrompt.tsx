import type { PromptModel } from '../practice/view'

function prettifyChordSymbol(symbol: string): string {
  return symbol
    .replace(/m7b5/g, 'ø7')
    .replace(/#/g, '♯')
    .replace(/b(?=\d)/g, '♭')
    .replace(/([A-G])b/g, '$1♭')
}

interface ChordPromptProps {
  model: PromptModel
}

export function ChordPrompt({ model }: ChordPromptProps) {
  return (
    <div className="staff-view chord-prompt" role="group" aria-label="Chord symbols to play">
      {model.rows.map((row, measure) => {
        const currentRow = measure === model.cursor.measure
        return (
          <div
            key={measure}
            className={currentRow ? 'chord-prompt-row chord-prompt-row-current' : 'chord-prompt-row'}
          >
            {row.map((step, index) => {
              const current = currentRow && index === model.cursor.step
              return (
                <span
                  key={index}
                  className={[
                    'chord-prompt-bar',
                    `chord-prompt-bar-${step.status}`,
                    current && 'chord-prompt-bar-current',
                    current && model.flawed && 'chord-prompt-bar-flawed',
                    step.hidden && 'chord-prompt-bar-hidden',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={current ? 'step' : undefined}
                >
                  {step.hidden ? '\u00a0' : prettifyChordSymbol(step.symbol)}
                </span>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
