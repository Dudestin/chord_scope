import { KEY_OPTIONS } from '../theory/keys'
import type { KeyOption } from '../theory/keys'

interface CircleOfFifthsProps {
  value: KeyOption
  onChange: (key: KeyOption) => void
}

// Clockwise from 12 o'clock: C, then ascending fifths (sharps) on one side
// and ascending fourths (flats) on the other, meeting at the enharmonic
// pairs (B/Cb, F#/Gb, C#/Db) opposite C.
const SLOTS: (string | [string, string])[] = [
  'C',
  'G',
  'D',
  'A',
  'E',
  ['B', 'Cb'],
  ['F#', 'Gb'],
  ['C#', 'Db'],
  'Ab',
  'Eb',
  'Bb',
  'F',
]

interface Wedge {
  specs: string[]
  start: number
  end: number
}

const WEDGES: Wedge[] = SLOTS.map((slot, i) => {
  const base = i * 30
  return {
    specs: Array.isArray(slot) ? slot : [slot],
    start: base - 15,
    end: base + 15,
  }
})

const CX = 100
const CY = 100
const OUTER_R = 92
const INNER_R = 42
const LABEL_R = 68

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function wedgePath(start: number, end: number): string {
  const outerStart = polar(OUTER_R, start)
  const outerEnd = polar(OUTER_R, end)
  const innerEnd = polar(INNER_R, end)
  const innerStart = polar(INNER_R, start)
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_R} ${OUTER_R} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${INNER_R} ${INNER_R} 0 0 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function prettify(raw: string): string {
  const match = /^([A-G])(#|b)?(m?)$/.exec(raw)
  if (!match) return raw
  const [, letter, accidental, minor] = match
  const symbol = accidental === '#' ? '♯' : accidental === 'b' ? '♭' : ''
  return `${letter}${symbol}${minor}`
}

function nextSpec(wedge: Wedge, currentSpec: string): string {
  const index = wedge.specs.indexOf(currentSpec)
  if (index === -1) return wedge.specs[0]
  return wedge.specs[(index + 1) % wedge.specs.length]
}

export function CircleOfFifths({ value, onChange }: CircleOfFifthsProps) {
  return (
    <svg
      className="circle-of-fifths"
      viewBox="0 0 200 200"
      width={220}
      height={220}
      role="group"
      aria-label="Circle of fifths key selector"
    >
      {WEDGES.map((wedge) => {
        const selected = wedge.specs.includes(value.spec)
        const spec = selected ? value.spec : wedge.specs[0]
        const key = KEY_OPTIONS.find((k) => k.spec === spec)
        if (!key) return null
        const mid = (wedge.start + wedge.end) / 2
        const labelPos = polar(LABEL_R, mid)
        const handleClick = () => {
          const target = selected ? nextSpec(wedge, value.spec) : wedge.specs[0]
          const next = KEY_OPTIONS.find((k) => k.spec === target)
          if (next) onChange(next)
        }
        return (
          <g key={wedge.specs.join('/')}>
            <path
              className={selected ? 'wedge wedge-selected' : 'wedge'}
              d={wedgePath(wedge.start, wedge.end)}
              onClick={handleClick}
            >
              <title>
                {wedge.specs
                  .map((s) => KEY_OPTIONS.find((k) => k.spec === s)?.label)
                  .join(' / ')}
              </title>
            </path>
            <text
              className={[
                'wedge-label',
                wedge.specs.length > 1 && 'wedge-label-pair',
                selected && 'wedge-label-selected',
              ]
                .filter(Boolean)
                .join(' ')}
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              onClick={handleClick}
            >
              {wedge.specs.length > 1 ? (
                wedge.specs.map((s, i) => (
                  <tspan key={s} x={labelPos.x} dy={i === 0 ? '-0.55em' : '1.1em'}>
                    {prettify(s)}
                  </tspan>
                ))
              ) : (
                prettify(wedge.specs[0])
              )}
            </text>
          </g>
        )
      })}
      <circle className="circle-center" cx={CX} cy={CY} r={INNER_R - 2} />
      <text
        className="circle-center-label"
        x={CX}
        y={CY - 6}
        textAnchor="middle"
      >
        {prettify(value.label.split(' / ')[0])}
      </text>
      <text
        className="circle-center-sublabel"
        x={CX}
        y={CY + 12}
        textAnchor="middle"
      >
        {prettify(value.label.split(' / ')[1])}
      </text>
    </svg>
  )
}
