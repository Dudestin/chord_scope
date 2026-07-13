import { KEY_OPTIONS } from '../theory/keys'
import type { KeyOption } from '../theory/keys'

interface CircleOfFifthsProps {
  value: KeyOption
  mode: 'major' | 'minor'
  onChange: (key: KeyOption, mode: 'major' | 'minor') => void
}

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

function relativeMinor(majorSpec: string): string {
  const opt = KEY_OPTIONS.find((k) => k.spec === majorSpec)
  if (!opt) return ''
  return opt.label.split(' / ')[1]
}

interface Wedge {
  majorSpecs: string[]
  minorSpecs: string[]
  start: number
  end: number
}

const WEDGES: Wedge[] = SLOTS.map((slot, i) => {
  const base = i * 30
  const majorSpecs = Array.isArray(slot) ? slot : [slot]
  const minorSpecs = majorSpecs.map(relativeMinor)
  return { majorSpecs, minorSpecs, start: base - 15, end: base + 15 }
})

const CX = 100
const CY = 100
const OUTER_R = 92
const MAJOR_INNER_R = 63
const MINOR_INNER_R = 36
const MAJOR_LABEL_R = 77
const MINOR_LABEL_R = 50

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function wedgePath(outerR: number, innerR: number, start: number, end: number): string {
  const outerStart = polar(outerR, start)
  const outerEnd = polar(outerR, end)
  const innerEnd = polar(innerR, end)
  const innerStart = polar(innerR, start)
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 0 0 ${innerStart.x} ${innerStart.y}`,
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

function nextSpec(specs: string[], currentSpec: string): string {
  const index = specs.indexOf(currentSpec)
  if (index === -1) return specs[0]
  return specs[(index + 1) % specs.length]
}

export function CircleOfFifths({ value, mode, onChange }: CircleOfFifthsProps) {
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
        const selected = wedge.majorSpecs.includes(value.spec)
        const activeSpec = selected ? value.spec : wedge.majorSpecs[0]
        const key = KEY_OPTIONS.find((k) => k.spec === activeSpec)
        if (!key) return null

        const mid = (wedge.start + wedge.end) / 2
        const majorLabelPos = polar(MAJOR_LABEL_R, mid)
        const minorLabelPos = polar(MINOR_LABEL_R, mid)

        const isCSlot = wedge.majorSpecs.length === 1 && wedge.majorSpecs[0] === 'C'

        const handleMajorClick = () => {
          if (isCSlot && selected && mode === 'major') {
            // C has no enharmonic key — toggle sharps display preference instead
            const base = KEY_OPTIONS.find((k) => k.spec === 'C')!
            onChange({ ...base, sharps: !value.sharps }, 'major')
            return
          }
          const target =
            selected && mode === 'major'
              ? nextSpec(wedge.majorSpecs, value.spec)
              : selected
                ? value.spec
                : wedge.majorSpecs[0]
          const next = KEY_OPTIONS.find((k) => k.spec === target)
          if (next) onChange(next, 'major')
        }

        const handleMinorClick = () => {
          if (isCSlot && selected && mode === 'minor') {
            const base = KEY_OPTIONS.find((k) => k.spec === 'C')!
            onChange({ ...base, sharps: !value.sharps }, 'minor')
            return
          }
          const target =
            selected && mode === 'minor'
              ? nextSpec(wedge.majorSpecs, value.spec)
              : selected
                ? value.spec
                : wedge.majorSpecs[0]
          const next = KEY_OPTIONS.find((k) => k.spec === target)
          if (next) onChange(next, 'minor')
        }



        return (
          <g key={wedge.majorSpecs.join('/')}>
            {/* Major (outer) ring */}
            <path
              className={
                selected && mode === 'major' ? 'wedge wedge-selected' : 'wedge'
              }
              d={wedgePath(OUTER_R, MAJOR_INNER_R, wedge.start, wedge.end)}
              onClick={handleMajorClick}
            >
              <title>
                {wedge.majorSpecs
                  .map((s) => KEY_OPTIONS.find((k) => k.spec === s)?.label)
                  .join(' / ')}
              </title>
            </path>
            <text
              className={[
                'wedge-label',
                (wedge.majorSpecs.length > 1 || (isCSlot && selected)) && 'wedge-label-pair',
                selected && mode === 'major' && 'wedge-label-selected',
              ]
                .filter(Boolean)
                .join(' ')}
              x={majorLabelPos.x}
              y={majorLabelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              onClick={handleMajorClick}
            >
              {wedge.majorSpecs.length > 1 ? (
                wedge.majorSpecs.map((s, i) => (
                  <tspan key={s} x={majorLabelPos.x} dy={i === 0 ? '-0.55em' : '1.1em'}>
                    {prettify(s)}
                  </tspan>
                ))
              ) : isCSlot && selected ? (
                <>
                  <tspan x={majorLabelPos.x} dy="-0.4em">C</tspan>
                  <tspan x={majorLabelPos.x} dy="1.0em">{value.sharps ? '(♯)' : '(♭)'}</tspan>
                </>
              ) : (
                prettify(wedge.majorSpecs[0])
              )}
            </text>

            {/* Minor (inner) ring */}
            <path
              className={
                selected && mode === 'minor'
                  ? 'wedge wedge-minor wedge-selected'
                  : 'wedge wedge-minor'
              }
              d={wedgePath(MAJOR_INNER_R, MINOR_INNER_R, wedge.start, wedge.end)}
              onClick={handleMinorClick}
            />
            <text
              className={[
                'wedge-label wedge-label-minor',
                selected && mode === 'minor' && 'wedge-label-selected',
              ]
                .filter(Boolean)
                .join(' ')}
              x={minorLabelPos.x}
              y={minorLabelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              onClick={handleMinorClick}
            >
              {wedge.minorSpecs.length > 1 ? (
                wedge.minorSpecs.map((s, i) => (
                  <tspan key={s} x={minorLabelPos.x} dy={i === 0 ? '-0.55em' : '1.1em'}>
                    {prettify(s)}
                  </tspan>
                ))
              ) : isCSlot && selected ? (
                <>
                  <tspan x={minorLabelPos.x} dy="-0.55em">{prettify(wedge.minorSpecs[0])}</tspan>
                  <tspan x={minorLabelPos.x} dy="1.1em">{value.sharps ? '♯' : '♭'}</tspan>
                </>
              ) : (
                prettify(wedge.minorSpecs[0])
              )}
            </text>
          </g>
        )
      })}

      <circle className="circle-center" cx={CX} cy={CY} r={MINOR_INNER_R - 2} />
      <text
        className="circle-center-label"
        x={CX}
        y={CY - 6}
        textAnchor="middle"
        opacity={mode === 'major' ? 1 : 0.35}
      >
        {prettify(value.label.split(' / ')[0])}
      </text>
      <text
        className="circle-center-sublabel"
        x={CX}
        y={CY + 10}
        textAnchor="middle"
        opacity={mode === 'minor' ? 1 : 0.35}
        fontWeight={mode === 'minor' ? 600 : undefined}
      >
        {prettify(value.label.split(' / ')[1])}
      </text>
    </svg>
  )
}
