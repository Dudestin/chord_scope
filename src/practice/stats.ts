import type { ClefName } from '../theory/clefs'
import type { DrillKind } from './generate'
import type { StepResult } from './session'
import type { SlipKind } from './slips'

// Longer than this is the player being away, not reading.
const IDLE_MS = 15000
const MIN_ATTEMPTS = 3
const WEAK_LIMIT = 5
const SLOW_FACTOR = 1.5
// A missed item stays in focus until it has been played clean this often in a row.
const CLEAR_AFTER = 3
// Clean plays every key is credited with before it is shaded, so that one slip
// on a key asked for once does not look like a key missed every time.
const HEAT_PRIOR = 3
// The share of misses, counted that way, at which a key is as dark as it gets.
const HEAT_FULL = 0.5

export interface WeakItem {
  key: string
  label: string
  clef: ClefName | null
  attempts: number
  missed: number
  medianMs: number | null
}

export interface SlipCount {
  kind: SlipKind
  count: number
}

export interface KeyHeat {
  attempts: number
  missed: number
  // 0–1: how dark the key is drawn.
  level: number
}

export interface PracticeStats {
  completed: number
  clean: number
  medianMs: number | null
  streak: number
  bestStreak: number
  weak: WeakItem[]
  // Wrong keys by kind of mistake, most frequent first, the unexplained last.
  slips: SlipCount[]
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
  const slipCounts = new Map<SlipKind, number>()
  let clean = 0
  let streak = 0
  let bestStreak = 0

  for (const result of results) {
    const time = readingTime(result)
    if (time !== null) times.push(time)
    if (result.outcome === 'clean') clean++
    streak = result.outcome === 'clean' ? streak + 1 : 0
    bestStreak = Math.max(bestStreak, streak)
    for (const kind of result.slips) slipCounts.set(kind, (slipCounts.get(kind) ?? 0) + 1)

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

  const slips = [...slipCounts]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => Number(a.kind === 'other') - Number(b.kind === 'other') || b.count - a.count)

  return { completed: results.length, clean, medianMs, streak, bestStreak, weak, slips }
}

// The items (by `ResultItem.key`) the exercise should bring back: missed, and
// not yet played clean CLEAR_AFTER times running since.
export function focusItems(log: StepResult[], drill: DrillKind): Set<string> {
  const cleanSince = new Map<string, number>()
  for (const result of log) {
    if (result.drill !== drill) continue
    for (const { key, missed } of result.items) {
      const clean = cleanSince.get(key)
      if (missed) cleanSince.set(key, 0)
      else if (clean !== undefined) cleanSince.set(key, clean + 1)
    }
  }
  return new Set([...cleanSince].filter(([, clean]) => clean < CLEAR_AFTER).map(([key]) => key))
}

// The keys that have been missed in one drill, by how often for the times they
// were asked for. A key that was never missed is not in the map.
export function keyHeat(log: StepResult[], drill: DrillKind): Map<number, KeyHeat> {
  const counts = new Map<number, { attempts: number; missed: number }>()
  for (const result of log) {
    if (result.drill !== drill) continue
    for (const { midi, missed } of result.keys) {
      const count = counts.get(midi) ?? { attempts: 0, missed: 0 }
      count.attempts++
      if (missed) count.missed++
      counts.set(midi, count)
    }
  }

  const heat = new Map<number, KeyHeat>()
  for (const [midi, { attempts, missed }] of counts) {
    if (missed === 0) continue
    const level = Math.min(1, missed / (attempts + HEAT_PRIOR) / HEAT_FULL)
    heat.set(midi, { attempts, missed, level })
  }
  return heat
}
