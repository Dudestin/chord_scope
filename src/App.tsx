import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { ChordInfo } from './components/ChordInfo'
import { CircleOfFifths } from './components/CircleOfFifths'
import { NoteInfo } from './components/NoteInfo'
import { PianoKeyboard } from './components/PianoKeyboard'
import { TensionInfo } from './components/TensionInfo'
import { ScaleInfo } from './components/ScaleInfo'
import { StaffView } from './components/StaffView'
import type { ClefName } from './components/StaffView'
import { useMidi } from './midi/useMidi'
import { analyzeNotes, computeTensions, detectChord, detectRomanNumeral, detectScales } from './theory/analyze'
import type { MidiStatus } from './midi/useMidi'
import { KEY_OPTIONS } from './theory/keys'
import type { KeyOption } from './theory/keys'
import { computeChordRoles } from './theory/roles'

type Theme = 'light' | 'dark'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="1.5" x2="12" y2="4.5" />
        <line x1="12" y1="19.5" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="4.5" y2="12" />
        <line x1="19.5" y1="12" x2="22.5" y2="12" />
        <line x1="4.4" y1="4.4" x2="6.5" y2="6.5" />
        <line x1="17.5" y1="17.5" x2="19.6" y2="19.6" />
        <line x1="4.4" y1="19.6" x2="6.5" y2="17.5" />
        <line x1="17.5" y1="6.5" x2="19.6" y2="4.4" />
      </g>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true">
      <path
        fill="currentColor"
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
      />
    </svg>
  )
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

const CLEF_LABELS: Record<ClefName, string> = {
  treble: 'Treble clef',
  alto: 'Alto clef',
  bass: 'Bass clef',
}

function ClefSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: ClefName
  onChange: (clef: ClefName) => void
}) {
  return (
    <label className="clef-select">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ClefName)}
      >
        {(Object.keys(CLEF_LABELS) as ClefName[]).map((clef) => (
          <option key={clef} value={clef}>
            {CLEF_LABELS[clef]}
          </option>
        ))}
      </select>
    </label>
  )
}

function StatusBanner({ status }: { status: MidiStatus }) {
  switch (status.kind) {
    case 'unsupported':
      return (
        <p className="status status-error">
          This browser does not support the Web MIDI API (please use Chrome
          or Edge)
        </p>
      )
    case 'requesting':
      return <p className="status">Requesting access to MIDI devices…</p>
    case 'denied':
      return (
        <p className="status status-error">
          MIDI access was denied. Please check your browser permissions.
        </p>
      )
    case 'no-devices':
      return (
        <p className="status status-warn">
          No MIDI devices found. Please connect a keyboard.
        </p>
      )
    case 'connected':
      return (
        <p className="status status-ok">
          Connected: {status.deviceNames.join(', ')}
        </p>
      )
  }
}

function App() {
  const { status, activeNotes } = useMidi()
  const [topClef, setTopClef] = useState<ClefName>('treble')
  const [bottomClef, setBottomClef] = useState<ClefName>('bass')
  const [key, setKey] = useState<KeyOption>(KEY_OPTIONS[7])
  const [mode, setMode] = useState<'major' | 'minor'>('major')
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const notes = useMemo(
    () => analyzeNotes([...activeNotes.keys()], key.sharps),
    [activeNotes, key],
  )
  const chord = useMemo(
    () => detectChord([...activeNotes.keys()], key.sharps),
    [activeNotes, key],
  )
  const roles = useMemo(
    () =>
      chord
        ? computeChordRoles([...activeNotes.keys()], chord.symbol)
        : new Map(),
    [activeNotes, chord],
  )
  const romanNumeral = useMemo(
    () =>
      chord
        ? detectRomanNumeral(
            chord.symbol,
            mode === 'minor' ? key.minorTonic : key.spec,
          )
        : null,
    [chord, key, mode],
  )
  const scales = useMemo(
    () => detectScales(notes.map((n) => n.name)),
    [notes],
  )
  const tensionInfo = useMemo(
    () =>
      chord
        ? computeTensions(
            chord.symbol,
            mode === 'minor' ? key.minorTonic : key.spec,
            mode,
          )
        : null,
    [chord, key, mode],
  )

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <h1>chord_scope</h1>
          <ThemeToggle
            theme={theme}
            onToggle={() =>
              setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
            }
          />
        </div>
        <StatusBanner status={status} />
      </header>

      <main>
        <div className="staff-row">
          <div className="staff-controls">
            <CircleOfFifths
              value={key}
              mode={mode}
              onChange={(newKey, newMode) => {
                setKey(newKey)
                setMode(newMode)
              }}
            />
            <div className="clef-controls">
              <ClefSelect
                label="Upper staff (RH)"
                value={topClef}
                onChange={setTopClef}
              />
              <ClefSelect
                label="Lower staff (LH)"
                value={bottomClef}
                onChange={setBottomClef}
              />
            </div>
          </div>
          <StaffView
            notes={notes}
            topClef={topClef}
            bottomClef={bottomClef}
            keySignature={key.spec}
            roles={roles}
          />
        </div>
        <NoteInfo notes={notes} roles={roles} />
        <ChordInfo
          chord={chord}
          notes={notes}
          noteCount={notes.length}
          roles={roles}
          romanNumeral={romanNumeral}
        />
        <TensionInfo tension={tensionInfo} />
        <ScaleInfo scales={scales} />
        <PianoKeyboard
          activeNotes={activeNotes}
          roles={roles}
          tensions={tensionInfo?.tensions}
          avoids={tensionInfo?.avoids}
        />
      </main>
    </div>
  )
}

export default App
