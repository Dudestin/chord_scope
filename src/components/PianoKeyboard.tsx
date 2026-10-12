import { useMemo } from 'react'
import { Note } from 'tonal'
import type { KeyHeat } from '../practice/stats'
import type { KeyMark } from '../practice/view'
import type { ChordRole } from '../theory/roles'

interface PianoKeyboardProps {
  activeNotes: Map<number, number>
  roles: Map<number, ChordRole>
  tensions?: string[]
  avoids?: string[]
  // When given, keys are coloured by how they were judged instead of by velocity.
  marks?: Map<number, KeyMark>
  // Practice: keys that have been missed are shaded by how often, unless a mark is on them.
  heat?: Map<number, KeyHeat>
}

const LOWEST_MIDI = 21 // A0
const HIGHEST_MIDI = 108 // C8
const WHITE_W = 13
const WHITE_H = 90
const BLACK_W = 8
const BLACK_H = 56
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10])

interface KeyInfo {
  midi: number
  isBlack: boolean
  x: number
}

function buildKeys(): { keys: KeyInfo[]; whiteCount: number } {
  const keys: KeyInfo[] = []
  let whiteIndex = 0
  for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
    const pitchClass = midi % 12
    if (BLACK_PITCH_CLASSES.has(pitchClass)) {
      keys.push({ midi, isBlack: true, x: whiteIndex * WHITE_W - BLACK_W / 2 })
    } else {
      keys.push({ midi, isBlack: false, x: whiteIndex * WHITE_W })
      whiteIndex++
    }
  }
  return { keys, whiteCount: whiteIndex }
}

const { keys: KEYS, whiteCount: WHITE_COUNT } = buildKeys()
const WHITE_KEYS = KEYS.filter((k) => !k.isBlack)
const BLACK_KEYS = KEYS.filter((k) => k.isBlack)
const TOTAL_WIDTH = WHITE_COUNT * WHITE_W

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

// Velocities near 0 still read as a light tint rather than disappearing.
function velocityT(velocity: number): number {
  const clamped = Math.max(0, Math.min(127, velocity))
  return 0.2 + 0.8 * (clamped / 127)
}

function activeWhiteColor(velocity: number): string {
  const t = velocityT(velocity)
  return `rgb(${lerp(255, 214, t)}, ${lerp(214, 40, t)}, ${lerp(209, 30, t)})`
}

function activeBlackColor(velocity: number): string {
  const t = velocityT(velocity)
  return `rgb(${lerp(140, 255, t)}, ${lerp(70, 59, t)}, ${lerp(65, 48, t)})`
}

// A key missed only now and then still has to stand out from its neighbours,
// and a black key needs a longer way from black for that than a white one from white.
function heatWhiteColor(level: number): string {
  const t = 0.15 + 0.85 * level
  return `rgb(${lerp(255, 245, t)}, ${lerp(255, 158, t)}, ${lerp(255, 11, t)})`
}

function heatBlackColor(level: number): string {
  const t = 0.3 + 0.7 * level
  return `rgb(${lerp(34, 245, t)}, ${lerp(34, 158, t)}, ${lerp(34, 11, t)})`
}

function heatTitle(heat: KeyHeat | undefined): string | undefined {
  return heat && `Missed ${heat.missed} of ${heat.attempts}`
}

function keyClassName(base: string, active: boolean, mark: KeyMark | undefined): string {
  if (mark) return `${base} piano-key-${mark}`
  return active ? `${base} piano-key-active` : base
}

export function PianoKeyboard({ activeNotes, roles, tensions = [], avoids = [], marks, heat }: PianoKeyboardProps) {
  const tensionChromas = useMemo(
    () => new Set(tensions.map((n) => Note.chroma(n)).filter((c): c is number => c !== undefined)),
    [tensions],
  )
  const avoidChromas = useMemo(
    () => new Set(avoids.map((n) => Note.chroma(n)).filter((c): c is number => c !== undefined)),
    [avoids],
  )

  return (
    <div className="piano-keyboard-wrapper">
      <div
        className="piano-keyboard"
        style={{ width: TOTAL_WIDTH, height: WHITE_H }}
      >
        {WHITE_KEYS.map((k) => {
          const velocity = activeNotes.get(k.midi)
          const role = roles.get(k.midi)
          const chroma = k.midi % 12
          const isTension = tensionChromas.has(chroma)
          const isAvoid = avoidChromas.has(chroma)
          const mark = marks?.get(k.midi)
          const missed = heat?.get(k.midi)
          return (
            <div
              key={k.midi}
              className={keyClassName('piano-key piano-key-white', velocity !== undefined, mark)}
              title={heatTitle(missed)}
              style={{
                left: k.x,
                width: WHITE_W,
                height: WHITE_H,
                ...(velocity !== undefined &&
                  !marks && {
                    backgroundColor: activeWhiteColor(velocity),
                  }),
                ...(missed && !mark && { backgroundColor: heatWhiteColor(missed.level) }),
              }}
            >
              {(isTension || isAvoid) && (
                <div className={isTension ? 'piano-key-dot piano-key-dot-tension' : 'piano-key-dot piano-key-dot-avoid'} />
              )}
              {role && (
                <div
                  className="piano-key-role-bar"
                  style={{ background: role.color }}
                />
              )}
            </div>
          )
        })}
        {BLACK_KEYS.map((k) => {
          const velocity = activeNotes.get(k.midi)
          const role = roles.get(k.midi)
          const chroma = k.midi % 12
          const isTension = tensionChromas.has(chroma)
          const isAvoid = avoidChromas.has(chroma)
          const mark = marks?.get(k.midi)
          const missed = heat?.get(k.midi)
          return (
            <div
              key={k.midi}
              className={keyClassName('piano-key piano-key-black', velocity !== undefined, mark)}
              title={heatTitle(missed)}
              style={{
                left: k.x,
                width: BLACK_W,
                height: BLACK_H,
                ...(velocity !== undefined &&
                  !marks && {
                    backgroundColor: activeBlackColor(velocity),
                  }),
                ...(missed && !mark && { backgroundColor: heatBlackColor(missed.level) }),
              }}
            >
              {(isTension || isAvoid) && (
                <div className={isTension ? 'piano-key-dot piano-key-dot-tension' : 'piano-key-dot piano-key-dot-avoid'} />
              )}
              {role && (
                <div
                  className="piano-key-role-bar"
                  style={{ background: role.color }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
