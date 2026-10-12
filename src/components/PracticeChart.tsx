import { useMemo, useState } from 'react'
import type { PointerEvent } from 'react'
import type { DrillKind } from '../practice/generate'
import type { TimelinePoint } from '../practice/stats'

interface PracticeChartProps {
  timeline: TimelinePoint[]
  drill: DrillKind
}

// What a step of each drill is called, one and many.
const UNITS: Record<DrillKind, [string, string]> = {
  notes: ['Note', 'Notes'],
  hands: ['Pair', 'Pairs'],
  chords: ['Chord', 'Chords'],
  symbols: ['Chord', 'Chords'],
  cadence: ['Chord', 'Chords'],
}

const SPEED_HINT = 'Played right the first time, per minute, over the last dozen'
const RAW_HINT = 'Played per minute, right or wrong, over the last three'
const ERROR_HINT = 'Wrong keys on each one'

const WIDTH = 680
const LEFT = 34
// Room for the figure at the end of the speed line.
const RIGHT = 40
const TOP = 10
const PLOT_HEIGHT = 140
const PLOT_WIDTH = WIDTH - LEFT - RIGHT
const BASELINE = TOP + PLOT_HEIGHT
// Wrong keys get a lane of their own under the plot rather than a second scale on it.
const LANE_HEIGHT = 24
const LANE_BASE = BASELINE + 8 + LANE_HEIGHT
const HEIGHT = LANE_BASE + 36
// A wrong key is this tall in the lane, up to as many as fit.
const ERROR_UNIT = 6
const ERROR_CAP = LANE_HEIGHT / ERROR_UNIT
// The plot starts out this many steps wide and is only squeezed after that.
const MIN_STEPS = 20
const MIN_SPEED = 30

// A round interval that puts about `count` ticks on an axis reaching `max`.
function tickStep(max: number, count: number): number {
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  return [1, 2, 5, 10].map((m) => m * magnitude).find((step) => step >= rough) ?? rough
}

function ticks(from: number, to: number, step: number): number[] {
  const values: number[] = []
  for (let value = from; value <= to; value += step) values.push(value)
  return values
}

interface Geometry {
  x: (index: number) => number
  y: (value: number) => number
  xTicks: number[]
  yTicks: number[]
  speedPath: string
  rawPath: string
  rawArea: string
  barWidth: number
  // The last step that has a speed, where the line ends.
  end: number
}

function linePath(
  timeline: TimelinePoint[],
  value: (point: TimelinePoint) => number | null,
  x: Geometry['x'],
  y: Geometry['y'],
): string {
  let path = ''
  timeline.forEach((point, index) => {
    const v = value(point)
    if (v !== null) path += `${path ? 'L' : 'M'}${x(index).toFixed(1)} ${y(v).toFixed(1)}`
  })
  return path
}

function layOut(timeline: TimelinePoint[]): Geometry {
  const span = Math.max(MIN_STEPS, timeline.length)
  const top = Math.max(MIN_SPEED, ...timeline.map((point) => Math.max(point.speed ?? 0, point.raw ?? 0)))
  const yStep = tickStep(top, 4)
  const yMax = Math.ceil(top / yStep) * yStep
  const xStep = tickStep(span, 8)

  const x = (index: number) => LEFT + (index / (span - 1)) * PLOT_WIDTH
  const y = (value: number) => BASELINE - (value / yMax) * PLOT_HEIGHT
  const rawPath = linePath(timeline, (point) => point.raw, x, y)
  const first = timeline.findIndex((point) => point.raw !== null)
  const end = timeline.findLastIndex((point) => point.speed !== null)

  return {
    x,
    y,
    xTicks: ticks(xStep, span, xStep),
    yTicks: ticks(0, yMax, yStep),
    speedPath: linePath(timeline, (point) => point.speed, x, y),
    rawPath,
    rawArea: rawPath && `${rawPath}L${x(end).toFixed(1)} ${BASELINE}L${x(first).toFixed(1)} ${BASELINE}Z`,
    barWidth: Math.max(1.5, Math.min(4, (PLOT_WIDTH / (span - 1)) * 0.5)),
    end,
  }
}

function figure(value: number | null): string {
  return value === null ? '–' : String(Math.round(value))
}

