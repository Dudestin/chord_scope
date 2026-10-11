import { useCallback, useEffect, useRef, useState } from 'react'

export type MidiStatus =
  | { kind: 'unsupported' }
  | { kind: 'requesting' }
  | { kind: 'denied' }
  | { kind: 'no-devices' }
  | { kind: 'connected'; deviceNames: string[] }

export interface MidiNoteEvent {
  type: 'on' | 'off'
  note: number
  time: number
}

export type MidiNoteListener = (event: MidiNoteEvent) => void

export interface MidiState {
  status: MidiStatus
  activeNotes: Map<number, number>
  subscribe: (listener: MidiNoteListener) => () => void
}

function inputNames(access: MIDIAccess): string[] {
  return Array.from(access.inputs.values()).map(
    (input) => input.name ?? 'Unknown device',
  )
}

export function useMidi(): MidiState {
  const [status, setStatus] = useState<MidiStatus>({ kind: 'requesting' })
  const [activeNotes, setActiveNotes] = useState<Map<number, number>>(
    () => new Map(),
  )
  const accessRef = useRef<MIDIAccess | null>(null)
  const listenersRef = useRef(new Set<MidiNoteListener>())

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setStatus({ kind: 'unsupported' })
      return
    }

    let cancelled = false

    // Called next to setActiveNotes, never inside its updater: updaters run
    // twice under StrictMode and would deliver every event twice.
    const emit = (type: MidiNoteEvent['type'], note: number, time: number) => {
      for (const listener of listenersRef.current) listener({ type, note, time })
    }

    const handleMessage = (event: MIDIMessageEvent) => {
      const data = event.data
      if (!data || data.length < 2) return
      const [statusByte, note, velocity = 0] = data
      const command = statusByte & 0xf0
      const time = event.timeStamp || performance.now()

      if (command === 0x90 && velocity > 0) {
        setActiveNotes((prev) => {
          const next = new Map(prev)
          next.set(note, velocity)
          return next
        })
        emit('on', note, time)
      } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
        setActiveNotes((prev) => {
          if (!prev.has(note)) return prev
          const next = new Map(prev)
          next.delete(note)
          return next
        })
        emit('off', note, time)
      }
    }

    const attachListeners = (access: MIDIAccess) => {
      for (const input of access.inputs.values()) {
        input.onmidimessage = handleMessage
      }
    }

    const refreshStatus = (access: MIDIAccess) => {
      const names = inputNames(access)
      setStatus(
        names.length === 0
          ? { kind: 'no-devices' }
          : { kind: 'connected', deviceNames: names },
      )
    }

    navigator
      .requestMIDIAccess()
      .then((access) => {
        if (cancelled) return
        accessRef.current = access
        attachListeners(access)
        refreshStatus(access)

        access.onstatechange = () => {
          attachListeners(access)
          refreshStatus(access)
        }
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: 'denied' })
      })

    return () => {
      cancelled = true
      const access = accessRef.current
      if (access) {
        for (const input of access.inputs.values()) {
          input.onmidimessage = null
        }
        access.onstatechange = null
      }
    }
  }, [])

  const subscribe = useCallback((listener: MidiNoteListener) => {
    const listeners = listenersRef.current
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return { status, activeNotes, subscribe }
}
