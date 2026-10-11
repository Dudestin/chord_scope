import { staffLine } from '../theory/clefs'
import type { ClefName } from '../theory/clefs'
import { spellForStaff } from './generate'
import type { StaffName } from './generate'
import { accepts, currentStep, HINT_AFTER_MISSES, nearestTarget } from './session'
import type { Outcome, Position, SessionState } from './session'

export type StepStatus = Outcome | 'pending'

export interface StaffKey {
  name: string
  // The key is down right now; only meaningful on the step under the cursor.
  down: boolean
}

export interface StaffStep {
  status: StepStatus
  top: StaffKey[]
  bottom: StaffKey[]
}

export interface StaffModel {
  keySignature: string
  topClef: ClefName
  bottomClef: ClefName
  measures: StaffStep[][]
  cursor: Position
  // The step under the cursor has already been missed.
  flawed: boolean
  // The latest wrong keys, spelled for the staff they are drawn on.
  wrong: Record<StaffName, string[]>
}

export interface PromptStep {
  symbol: string
  status: StepStatus
}

export interface PromptModel {
  rows: PromptStep[][]
  cursor: Position
  flawed: boolean
}

export type KeyMark = 'correct' | 'wrong' | 'neutral' | 'hint'

// Wrong keys further than this many lines from the middle of the staff are
// left to the keyboard readout instead of a tower of ledger lines.
const MAX_WRONG_DISTANCE = 6.5

const LOWEST_KEY = 21
const HIGHEST_KEY = 108

function statusAt(state: SessionState, measure: number, step: number): StepStatus {
  return measure === state.position.measure && step < state.outcomes.length
    ? state.outcomes[step]
    : 'pending'
}

function wrongOnStaff(state: SessionState): Record<StaffName, string[]> {
  const wrong: Record<StaffName, string[]> = { top: [], bottom: [] }
  const step = currentStep(state)
  if (step.kind !== 'notes') return wrong

  for (const midi of [...state.wrongShown].sort((a, b) => a - b)) {
    const { staff } = nearestTarget(step.notes, midi)
    const name = spellForStaff(midi, state.config.keySpec)
    const clef = staff === 'top' ? state.config.topClef : state.config.bottomClef
    if (Math.abs(staffLine(name, clef) - 3) <= MAX_WRONG_DISTANCE) wrong[staff].push(name)
  }
  return wrong
}

export function selectStaffModel(state: SessionState): StaffModel | null {
  if (state.config.drill === 'symbols') return null
  const { measure: cursorMeasure, step: cursorStep } = state.position

  return {
    keySignature: state.config.keySpec,
    topClef: state.config.topClef,
    bottomClef: state.config.bottomClef,
    measures: state.measures.map((steps, measure) =>
      steps.map((step, index) => {
        const underCursor = measure === cursorMeasure && index === cursorStep
        const keys = (staff: StaffName): StaffKey[] =>
          step.kind === 'notes'
            ? step.notes
                .filter((note) => note.staff === staff)
                .map((note) => ({
                  name: note.name,
                  down: underCursor && state.held.includes(note.midi),
                }))
            : []
        return { status: statusAt(state, measure, index), top: keys('top'), bottom: keys('bottom') }
      }),
    ),
    cursor: state.position,
    flawed: state.stepWrong.length > 0,
    wrong: wrongOnStaff(state),
  }
}

export function selectPromptModel(state: SessionState): PromptModel | null {
  if (state.config.drill !== 'symbols') return null
  return {
    rows: state.measures.map((steps, measure) =>
      steps.map((step, index) => ({
        symbol: step.kind === 'symbol' ? step.symbol : '',
        status: statusAt(state, measure, index),
      })),
    ),
    cursor: state.position,
    flawed: state.stepWrong.length > 0,
  }
}

export function selectKeyMarks(state: SessionState): Map<number, KeyMark> {
  const marks = new Map<number, KeyMark>()
  const step = currentStep(state)

  if (state.stepWrong.length >= HINT_AFTER_MISSES) {
    if (step.kind === 'notes') {
      for (const target of step.notes) marks.set(target.midi, 'hint')
    } else {
      for (let midi = LOWEST_KEY; midi <= HIGHEST_KEY; midi++) {
        if (step.chromas.includes(midi % 12)) marks.set(midi, 'hint')
      }
    }
  }
  for (const note of state.held) marks.set(note, accepts(step, note) ? 'correct' : 'neutral')
  for (const note of state.stepWrong) {
    if (state.held.includes(note)) marks.set(note, 'wrong')
  }
  for (const note of state.wrongShown) marks.set(note, 'wrong')
  return marks
}