export function PracticeChart({ timeline, drill }: PracticeChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const geometry = useMemo(() => layOut(timeline), [timeline])
  const { x, y, end } = geometry
  const [unit, units] = UNITS[drill]
  // The log can be cleared from under the pointer.
  const shown = hover !== null && hover < timeline.length ? hover : null
  const last = end >= 0 ? timeline[end] : null

  // The pointer only has to be nearest to a step, not on a line.
  const handleMove = (event: PointerEvent<SVGSVGElement>) => {
    if (timeline.length === 0) return
    const box = event.currentTarget.getBoundingClientRect()
    const at = ((event.clientX - box.left) / box.width) * WIDTH
    const span = Math.max(MIN_STEPS, timeline.length)
    const index = Math.round(((at - LEFT) / PLOT_WIDTH) * (span - 1))
    setHover(Math.max(0, Math.min(timeline.length - 1, index)))
  }

  return (
    <div className="practice-chart">
      <div className="practice-chart-head">
        <span>{units} per minute</span>
        <span className="practice-chart-legend">
          <span title={SPEED_HINT}>
            <i className="practice-chart-key practice-chart-key-speed" />
            Speed
          </span>
          <span title={RAW_HINT}>
            <i className="practice-chart-key practice-chart-key-raw" />
            Raw
          </span>
          <span title={ERROR_HINT}>
            <i className="practice-chart-key practice-chart-key-error" />
            Wrong keys
          </span>
        </span>
      </div>
      <div className="practice-chart-plot">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={
            last
              ? `Speed over ${timeline.length} ${units.toLowerCase()}: now ${figure(last.speed)} per minute`
              : 'Speed chart, empty'
          }
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
        >
          {geometry.yTicks.map((value) => (
            <g key={value}>
              <line className="practice-chart-grid" x1={LEFT} x2={WIDTH - RIGHT} y1={y(value)} y2={y(value)} />
              <text className="practice-chart-tick" x={LEFT - 8} y={y(value)} textAnchor="end" dominantBaseline="central">
                {value}
              </text>
            </g>
          ))}
          <line className="practice-chart-grid" x1={LEFT} x2={WIDTH - RIGHT} y1={LANE_BASE} y2={LANE_BASE} />
          {geometry.xTicks.map((value) => (
            <text key={value} className="practice-chart-tick" x={x(value - 1)} y={LANE_BASE + 14} textAnchor="middle">
              {value}
            </text>
          ))}
          <text className="practice-chart-tick" x={LEFT + PLOT_WIDTH / 2} y={HEIGHT - 4} textAnchor="middle">
            {units} played
          </text>

          {last === null && (
            <text className="practice-chart-empty" x={LEFT + PLOT_WIDTH / 2} y={TOP + PLOT_HEIGHT / 2} textAnchor="middle">
              Your speed is drawn here as you play.
            </text>
          )}

          <path className="practice-chart-raw-area" d={geometry.rawArea} />
          <path className="practice-chart-raw" d={geometry.rawPath} />
          <path className="practice-chart-speed" d={geometry.speedPath} />
          {timeline.map(
            (point, index) =>
              point.errors > 0 && (
                <rect
                  key={index}
                  className="practice-chart-error"
                  x={x(index) - geometry.barWidth / 2}
                  y={LANE_BASE - Math.min(point.errors, ERROR_CAP) * ERROR_UNIT}
                  width={geometry.barWidth}
                  height={Math.min(point.errors, ERROR_CAP) * ERROR_UNIT}
                  rx={Math.min(1, geometry.barWidth / 2)}
                />
              ),
          )}

          {last?.speed != null && shown === null && (
            <>
              <circle className="practice-chart-dot practice-chart-dot-speed" cx={x(end)} cy={y(last.speed)} r={4} />
              <text className="practice-chart-figure" x={x(end) + 9} y={y(last.speed)} dominantBaseline="central">
                {figure(last.speed)}
              </text>
            </>
          )}

          {shown !== null && (
            <>
              <line className="practice-chart-crosshair" x1={x(shown)} x2={x(shown)} y1={TOP} y2={LANE_BASE} />
              {timeline[shown].raw !== null && (
                <circle className="practice-chart-dot practice-chart-dot-raw" cx={x(shown)} cy={y(timeline[shown].raw)} r={4} />
              )}
              {timeline[shown].speed !== null && (
                <circle className="practice-chart-dot practice-chart-dot-speed" cx={x(shown)} cy={y(timeline[shown].speed)} r={4} />
              )}
            </>
          )}
        </svg>
        {shown !== null && (
          <div
            className={
              x(shown) > WIDTH / 2
                ? 'practice-chart-tooltip practice-chart-tooltip-left'
                : 'practice-chart-tooltip'
            }
            style={{ left: `${(x(shown) / WIDTH) * 100}%` }}
          >
            <span className="practice-chart-tooltip-title">
              {unit} {shown + 1}
            </span>
            <i className="practice-chart-key practice-chart-key-speed" />
            <b>{figure(timeline[shown].speed)}</b>
            <span>Speed</span>
            <i className="practice-chart-key practice-chart-key-raw" />
            <b>{figure(timeline[shown].raw)}</b>
            <span>Raw</span>
            <i className="practice-chart-key practice-chart-key-error" />
            <b>{timeline[shown].errors}</b>
            <span>Wrong keys</span>
          </div>
        )}
      </div>
    </div>
  )
}
