import type { ClefName } from '../theory/clefs'
import { generateMeasure, MEASURES } from './generate'
import type { DrillKind, PracticeConfig, Step, TargetNote } from './generate'

// Keys landing this soon after a step is completed belong to the keystroke
// that completed it: a late chord tone, a bounce, or a neighbouring key caught
// by accident. They never count towards the next step.
export const GESTURE_MS = 80
export const HINT_AFTER_MISSES = 3

export type Outcome = 'clean' | 'missed' | 'skipped'

export interface ResultItem {
  key: string
  label: string
  clef: ClefName | null
  missed: boolean
}

export interface StepResult {
  drill: DrillKind
  outcome: Outcome
  ms: number | null
  items: ResultItem[]
}

export interface Position {
  measure: number
  step: number
}

export interface SessionState {
  config: PracticeConfig
  seed: number
  measures: Step[][]
  position: Position
  // Outcomes of the steps already played in the current measure.
  outcomes: Outcome[]
  // Every key that is physically down.
  held: number[]
  // Accepted keys pressed during the current step that are still down.
  fresh: number[]
  // Wrong keys pressed during the current step.
  stepWrong: number[]
  // The latest wrong keystroke, shown until the next one or until the step is completed.
  wrongShown: number[]
  lastWrongAt: number | null
  // The step completed last, while its keystroke may still be arriving.
  prev: { step: Step; at: number } | null
  // When the current step became playable; null if it should not be timed.
  startedAt: number | null
  log: StepResult[]
}

export type SessionAction =
  | { type: 'noteOn' | 'noteOff'; note: number; time: number }
  | { type: 'configure'; config: PracticeConfig }
  | { type: 'skip' }
  | { type: 'release' }
  | { type: 'resetStats' }

function deal(config: PracticeConfig, seed: number): { measures: Step[][]; seed: number } {
  const measures: Step[][] = []
  for (let slot = 0; slot < MEASURES; slot++) {
    const dealt = generateMeasure(config, seed, slot, measures[slot - 1] ?? null)
    measures.push(dealt.steps)
    seed = dealt.seed
  }
  return { measures, seed }
}

export function initSession(config: PracticeConfig, seed: number): SessionState {
  return {
    config,
    ...deal(config, seed),
    position: { measure: 0, step: 0 },
    outcomes: [],
    held: [],
    fresh: [],
    stepWrong: [],
    wrongShown: [],
    lastWrongAt: null,
    prev: null,
    startedAt: null,
    log: [],
  }
}

export function currentStep(state: SessionState): Step {
  return state.measures[state.position.measure][state.position.step]
}

export function accepts(step: Step, note: number): boolean {
  return step.kind === 'symbol'
    ? step.chromas.includes(note % 12)
    : step.notes.some((target) => target.midi === note)
}

// Staff steps want every target down with at least one of them struck anew, so
// a repeated note has to be played again while a tone shared with the previous
// chord may stay down. Chord symbols want exactly the chord sounding, in any
// voicing, which is why a leftover key blocks them until it is released.
function isComplete(step: Step, held: number[], fresh: number[]): boolean {
  if (step.kind === 'symbol') {
    return (
      fresh.length > 0 &&
      held.every((note) => step.chromas.includes(note % 12)) &&
      step.chromas.every((chroma) => held.some((note) => note % 12 === chroma))
    )
  }
  return (
    step.notes.every((target) => held.includes(target.midi)) &&
    step.notes.some((target) => fresh.includes(target.midi))
  )
}

export function nearestTarget(targets: TargetNote[], note: number): TargetNote {
  return targets.reduce((best, target) =>
    Math.abs(target.midi - note) < Math.abs(best.midi - note) ? target : best,
  )
}

function itemKey(target: TargetNote, config: PracticeConfig): string {
  return `${target.staff === 'top' ? config.topClef : config.bottomClef}:${target.name}`
}

// Each wrong key counts against the target it landed closest to, which keeps
// a slip in one hand from marking the other hand's note as weak.
function resultItems(
  step: Step,
  config: PracticeConfig,
  wrong: number[],
  allMissed: boolean,
): ResultItem[] {
  if (step.kind === 'symbol') {
    return [
      { key: step.symbol, label: step.symbol, clef: null, missed: allMissed || wrong.length > 0 },
    ]
  }
  const blamed = new Set(wrong.map((note) => nearestTarget(step.notes, note).midi))
  return step.notes.map((target) => ({
    key: itemKey(target, config),
    label: target.name,
    clef: target.staff === 'top' ? config.topClef : config.bottomClef,
    missed: allMissed || blamed.has(target.midi),
  }))
}

