import type { ChordPool, DrillKind, PracticeSettings as Settings } from '../practice/generate'

interface PracticeSettingsProps {
  value: Settings
  onChange: (value: Settings) => void
}

const DRILLS: [DrillKind, string][] = [
  ['notes', 'Single notes'],
  ['hands', 'Both hands'],
  ['chords', 'Chords'],
  ['symbols', 'Chord symbols'],
]

const STAVES: [Settings['staff'], string][] = [
  ['top', 'Upper (RH)'],
  ['bottom', 'Lower (LH)'],
  ['alternate', 'Alternating'],
]

const RANGES: [number, string][] = [
  [0, 'Within the staff'],
  [1, '1 ledger line'],
  [2, '2 ledger lines'],
  [3, '3 ledger lines'],
]

const LEAPS: [number, string][] = [
  [1, '2nd'],
  [2, '3rd'],
  [4, '5th'],
  [7, 'Octave'],
  [0, 'Any'],
]

const CHORD_SIZES: [number, string][] = [
  [2, '2 notes'],
  [3, '3 notes'],
  [4, '4 notes'],
  [0, 'Mixed'],
]

const POOLS: [ChordPool, string][] = [
  ['triads', 'Triads'],
  ['sevenths', '7th chords'],
  ['mixed', 'Mixed + secondary dominants'],
]

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (value: T) => void
}) {
  return (
    <label className="clef-select">
      {label}
      <select value={value} onChange={(e) => onChange(options[e.target.selectedIndex][0])}>
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}

export function PracticeSettings({ value, onChange }: PracticeSettingsProps) {
  const onStaff = value.drill !== 'symbols'

  return (
    <>
      <Choice
        label="Drill"
        value={value.drill}
        options={DRILLS}
        onChange={(drill) => onChange({ ...value, drill })}
      />
      {(value.drill === 'notes' || value.drill === 'chords') && (
        <Choice
          label="Play on"
          value={value.staff}
          options={STAVES}
          onChange={(staff) => onChange({ ...value, staff })}
        />
      )}
      {value.drill === 'chords' && (
        <Choice
          label="Chord size"
          value={value.chordSize}
          options={CHORD_SIZES}
          onChange={(chordSize) => onChange({ ...value, chordSize })}
        />
      )}
      {value.drill === 'symbols' && (
        <Choice
          label="Chords"
          value={value.pool}
          options={POOLS}
          onChange={(pool) => onChange({ ...value, pool })}
        />
      )}
      {onStaff && (
        <>
          <Choice
            label="Range"
            value={value.ledger}
            options={RANGES}
            onChange={(ledger) => onChange({ ...value, ledger })}
          />
          <Choice
            label="Largest leap"
            value={value.leap}
            options={LEAPS}
            onChange={(leap) => onChange({ ...value, leap })}
          />
          <label className="clef-select">
            Accidentals
            <input
              type="checkbox"
              checked={value.accidentals}
              onChange={(e) => onChange({ ...value, accidentals: e.target.checked })}
            />
          </label>
        </>
      )}
    </>
  )
}
