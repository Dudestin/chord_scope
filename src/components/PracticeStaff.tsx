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
import type { StaffMeasure, StaffModel } from '../practice/view'
import { toVexKey } from './vexKey'

interface PracticeStaffProps {
  model: StaffModel
}

type StaffName = 'top' | 'bottom'

const STAFF_NAMES: StaffName[] = ['top', 'bottom']

// A full system fills the page: the 1280px of `#root` less the padding around
// the app and the paper's own padding and border.
const WIDTH = 1222
// The score is broken into systems of this many measures, one below the other.
const MEASURES_PER_SYSTEM = 4
const SYSTEM_HEIGHT = 260
// Keeps the rail over a measure clear of the numerals under the system above.
const SYSTEM_GAP = 16
const STAVE_X = 30
const RIGHT_PAD = 8
// Vertical positions are measured from the top of a measure's system.
const STAVE_Y: Record<StaffName, number> = { top: 20, bottom: 130 }
// Vertical extent of the cursor on each staff, ledger lines included.
const CURSOR_Y: Record<StaffName, [number, number]> = { top: [6, 128], bottom: [132, 254] }
const CELL_INSET = 6
const RAIL_HEIGHT = 3
// How far a wrong notehead sits to the right of the one it missed, in noteheads.
const WRONG_OFFSET = 0.55

// Key names sit above a cadence, roman numerals under the bass staff.
const KEY_NAME_Y = 24
const NUMERAL_Y = 250
const TEXT_FONT = 'system-ui, sans-serif'
const NUMERAL_FONT = 'Academico, Georgia, serif'

const INK = {
  pending: '#08060d',
  clean: '#9ca3af',
  missed: '#d97706',
  skipped: '#dc2626',
  wrong: '#dc2626',
  down: '#16a34a',
}
const CURSOR_FILL = 'rgba(170, 59, 255, 0.14)'
// The card over steps that are to be played from memory.
const COVER_FILL = 'rgba(8, 6, 13, 0.07)'
const CURSOR_FILL_FLAWED = 'rgba(220, 38, 38, 0.12)'
const RAIL_FILL = '#aa3bff'

interface Measure extends StaffMeasure {
  staves: Record<StaffName, Stave>
  noteStart: number
  noteEnd: number
  // Top of the system the measure is in.
  y: number
}

// A stave that knows its clef without drawing one: a key signature in a later
// measure is placed by the clef in force.
class ContinuedStave extends Stave {
  useClef(clef: string): this {
    this.clef = clef
    return this
  }
}

function opensSystem(index: number): boolean {
  return index % MEASURES_PER_SYSTEM === 0
}

function systemTop(index: number): number {
  return Math.floor(index / MEASURES_PER_SYSTEM) * (SYSTEM_HEIGHT + SYSTEM_GAP)
}

// A system opens with clef and key signature; a later measure only shows a
// signature when the key changes, cancelling the old one if nothing replaces it.
function buildStave(model: StaffModel, index: number, name: StaffName, x: number, width: number): Stave {
  const clef = name === 'top' ? model.topClef : model.bottomClef
  const { keySignature } = model.measures[index]
  const previous = model.measures[index - 1]?.keySignature
  const opens = opensSystem(index)
  const stave = new ContinuedStave(x, systemTop(index) + STAVE_Y[name], width, {
    leftBar: opens,
  }).useClef(clef)
  if (opens) {
    stave.addClef(clef).addKeySignature(keySignature)
  } else if (keySignature !== previous) {
    stave.addKeySignature(keySignature, keySignature === 'C' ? previous : undefined)
  }
  return stave
}