function blameLast(log: StepResult[], step: Step, config: PracticeConfig, note: number): StepResult[] {
  const last = log[log.length - 1]
  if (!last) return log
  const key = step.kind === 'symbol' ? step.symbol : itemKey(nearestTarget(step.notes, note), config)
  const amended: StepResult = {
    ...last,
    outcome: last.outcome === 'clean' ? 'missed' : last.outcome,
    items: last.items.map((item) => (item.key === key ? { ...item, missed: true } : item)),
  }
  return [...log.slice(0, -1), amended]
}

// `time` is null when the step is skipped rather than played.
function finishStep(state: SessionState, time: number | null): SessionState {
  const step = currentStep(state)
  const outcome: Outcome =
    time === null ? 'skipped' : state.stepWrong.length === 0 ? 'clean' : 'missed'
  const result: StepResult = {
    drill: state.config.drill,
    outcome,
    ms: time !== null && state.startedAt !== null ? time - state.startedAt : null,
    items: resultItems(
      step,
      state.config,
      state.stepWrong,
      time === null || state.stepWrong.length >= HINT_AFTER_MISSES,
    ),
  }
  const next: SessionState = {
    ...state,
    fresh: [],
    stepWrong: [],
    wrongShown: [],
    lastWrongAt: null,
    prev: time === null ? null : { step, at: time },
    startedAt: time,
    log: [...state.log, result],
  }

  const { measure } = state.position
  if (state.position.step + 1 < state.measures[measure].length) {
    return {
      ...next,
      position: { measure, step: state.position.step + 1 },
      outcomes: [...state.outcomes, outcome],
    }
  }

  // The finished measure is dealt afresh straight away: it is what comes after
  // the measure the player is entering now, so it can be read ahead.
  const count = state.measures.length
  const dealt = generateMeasure(
    state.config,
    state.seed,
    measure,
    state.measures[(measure + count - 1) % count],
  )
  return {
    ...next,
    seed: dealt.seed,
    measures: state.measures.map((steps, slot) => (slot === measure ? dealt.steps : steps)),
    position: { measure: (measure + 1) % count, step: 0 },
    outcomes: [],
  }
}

function noteOn(state: SessionState, note: number, time: number): SessionState {
  const held = [...state.held.filter((n) => n !== note), note]

  if (state.prev && time - state.prev.at <= GESTURE_MS) {
    if (accepts(state.prev.step, note)) return { ...state, held }
    const outcomes = state.outcomes.map((outcome, i) =>
      i === state.outcomes.length - 1 && outcome === 'clean' ? 'missed' : outcome,
    )
    return {
      ...state,
      held,
      outcomes,
      log: blameLast(state.log, state.prev.step, state.config, note),
    }
  }

  const step = currentStep(state)
  if (!accepts(step, note)) {
    const sameKeystroke = state.lastWrongAt !== null && time - state.lastWrongAt <= GESTURE_MS
    return {
      ...state,
      held,
      stepWrong: [...state.stepWrong, note],
      wrongShown: sameKeystroke ? [...state.wrongShown, note] : [note],
      lastWrongAt: time,
    }
  }

  const next = { ...state, held, fresh: [...state.fresh.filter((n) => n !== note), note] }
  return isComplete(step, next.held, next.fresh) ? finishStep(next, time) : next
}

function noteOff(state: SessionState, note: number, time: number): SessionState {
  if (!state.held.includes(note)) return state
  const next = {
    ...state,
    held: state.held.filter((n) => n !== note),
    fresh: state.fresh.filter((n) => n !== note),
  }
  const step = currentStep(next)
  return step.kind === 'symbol' && isComplete(step, next.held, next.fresh)
    ? finishStep(next, time)
    : next
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'noteOn':
      return noteOn(state, action.note, action.time)
    case 'noteOff':
      return noteOff(state, action.note, action.time)
    case 'configure':
      if (action.config === state.config) return state
      return { ...initSession(action.config, state.seed), held: state.held, log: state.log }
    case 'skip':
      return finishStep(state, null)
    case 'release':
      return { ...state, held: [], fresh: [], wrongShown: [], lastWrongAt: null, prev: null, startedAt: null }
    case 'resetStats':
      return { ...state, prev: null, log: [] }
  }
}
