import { useCallback, useEffect, useMemo, useReducer } from 'react'
import type { MidiState } from '../midi/useMidi'
import type { PracticeConfig } from './generate'
import { initSession, sessionReducer } from './session'
import { computeStats } from './stats'
import type { PracticeStats } from './stats'
import { selectKeyMarks, selectPromptModel, selectStaffModel } from './view'
import type { KeyMark, PromptModel, StaffModel } from './view'

export interface Practice {
  staff: StaffModel | null
  prompt: PromptModel | null
  marks: Map<number, KeyMark>
  stats: PracticeStats
  skip: () => void
  resetStats: () => void
}

function createSession(config: PracticeConfig) {
  return initSession(config, Math.floor(Math.random() * 0x100000000))
}

// Most key events leave the score as it was. Going through JSON keeps a
// model's identity until its content changes, so the staff is only redrawn
// when there is something new to draw.
function useStableModel<T>(model: T): T {
  const json = JSON.stringify(model)
  return useMemo(() => JSON.parse(json) as T, [json])
}

export function usePractice(
  subscribe: MidiState['subscribe'],
  config: PracticeConfig,
  enabled: boolean,
): Practice {
  const [session, dispatch] = useReducer(sessionReducer, config, createSession)

  useEffect(() => {
    dispatch({ type: 'configure', config })
  }, [config])

  // Only listens while the practice view is up; leaving it drops whatever was
  // held, so playing in the analysis view never moves the exercise along.
  useEffect(() => {
    if (!enabled) return
    const unsubscribe = subscribe(({ type, note, time }) =>
      dispatch({ type: type === 'on' ? 'noteOn' : 'noteOff', note, time }),
    )
    return () => {
      unsubscribe()
      dispatch({ type: 'release' })
    }
  }, [enabled, subscribe])

  const staff = useStableModel(useMemo(() => selectStaffModel(session), [session]))
  const prompt = useStableModel(useMemo(() => selectPromptModel(session), [session]))
  const marks = useMemo(() => selectKeyMarks(session), [session])
  const stats = useMemo(
    () => computeStats(session.log, session.config.drill),
    [session.log, session.config.drill],
  )
  const skip = useCallback(() => dispatch({ type: 'skip' }), [])
  const resetStats = useCallback(() => dispatch({ type: 'resetStats' }), [])

  return { staff, prompt, marks, stats, skip, resetStats }
}
