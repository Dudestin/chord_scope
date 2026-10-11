import { useEffect, useRef } from 'react'
import {
  Accidental,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  Voice,
} from 'vexflow'
import type { NoteInfo } from '../theory/analyze'
import type { ClefName } from '../theory/clefs'
import type { ChordRole } from '../theory/roles'
import { toVexKey } from './vexKey'

interface StaffViewProps {
  notes: NoteInfo[]
  topClef: ClefName
  bottomClef: ClefName
  keySignature: string
  roles: Map<number, ChordRole>
}

const WIDTH = 380
const HEIGHT = 260
const MIDDLE_C = 60
const STAVE_X = 30

interface NoteEntry {
  midi: number
  vexKey: string
}

function buildChordNote(
  entries: NoteEntry[],
  clef: ClefName,
  roles: Map<number, ChordRole>,
): StaveNote {
  const note = new StaveNote({
    clef,
    keys: entries.map((e) => e.vexKey),
    duration: 'w',
  })
  entries.forEach((entry, index) => {
    const role = roles.get(entry.midi)
    if (role) {
      note.setKeyStyle(index, { fillStyle: role.color, strokeStyle: role.color })
    }
  })
  return note
}

function buildVoice(note: StaveNote | null): Voice | null {
  if (!note) return null
  return new Voice({ numBeats: 4, beatValue: 4 })
    .setStrict(false)
    .addTickables([note])
}

export function StaffView({
  notes,
  topClef,
  bottomClef,
  keySignature,
  roles,
}: StaffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''

    const renderer = new Renderer(container, Renderer.Backends.SVG)
    renderer.resize(WIDTH, HEIGHT)
    const context = renderer.getContext()

    const topStave = new Stave(STAVE_X, 20, WIDTH - STAVE_X - 20)
    topStave.addClef(topClef)
    topStave.addKeySignature(keySignature)
    topStave.setContext(context).draw()

    const bottomStave = new Stave(STAVE_X, 130, WIDTH - STAVE_X - 20)
    bottomStave.addClef(bottomClef)
    bottomStave.addKeySignature(keySignature)
    bottomStave.setContext(context).draw()

    new StaveConnector(topStave, bottomStave)
      .setType('brace')
      .setContext(context)
      .draw()
    new StaveConnector(topStave, bottomStave)
      .setType('singleLeft')
      .setContext(context)
      .draw()

    const topEntries: NoteEntry[] = notes
      .filter((n) => n.midi >= MIDDLE_C)
      .map((n) => ({ midi: n.midi, vexKey: toVexKey(n.name) }))
    const bottomEntries: NoteEntry[] = notes
      .filter((n) => n.midi < MIDDLE_C)
      .map((n) => ({ midi: n.midi, vexKey: toVexKey(n.name) }))

    const topNote =
      topEntries.length > 0
        ? buildChordNote(topEntries, topClef, roles)
        : null
    const bottomNote =
      bottomEntries.length > 0
        ? buildChordNote(bottomEntries, bottomClef, roles)
        : null

    const topVoice = buildVoice(topNote)
    const bottomVoice = buildVoice(bottomNote)
    const activeVoices = [topVoice, bottomVoice].filter(
      (v): v is Voice => v !== null,
    )

    if (activeVoices.length > 0) {
      Accidental.applyAccidentals(activeVoices, keySignature)
    }

    if (topVoice) {
      new Formatter().joinVoices([topVoice]).format([topVoice], WIDTH - 100)
      topVoice.draw(context, topStave)
    }
    if (bottomVoice) {
      new Formatter()
        .joinVoices([bottomVoice])
        .format([bottomVoice], WIDTH - 100)
      bottomVoice.draw(context, bottomStave)
    }
  }, [notes, topClef, bottomClef, keySignature, roles])

  return <div ref={containerRef} className="staff-view" />
}
