import { useEffect, useRef, useState } from 'react'
import {
  Accidental,
  ModifierContext,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  TickContext,
  Voice,
} from 'vexflow'
import type { RenderContext } from 'vexflow'
import type { StaffModel, StaffStep } from '../practice/view'
import { toVexKey } from './vexKey'

interface PracticeStaffProps {
  model: StaffModel
}

type StaffName = 'top' | 'bottom'

const STAFF_NAMES: StaffName[] = ['top', 'bottom']

const WIDTH = 662
const HEIGHT = 260
const STAVE_X = 30
const RIGHT_PAD = 8
const STAVE_Y: Record<StaffName, number> = { top: 20, bottom: 130 }
// Vertical extent of the cursor on each staff, ledger lines included.
const CURSOR_Y: Record<StaffName, [number, number]> = { top: [6, 128], bottom: [132, 254] }
const CELL_INSET = 6
const RAIL_HEIGHT = 3
// How far a wrong notehead sits to the right of the one it missed, in noteheads.
const WRONG_OFFSET = 0.55

const INK = {
  clean: '#9ca3af',
  missed: '#d97706',
  skipped: '#dc2626',
  wrong: '#dc2626',
  down: '#16a34a',
}
const CURSOR_FILL = 'rgba(170, 59, 255, 0.14)'
const CURSOR_FILL_FLAWED = 'rgba(220, 38, 38, 0.12)'
const RAIL_FILL = '#aa3bff'

interface Measure {
  staves: Record<StaffName, Stave>
  noteStart: number
  noteEnd: number
  steps: StaffStep[]
}

// Width a stave spends on its barline, clef and key signature before the first note.
function leadWidth(model: StaffModel, first: boolean): number {
  if (!first) return new Stave(0, 0, 100, { leftBar: false }).getNoteStartX()
  return Math.max(
    ...[model.topClef, model.bottomClef].map((clef) =>
      new Stave(0, 0, 100).addClef(clef).addKeySignature(model.keySignature).getNoteStartX(),
    ),
  )
}

// Every measure gets the same room for notes; only the first also carries the
// clefs and key signature.
function layoutMeasures(model: StaffModel, context: RenderContext): Measure[] {
  const firstLead = leadWidth(model, true)
  const laterLead = leadWidth(model, false)
  const count = model.measures.length
  const body = (WIDTH - STAVE_X - RIGHT_PAD - firstLead - laterLead * (count - 1)) / count

  let x = STAVE_X
  return model.measures.map((steps, index) => {
    const first = index === 0
    const lead = first ? firstLead : laterLead
    const width = lead + body
    const noteStart = x + lead
    const stave = (name: StaffName) => {
      const made = new Stave(x, STAVE_Y[name], width, { leftBar: first })
      if (first) {
        made.addClef(name === 'top' ? model.topClef : model.bottomClef)
        made.addKeySignature(model.keySignature)
      }
      // The two clefs differ in width; without this the hands would not line up.
      return made.setNoteStartX(noteStart).setContext(context)
    }
    const staves = { top: stave('top'), bottom: stave('bottom') }
    x += width
    return { staves, noteStart, noteEnd: x, steps }
  })
}

function cellWidth(measure: Measure): number {
  return (measure.noteEnd - measure.noteStart - 2 * CELL_INSET) / measure.steps.length
}

function cellLeft(measure: Measure, index: number): number {
  return measure.noteStart + CELL_INSET + index * cellWidth(measure)
}

function paint(note: StaveNote, color: string) {
  const style = { fillStyle: color, strokeStyle: color }
  note.setStyle(style)
  note.setLedgerLineStyle(style)
  for (const modifier of note.getModifiers()) modifier.setStyle(style)
}

function buildNotes(model: StaffModel, steps: StaffStep[], name: StaffName): (StaveNote | null)[] {
  const clef = name === 'top' ? model.topClef : model.bottomClef
  const notes = steps.map((step) =>
    step[name].length > 0
      ? new StaveNote({
          clef,
          keys: step[name].map((key) => toVexKey(key.name)),
          duration: 'q',
          autoStem: true,
        })
      : null,
  )

  // VexFlow keeps an accidental alive until told otherwise, so every measure
  // gets its own pass: that is what resets it at the barline.
  const sounding = notes.filter((note): note is StaveNote => note !== null)
  if (sounding.length > 0) {
    const voice = new Voice({ numBeats: sounding.length, beatValue: 4 })
      .setStrict(false)
      .addTickables(sounding)
    Accidental.applyAccidentals([voice], model.keySignature)
  }

  notes.forEach((note, index) => {
    if (!note) return
    const { status } = steps[index]
    if (status !== 'pending') paint(note, INK[status])
    steps[index][name].forEach((key, keyIndex) => {
      if (key.down) note.setKeyStyle(keyIndex, { fillStyle: INK.down, strokeStyle: INK.down })
    })
  })
  return notes
}

