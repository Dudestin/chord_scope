import { useCallback, useEffect, useMemo, useReducer } from 'react'
import type { MidiState } from '../midi/useMidi'
import type { PracticeConfig } from './generate'
import { initSession, sessionReducer } from './session'
import { computeStats, keyHeat } from './stats'
import type { KeyHeat, PracticeStats } from './stats'
import { currentKey, selectKeyMarks, selectPromptModel, selectStaffModel } from './view'
import type { KeyMark, PromptModel, StaffModel } from './view'

export interface Practice {
  staff: StaffModel | null
  prompt: PromptModel | null
  marks: Map<number, KeyMark>
  // Keys missed in the current drill, for shading the keyboard.
  heat: Map<number, KeyHeat>
  stats: PracticeStats
  // Key of the measure being played; moves on its own while cadences cycle.
  keySpec: string
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
  const heat = useMemo(
    () => keyHeat(session.log, session.config.drill),
    [session.log, session.config.drill],
  )
  const skip = useCallback(() => dispatch({ type: 'skip' }), [])
  const resetStats = useCallback(() => dispatch({ type: 'resetStats' }), [])

  // Until the session has taken up a new config it still holds the old key;
  // answering with the config's own key keeps the selector from lagging a render.
  const keySpec = session.config === config ? currentKey(session) : config.keySpec

  return { staff, prompt, marks, heat, stats, keySpec, skip, resetStats }
}
