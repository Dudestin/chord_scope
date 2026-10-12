import type {
  CadenceKind,
  ChordPool,
  DrillKind,
  PracticeSettings as Settings,
} from '../practice/generate'

interface PracticeSettingsProps {
  value: Settings
  onChange: (value: Settings) => void
}

const DRILLS: [DrillKind, string][] = [
  ['notes', 'Single notes'],
  ['hands', 'Both hands'],
  ['chords', 'Chords'],
  ['symbols', 'Chord symbols'],
  ['cadence', 'Cadences'],
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

const CADENCES: [CadenceKind, string][] = [
  ['basic', 'I – IV – V7 – I'],
  ['sixFour', 'I – IV – I6/4 – V7 – I'],
]

const INVERSIONS: [number, string][] = [
  [0, 'Root position'],
  [1, '1st inversion'],
  [2, '2nd inversion'],
  [3, 'Varied'],
]

const KEY_ORDERS: [number, string][] = [
  [0, 'Stay in this key'],
  [1, 'Circle of fifths'],
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
  const onStaff = value.drill !== 'symbols' && value.drill !== 'cadence'

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
      {value.drill === 'cadence' && (
        <>
          <Choice
            label="Cadence"
            value={value.cadence}
            options={CADENCES}
            onChange={(cadence) => onChange({ ...value, cadence })}
          />
          <Choice
            label="Right hand starts in"
            value={value.inversion}
            options={INVERSIONS}
            onChange={(inversion) => onChange({ ...value, inversion })}
          />
          <Choice
            label="Keys"
            value={value.cycleKeys ? 1 : 0}
            options={KEY_ORDERS}
            onChange={(order) => onChange({ ...value, cycleKeys: order === 1 })}
          />
        </>
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
