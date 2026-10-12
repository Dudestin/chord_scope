import type { ClefName } from '../theory/clefs'
import { nextKeyByFifth } from '../theory/keys'
import { generateMeasure, noteKey } from './generate'
import type { DrillKind, PracticeConfig, StaffName, Step, TargetNote } from './generate'
import { chordSlip, staffSlip } from './slips'
import type { SlipKind } from './slips'
import { focusItems } from './stats'

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
  // One entry per wrong key: what kind of mistake it was.
  slips: SlipKind[]
}

export interface Position {
  measure: number
  step: number
}

export interface SessionState {
  config: PracticeConfig
  seed: number
  measures: Step[][]
  // Key signature of each measure; they only differ while cadences cycle.
  keys: string[]
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
  // The step completed last and the key of its measure, while its keystroke
  // may still be arriving.
  prev: { step: Step; key: string; at: number } | null
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

// The key of the measure played after one in `key`.
function keyAfter(config: PracticeConfig, key: string): string {
  return config.drill === 'cadence' && config.cycleKeys ? nextKeyByFifth(key) : config.keySpec
}

// What the next measure should favour: whatever the log shows as still shaky.
function focusOf(config: PracticeConfig, log: StepResult[]): ReadonlySet<string> | undefined {
  return config.repeatMisses ? focusItems(log, config.drill) : undefined
}

function deal(
  config: PracticeConfig,
  seed: number,
  log: StepResult[],
): { measures: Step[][]; keys: string[]; seed: number } {
  const focus = focusOf(config, log)
  const measures: Step[][] = []
  const keys: string[] = []
  for (let slot = 0; slot < config.measures; slot++) {
    const key = slot === 0 ? config.keySpec : keyAfter(config, keys[slot - 1])
    const dealt = generateMeasure(config, seed, measures[slot - 1] ?? null, key, focus)
    measures.push(dealt.steps)
    keys.push(key)
    seed = dealt.seed
  }
  return { measures, keys, seed }
}

export function initSession(
  config: PracticeConfig,
  seed: number,
  log: StepResult[] = [],
): SessionState {
  return {
    config,
    ...deal(config, seed, log),
    position: { measure: 0, step: 0 },
    outcomes: [],
    held: [],
    fresh: [],
    stepWrong: [],
    wrongShown: [],
    lastWrongAt: null,
    prev: null,
    startedAt: null,
    log,
  }
}

export function currentStep(state: SessionState): Step {
  return state.measures[state.position.measure][state.position.step]
}

// The step after the cursor, if it is on show yet: the last step of an only
// measure has nothing after it until it is finished.
function stepAhead(state: SessionState): Step | null {
  const { measure, step } = state.position
  const count = state.measures.length
  return (
    state.measures[measure][step + 1] ??
    (count > 1 ? state.measures[(measure + 1) % count][0] : null)
  )
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

function clefOf(config: PracticeConfig, staff: StaffName): ClefName {
  return staff === 'top' ? config.topClef : config.bottomClef
}

function itemKey(target: TargetNote, config: PracticeConfig): string {
  return noteKey(clefOf(config, target.staff), target.name)
}

// What a chord is tracked as when it is read as one thing rather than note by
// note: a chord symbol, or a cadence chord in its key.
function chordLabel(step: Step): string | null {
  if (step.kind === 'symbol') return step.symbol
  return step.chord ? `${step.chord.key} ${step.chord.numeral}` : null
}

// Each wrong key counts against the target it landed closest to, which keeps
// a slip in one hand from marking the other hand's note as weak.
function resultItems(
  step: Step,
  config: PracticeConfig,
  wrong: number[],
  allMissed: boolean,
): ResultItem[] {
  const label = chordLabel(step)
  if (label !== null) {
    return [{ key: label, label, clef: null, missed: allMissed || wrong.length > 0 }]
  }
  const targets = step.kind === 'notes' ? step.notes : []
  const blamed = new Set(wrong.map((note) => nearestTarget(targets, note).midi))
  return targets.map((target) => ({
    key: itemKey(target, config),
    label: target.name,
    clef: clefOf(config, target.staff),
    missed: allMissed || blamed.has(target.midi),
  }))
}

// A wrong key on a staff is read against the target it landed closest to, in
// the key of its measure and with the other staff's clef in mind.
function slipOf(step: Step, config: PracticeConfig, key: string, note: number): SlipKind {
  if (step.kind === 'symbol') return chordSlip(note, step.chromas)
  const target = nearestTarget(step.notes, note)
  const other = clefOf(config, target.staff === 'top' ? 'bottom' : 'top')
  return staffSlip(note, target, key, clefOf(config, target.staff), other)
}

function blameLast(
  log: StepResult[],
  { step, key }: { step: Step; key: string },
  config: PracticeConfig,
  note: number,
): StepResult[] {
  const last = log[log.length - 1]
  if (!last) return log
  const blamed =
    chordLabel(step) ??
    (step.kind === 'notes' ? itemKey(nearestTarget(step.notes, note), config) : null)
  const amended: StepResult = {
    ...last,
    outcome: last.outcome === 'clean' ? 'missed' : last.outcome,
    items: last.items.map((item) => (item.key === blamed ? { ...item, missed: true } : item)),
    slips: [...last.slips, slipOf(step, config, key, note)],
  }
  return [...log.slice(0, -1), amended]
}

// `time` is null when the step ends without being played: skipped, or `left`
// as it is after a slip, which is a miss like one that was put right.
function finishStep(state: SessionState, time: number | null, left = false): SessionState {
  const step = currentStep(state)
  const stepKey = state.keys[state.position.measure]
  const skipped = time === null && !left
  const outcome: Outcome = skipped ? 'skipped' : state.stepWrong.length === 0 ? 'clean' : 'missed'
  const result: StepResult = {
    drill: state.config.drill,
    outcome,
    ms: time !== null && state.startedAt !== null ? time - state.startedAt : null,
    items: resultItems(
      step,
      state.config,
      state.stepWrong,
      skipped || state.stepWrong.length >= HINT_AFTER_MISSES,
    ),
    slips: state.stepWrong.map((note) => slipOf(step, state.config, stepKey, note)),
  }
  const next: SessionState = {
    ...state,
    fresh: [],
    stepWrong: [],
    wrongShown: [],
    lastWrongAt: null,
    prev: time === null ? null : { step, key: stepKey, at: time },
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
  // the last of the measures still to be played, so it can be read ahead.
  const count = state.measures.length
  const before = (measure + count - 1) % count
  const key = keyAfter(state.config, state.keys[before])
  const dealt = generateMeasure(
    state.config,
    state.seed,
    state.measures[before],
    key,
    focusOf(state.config, next.log),
  )
  return {
    ...next,
    seed: dealt.seed,
    measures: state.measures.map((steps, slot) => (slot === measure ? dealt.steps : steps)),
    keys: state.keys.map((old, slot) => (slot === measure ? key : old)),
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
      log: blameLast(state.log, state.prev, state.config, note),
    }
  }

  const step = currentStep(state)
  if (!accepts(step, note)) {
    const sameKeystroke = state.lastWrongAt !== null && time - state.lastWrongAt <= GESTURE_MS
    // Playing through: once a step has gone wrong, a key of the next step
    // leaves it as it is and counts there instead. A key that comes down with
    // the wrong keystroke is part of the slip, not a way on.
    const ahead = state.config.playThrough ? stepAhead(state) : null
    if (ahead && state.stepWrong.length > 0 && !sameKeystroke && accepts(ahead, note)) {
      return noteOn(finishStep(state, null, true), note, time)
    }
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
      return { ...initSession(action.config, state.seed, state.log), held: state.held }
    case 'skip':
      return finishStep(state, null)
    case 'release':
      return { ...state, held: [], fresh: [], wrongShown: [], lastWrongAt: null, prev: null, startedAt: null }
    case 'resetStats':
      return { ...state, prev: null, log: [] }
  }
}
