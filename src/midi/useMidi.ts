import { useEffect, useRef, useState } from 'react'

export type MidiStatus =
  | { kind: 'unsupported' }
  | { kind: 'requesting' }
  | { kind: 'denied' }
  | { kind: 'no-devices' }
  | { kind: 'connected'; deviceNames: string[] }

export interface MidiState {
  status: MidiStatus
  activeNotes: Map<number, number>
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

  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setStatus({ kind: 'unsupported' })
      return
    }

    let cancelled = false

    const handleMessage = (event: MIDIMessageEvent) => {
      const data = event.data
      if (!data || data.length < 2) return
      const [statusByte, note, velocity = 0] = data
      const command = statusByte & 0xf0

      if (command === 0x90 && velocity > 0) {
        setActiveNotes((prev) => {
          const next = new Map(prev)
          next.set(note, velocity)
          return next
        })
      } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
        setActiveNotes((prev) => {
          if (!prev.has(note)) return prev
          const next = new Map(prev)
          next.delete(note)
          return next
        })
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

  return { status, activeNotes }
}
