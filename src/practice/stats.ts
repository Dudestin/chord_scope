import type { ClefName } from '../theory/clefs'
import type { DrillKind } from './generate'
import type { StepResult } from './session'

// Longer than this is the player being away, not reading.
const IDLE_MS = 15000
const MIN_ATTEMPTS = 3
const WEAK_LIMIT = 5
const SLOW_FACTOR = 1.5

export interface WeakItem {
  key: string
  label: string
  clef: ClefName | null
  attempts: number
  missed: number
  medianMs: number | null
}

export interface PracticeStats {
  completed: number
  clean: number
  medianMs: number | null
  streak: number
  bestStreak: number
  weak: WeakItem[]
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Reading time only means something for steps answered right the first time.
function readingTime(result: StepResult): number | null {
  return result.outcome === 'clean' && result.ms !== null && result.ms <= IDLE_MS ? result.ms : null
}

export function computeStats(log: StepResult[], drill: DrillKind): PracticeStats {
  const results = log.filter((result) => result.drill === drill)
  const times: number[] = []
  const items = new Map<string, WeakItem & { times: number[] }>()
  let clean = 0
  let streak = 0
  let bestStreak = 0

  for (const result of results) {
    const time = readingTime(result)
    if (time !== null) times.push(time)
    if (result.outcome === 'clean') clean++
    streak = result.outcome === 'clean' ? streak + 1 : 0
    bestStreak = Math.max(bestStreak, streak)

    for (const { key, label, clef, missed } of result.items) {
      const item = items.get(key) ?? { key, label, clef, attempts: 0, missed: 0, medianMs: null, times: [] }
      item.attempts++
      if (missed) item.missed++
      if (time !== null) item.times.push(time)
      items.set(key, item)
    }
  }

  const medianMs = median(times)
  const weak = [...items.values()]
    .map(({ times: itemTimes, ...item }) => ({ ...item, medianMs: median(itemTimes) }))
    .filter(
      (item) =>
        item.attempts >= MIN_ATTEMPTS &&
        (item.missed > 0 ||
          (item.medianMs !== null && medianMs !== null && item.medianMs > medianMs * SLOW_FACTOR)),
    )
    .sort(
      (a, b) =>
        b.missed / b.attempts - a.missed / a.attempts || (b.medianMs ?? 0) - (a.medianMs ?? 0),
    )
    .slice(0, WEAK_LIMIT)

  return { completed: results.length, clean, medianMs, streak, bestStreak, weak }
}
