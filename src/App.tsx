import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { ChordInfo } from './components/ChordInfo'
import { ChordPrompt } from './components/ChordPrompt'
import { CircleOfFifths } from './components/CircleOfFifths'
import { NoteInfo } from './components/NoteInfo'
import { PianoKeyboard } from './components/PianoKeyboard'
import { PracticeSettings } from './components/PracticeSettings'
import { PracticeStaff } from './components/PracticeStaff'
import { PracticeStats } from './components/PracticeStats'
import { TensionInfo } from './components/TensionInfo'
import { ScaleInfo } from './components/ScaleInfo'
import { StaffView } from './components/StaffView'
import { useMidi } from './midi/useMidi'
import { DEFAULT_SETTINGS } from './practice/generate'
import { usePractice } from './practice/usePractice'
import { analyzeNotes, computeTensions, detectChord, detectRomanNumeral, detectScales, getScaleName } from './theory/analyze'
import type { ModalMode } from './theory/analyze'
import type { MidiStatus } from './midi/useMidi'
import type { ClefName } from './theory/clefs'
import { KEY_OPTIONS } from './theory/keys'
import type { KeyOption } from './theory/keys'
import { computeChordRoles } from './theory/roles'
import type { ChordRole } from './theory/roles'

type Theme = 'light' | 'dark'
type View = 'analyze' | 'practice'

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

const VIEW_LABELS: Record<View, string> = {
  analyze: 'Analyze',
  practice: 'Practice',
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View
  onChange: (view: View) => void
}) {
  return (
    <div className="view-toggle" role="group" aria-label="View">
      {(Object.keys(VIEW_LABELS) as View[]).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => onChange(option)}
        >
          {VIEW_LABELS[option]}
        </button>
      ))}
    </div>
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

const MINOR_MODES = new Set<ModalMode>(['aeolian', 'dorian', 'phrygian', 'locrian'])
const NO_ROLES = new Map<number, ChordRole>()

function KeyboardHints() {
  return (
    <div className="kbd-hints">
      <span className="kbd-hint"><kbd>[</kbd><kbd>]</kbd> cycle key</span>
      <span className="kbd-hint"><kbd>m</kbd> major / minor</span>
    </div>
  )
}

const MODAL_MODE_LABELS: Record<ModalMode, string> = {
  ionian: 'Ionian (I)',
  dorian: 'Dorian (II)',
  phrygian: 'Phrygian (III)',
  lydian: 'Lydian (IV)',
  mixolydian: 'Mixolydian (V)',
  aeolian: 'Aeolian (VI)',
  locrian: 'Locrian (VII)',
}

function ModeSelect({
  value,
  onChange,
}: {
  value: ModalMode
  onChange: (m: ModalMode) => void
}) {
  return (
    <label className="clef-select">
      Mode
      <select value={value} onChange={(e) => onChange(e.target.value as ModalMode)}>
        {(Object.keys(MODAL_MODE_LABELS) as ModalMode[]).map((m) => (
          <option key={m} value={m}>
            {MODAL_MODE_LABELS[m]}
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
  const { status, activeNotes, subscribe } = useMidi()
  const [view, setView] = useState<View>('analyze')
  const [practiceSettings, setPracticeSettings] = useState(DEFAULT_SETTINGS)
  const [topClef, setTopClef] = useState<ClefName>('treble')
  const [bottomClef, setBottomClef] = useState<ClefName>('bass')
  const [key, setKey] = useState<KeyOption>(KEY_OPTIONS[7])
  const [tonic, setTonic] = useState<string>(KEY_OPTIONS[7].spec)
  const [mode, setMode] = useState<ModalMode>('ionian')
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Matched by spec, not identity: re-clicking C puts a copy of its option in
  // state with the sharps/flats preference flipped.
  const keyIndex = KEY_OPTIONS.findIndex((option) => option.spec === key.spec)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return
      if (e.key === ']') {
        const next = KEY_OPTIONS[Math.min(keyIndex + 1, KEY_OPTIONS.length - 1)]
        setKey(next)
        setTonic(MINOR_MODES.has(mode) ? next.minorTonic : next.spec)
      } else if (e.key === '[') {
        const next = KEY_OPTIONS[Math.max(keyIndex - 1, 0)]
        setKey(next)
        setTonic(MINOR_MODES.has(mode) ? next.minorTonic : next.spec)
      } else if (e.key === 'm' || e.key === 'M') {
        if (MINOR_MODES.has(mode)) {
          setMode('ionian')
          setTonic(key.spec)
        } else {
          setMode('aeolian')
          setTonic(key.minorTonic)
        }
      }
    },
    [key, mode, keyIndex],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

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
    () => (chord ? detectRomanNumeral(chord.symbol, tonic) : null),
    [chord, tonic],
  )
  const scales = useMemo(
    () => detectScales(notes.map((n) => n.name)),
    [notes],
  )
  const tensionInfo = useMemo(
    () => (chord ? computeTensions(chord.symbol, tonic, mode) : null),
    [chord, tonic, mode],
  )
  const selectedScale = getScaleName(tonic, mode)

  const practiceConfig = useMemo(
    () => ({ ...practiceSettings, keySpec: key.spec, topClef, bottomClef }),
    [practiceSettings, key.spec, topClef, bottomClef],
  )
  const practice = usePractice(subscribe, practiceConfig, view === 'practice')

  const keySelector = (
    <CircleOfFifths
      value={key}
      mode={mode === 'aeolian' || mode === 'dorian' || mode === 'phrygian' || mode === 'locrian' ? 'minor' : 'major'}
      onChange={(newKey, clickedMode) => {
        setKey(newKey)
        if (clickedMode === 'minor') {
          setTonic(newKey.minorTonic)
          setMode('aeolian')
        } else {
          setTonic(newKey.spec)
          setMode('ionian')
        }
      }}
    />
  )
  const clefSelects = (
    <>
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
    </>
  )

  return (
    <div className="app">
      <header>
        <div className="header-row">
          <ViewToggle view={view} onChange={setView} />
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
        {view === 'analyze' ? (
          <>
            <div className="staff-row">
              <div className="staff-controls">
                {keySelector}
                <div className="clef-controls">
                  <ModeSelect value={mode} onChange={setMode} />
                  {clefSelects}
                  <KeyboardHints />
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
            <ScaleInfo scales={scales} selectedScale={selectedScale} />
            <PianoKeyboard
              activeNotes={activeNotes}
              roles={roles}
              tensions={tensionInfo?.tensions}
              avoids={tensionInfo?.avoids}
            />
          </>
        ) : (
          <>
            {practice.staff && <PracticeStaff model={practice.staff} />}
            {practice.prompt && <ChordPrompt model={practice.prompt} />}
            <PracticeStats
              stats={practice.stats}
              onSkip={practice.skip}
              onReset={practice.resetStats}
            />
            <PianoKeyboard
              activeNotes={activeNotes}
              roles={practice.prompt ? roles : NO_ROLES}
              marks={practice.marks}
            />
            {practice.prompt && (
              <ChordInfo
                chord={chord}
                notes={notes}
                noteCount={notes.length}
                roles={roles}
                romanNumeral={romanNumeral}
              />
            )}
            <div className="staff-row">
              {keySelector}
              <div className="clef-controls practice-controls">
                <PracticeSettings value={practiceSettings} onChange={setPracticeSettings} />
                {practice.staff && clefSelects}
                <KeyboardHints />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App