// Puts notes on a fixed grid instead of letting VexFlow space them, so nothing
// shifts when a measure is swapped out and the cursor is simply a cell. The
// modifier context has to be attached after the accidentals exist. Returns the
// x of the notehead column.
function place(parts: { note: StaveNote; stave: Stave }[], left: number, width: number): number {
  const ticks = parts.map(({ note, stave }) => {
    note.setStave(stave)
    note.addToModifierContext(new ModifierContext())
    return new TickContext().addTickable(note).preFormat().setX(0)
  })
  const lean = Math.max(...ticks.map((tick) => tick.getMetrics().totalLeftPx))
  const headWidth = parts[0].note.getGlyphWidth()
  // Centred in its cell unless accidentals need the room on the left.
  const headLeft = Math.max(left + (width - headWidth) / 2, left + 1 + lean)
  parts.forEach(({ note }, index) => ticks[index].setX(headLeft - note.getAbsoluteX()))
  return headLeft
}

function fillRect(context: RenderContext, fill: string, x: number, y: number, width: number, height: number) {
  context.save()
  context.setFillStyle(fill)
  context.fillRect(x, y, width, height)
  context.restore()
}

function draw(container: HTMLDivElement, model: StaffModel) {
  container.innerHTML = ''
  const renderer = new Renderer(container, Renderer.Backends.SVG)
  renderer.resize(WIDTH, HEIGHT)
  // VexFlow also pins the size inline, which would stop the stylesheet from
  // scaling the score down on a narrow window.
  container.querySelector('svg')?.removeAttribute('style')
  const context = renderer.getContext()

  const measures = layoutMeasures(model, context)
  const notes: StaveNote[] = []
  let cursorHead = 0
  let cursorStaves: StaffName[] = []

  measures.forEach((measure, measureIndex) => {
    const rows = {
      top: buildNotes(model, measure.steps, 'top'),
      bottom: buildNotes(model, measure.steps, 'bottom'),
    }
    measure.steps.forEach((_, stepIndex) => {
      const parts = STAFF_NAMES.flatMap((name) => {
        const note = rows[name][stepIndex]
        return note ? [{ name, note, stave: measure.staves[name] }] : []
      })
      if (parts.length === 0) return
      const headLeft = place(parts, cellLeft(measure, stepIndex), cellWidth(measure))
      notes.push(...parts.map((part) => part.note))
      if (measureIndex === model.cursor.measure && stepIndex === model.cursor.step) {
        cursorHead = headLeft
        cursorStaves = parts.map((part) => part.name)
      }
    })
  })

  const current = measures[model.cursor.measure]
  if (current && cursorStaves.length > 0) {
    const top = Math.min(...cursorStaves.map((name) => CURSOR_Y[name][0]))
    const bottom = Math.max(...cursorStaves.map((name) => CURSOR_Y[name][1]))
    fillRect(
      context,
      model.flawed ? CURSOR_FILL_FLAWED : CURSOR_FILL,
      cellLeft(current, model.cursor.step),
      top,
      cellWidth(current),
      bottom - top,
    )
    fillRect(context, RAIL_FILL, current.noteStart, 0, current.noteEnd - current.noteStart - CELL_INSET, RAIL_HEIGHT)
  }

  measures.forEach(({ staves }, index) => {
    staves.top.draw()
    staves.bottom.draw()
    const connectors =
      index === 0 ? (['brace', 'singleLeft', 'singleRight'] as const) : (['singleRight'] as const)
    for (const type of connectors) {
      new StaveConnector(staves.top, staves.bottom).setType(type).setContext(context).draw()
    }
  })

  // Wrong keys go underneath: bare red noteheads peeking out to the right of
  // the note they missed, so a wrong accidental on the right line still shows.
  if (current) {
    for (const name of cursorStaves) {
      if (model.wrong[name].length === 0) continue
      const wrong = new StaveNote({
        clef: name === 'top' ? model.topClef : model.bottomClef,
        keys: model.wrong[name].map(toVexKey),
        duration: 'q',
      })
      wrong.getStem()?.setVisibility(false)
      paint(wrong, INK.wrong)
      wrong.setStave(current.staves[name])
      wrong.addToModifierContext(new ModifierContext())
      const tick = new TickContext().addTickable(wrong).preFormat().setX(0)
      tick.setX(cursorHead + WRONG_OFFSET * wrong.getGlyphWidth() - wrong.getAbsoluteX())
      wrong.setContext(context).drawWithStyle()
    }
  }

  for (const note of notes) note.setContext(context).drawWithStyle()
}

export function PracticeStaff({ model }: PracticeStaffProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fontsReady, setFontsReady] = useState(false)

  useEffect(() => {
    let alive = true
    document.fonts.ready.then(() => {
      if (alive) setFontsReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // Glyphs measured before the music font has loaded come out the wrong
  // width, so the staff is drawn once more when it is ready.
  useEffect(() => {
    if (containerRef.current) draw(containerRef.current, model)
  }, [model, fontsReady])

  return (
    <div
      ref={containerRef}
      className="staff-view practice-staff"
      role="img"
      aria-label="Sight-reading exercise"
    />
  )
}