// Within a system every measure gets the same room for notes, after whatever
// its barline, clef and key signature take up. A system that is not full keeps
// the measure width of one that is.
function layoutMeasures(model: StaffModel, context: RenderContext): Measure[] {
  const leads = model.measures.map((_, index) =>
    Math.max(...STAFF_NAMES.map((name) => buildStave(model, index, name, 0, 100).getNoteStartX())),
  )
  // What a measure that opens with nothing takes up; stands in for the missing ones.
  const bare = new Stave(0, 0, 100, { leftBar: false }).getNoteStartX()

  let x = STAVE_X
  let body = 0
  return model.measures.map((measure, index) => {
    if (opensSystem(index)) {
      const inSystem = leads.slice(index, index + MEASURES_PER_SYSTEM)
      const taken =
        inSystem.reduce((sum, lead) => sum + lead, 0) +
        (MEASURES_PER_SYSTEM - inSystem.length) * bare
      x = STAVE_X
      body = (WIDTH - STAVE_X - RIGHT_PAD - taken) / MEASURES_PER_SYSTEM
    }
    const width = leads[index] + body
    const noteStart = x + leads[index]
    // The two clefs differ in width; without this the hands would not line up.
    const stave = (name: StaffName) =>
      buildStave(model, index, name, x, width).setNoteStartX(noteStart).setContext(context)
    const staves = { top: stave('top'), bottom: stave('bottom') }
    x += width
    return { ...measure, staves, noteStart, noteEnd: x, y: systemTop(index) }
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

function buildNotes(
  model: StaffModel,
  { steps, keySignature }: StaffMeasure,
  name: StaffName,
): (StaveNote | null)[] {
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
    Accidental.applyAccidentals([voice], keySignature)
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

// Tints one step's cell over the staves it has notes on.
function fillCell(context: RenderContext, fill: string, measure: Measure, index: number, staves: StaffName[]) {
  const top = Math.min(...staves.map((name) => CURSOR_Y[name][0]))
  const bottom = Math.max(...staves.map((name) => CURSOR_Y[name][1]))
  fillRect(context, fill, cellLeft(measure, index), measure.y + top, cellWidth(measure), bottom - top)
}

function prettifyKeyName(name: string): string {
  const minor = name.endsWith('m')
  const tonic = (minor ? name.slice(0, -1) : name).replace('#', '♯').replace('b', '♭')
  return `${tonic} ${minor ? 'minor' : 'major'}`
}

// Draws 'I', 'V7' or 'I6/4' centred on `centre` with its baseline at `y`, the
// figures raised beside the numeral and a six-four stacked as figured bass.
function drawNumeral(context: RenderContext, numeral: string, centre: number, y: number, color: string) {
  const [, base = numeral, figures = ''] = /^([ivIV]+)(.*)$/.exec(numeral) ?? []
  const stacked = figures.split('/')

  context.save()
  context.setFillStyle(color)
  context.setFont(NUMERAL_FONT, 10)
  const figureWidth = Math.max(0, ...stacked.map((figure) => context.measureText(figure).width))
  context.setFont(NUMERAL_FONT, 17)
  const baseWidth = context.measureText(base).width
  const left = centre - (baseWidth + figureWidth) / 2
  context.fillText(base, left, y)
  context.setFont(NUMERAL_FONT, 10)
  stacked.forEach((figure, row) => {
    context.fillText(figure, left + baseWidth + 1, y - 8 + row * 9)
  })
  context.restore()
}

function draw(container: HTMLDivElement, model: StaffModel) {
  container.innerHTML = ''
  const renderer = new Renderer(container, Renderer.Backends.SVG)
  const context = renderer.getContext()

  const measures = layoutMeasures(model, context)
  // The paper is cut to what is on it: a lone measure does not fill its system.
  renderer.resize(
    Math.ceil(Math.max(...measures.map((measure) => measure.noteEnd))) + RIGHT_PAD,
    systemTop(measures.length - 1) + SYSTEM_HEIGHT,
  )
  // VexFlow also pins the size inline, which would stop the stylesheet from
  // scaling the score down on a narrow window.
  container.querySelector('svg')?.removeAttribute('style')
  const notes: StaveNote[] = []
  const labels: (() => void)[] = []
  const covers: (() => void)[] = []
  let cursorHead = 0
  let cursorStaves: StaffName[] = []

  measures.forEach((measure, measureIndex) => {
    const rows = {
      top: buildNotes(model, measure, 'top'),
      bottom: buildNotes(model, measure, 'bottom'),
    }
    measure.steps.forEach((step, stepIndex) => {
      const parts = STAFF_NAMES.flatMap((name) => {
        const note = rows[name][stepIndex]
        return note ? [{ name, note, stave: measure.staves[name] }] : []
      })
      if (parts.length === 0) return
      const underCursor = measureIndex === model.cursor.measure && stepIndex === model.cursor.step
      if (underCursor) cursorStaves = parts.map((part) => part.name)
      // A covered step keeps its notes out of the drawing, though they still
      // counted when the measure's accidentals were worked out.
      if (step.hidden) {
        const staves = parts.map((part) => part.name)
        if (!underCursor) covers.push(() => fillCell(context, COVER_FILL, measure, stepIndex, staves))
        return
      }
      const headLeft = place(parts, cellLeft(measure, stepIndex), cellWidth(measure))
      notes.push(...parts.map((part) => part.note))
      if (step.numeral) {
        labels.push(() =>
          drawNumeral(
            context,
            step.numeral ?? '',
            headLeft + parts[0].note.getGlyphWidth() / 2,
            measure.y + NUMERAL_Y,
            INK[step.status],
          ),
        )
      }
      if (underCursor) cursorHead = headLeft
    })
  })

  for (const drawCover of covers) drawCover()
  const current = measures[model.cursor.measure]
  if (current && cursorStaves.length > 0) {
    fillCell(
      context,
      model.flawed ? CURSOR_FILL_FLAWED : CURSOR_FILL,
      current,
      model.cursor.step,
      cursorStaves,
    )
    fillRect(
      context,
      RAIL_FILL,
      current.noteStart,
      current.y,
      current.noteEnd - current.noteStart - CELL_INSET,
      RAIL_HEIGHT,
    )
  }

  measures.forEach(({ staves }, index) => {
    staves.top.draw()
    staves.bottom.draw()
    const connectors = opensSystem(index)
      ? (['brace', 'singleLeft', 'singleRight'] as const)
      : (['singleRight'] as const)
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

  for (const measure of measures) {
    if (!measure.keyName) continue
    context.save()
    context.setFillStyle(INK.pending)
    context.setFont(TEXT_FONT, 13)
    context.fillText(
      prettifyKeyName(measure.keyName),
      measure.noteStart + CELL_INSET,
      measure.y + KEY_NAME_Y,
    )
    context.restore()
  }
  for (const drawLabel of labels) drawLabel()
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
