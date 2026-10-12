import type { SlipKind } from '../practice/slips'
import type { PracticeStats as Stats, WeakItem } from '../practice/stats'

// What each kind of wrong key is called, and the reading behind the name.
const SLIPS: Record<SlipKind, [string, string]> = {
  signature: ['Key signature', 'Played the natural of a note the key signature alters'],
  accidental: ['Accidental', 'Played the note without the accidental written in front of it'],
  octave: ['Octave', 'The right note in the wrong octave'],
  step: ['Next key', 'A key right beside the one that was asked for'],
  clef: ['Other clef', "The note this line would be in the other staff's clef"],
  third: ['A third off', 'A line or a space too high or too low'],
  chordThird: ['3rd', "The chord's other third: major for minor or minor for major"],
  chordFifth: ['5th', 'A fifth the chord does not have'],
  chordSeventh: ['7th', 'A seventh the chord does not have'],
  other: ['Other', 'Wrong keys that fit none of the patterns'],
}

function prettifyLabel(label: string): string {
  return label
    .replace(/m7b5/g, 'ø7')
    .replace(/#/g, '♯')
    .replace(/b(?=\d)/g, '♭')
    .replace(/([A-G])b/g, '$1♭')
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

// A missed item says how often; one that is only slow says how slow.
function weakDetail(item: WeakItem): string {
  if (item.missed > 0) return `${item.missed} of ${item.attempts}`
  return item.medianMs === null ? '' : seconds(item.medianMs)
}

interface PracticeStatsProps {
  stats: Stats
  onSkip: () => void
  onReset: () => void
}

export function PracticeStats({ stats, onSkip, onReset }: PracticeStatsProps) {
  // The clef only matters once the same note name can come from two staves.
  const showClef = new Set(stats.weak.map((item) => item.clef)).size > 1

  return (
    <div className="practice-stats">
      {stats.completed === 0 ? (
        <p className="practice-stats-empty">Play what is highlighted to start.</p>
      ) : (
        <dl className="practice-figures">
          <div>
            <dt>First try</dt>
            <dd>
              {Math.round((stats.clean / stats.completed) * 100)}%
              <span>
                {stats.clean} of {stats.completed}
              </span>
            </dd>
          </div>
          <div>
            <dt>Reading time</dt>
            <dd>{stats.medianMs === null ? '–' : seconds(stats.medianMs)}</dd>
          </div>
          <div>
            <dt>In a row</dt>
            <dd>
              {stats.streak}
              <span>best {stats.bestStreak}</span>
            </dd>
          </div>
        </dl>
      )}
      <div className="practice-actions">
        <button type="button" onClick={onSkip}>
          Skip
        </button>
        <button type="button" onClick={onReset} disabled={stats.completed === 0}>
          Reset stats
        </button>
      </div>
      <div className="practice-weak">
        {stats.weak.length > 0 && <span className="practice-weak-label">Needs work</span>}
        {stats.weak.map((item) => (
          <span key={item.key} className="practice-weak-chip">
            {prettifyLabel(item.label)}
            {showClef && item.clef && <span className="practice-weak-clef">{item.clef}</span>}
            <span className="practice-weak-detail">{weakDetail(item)}</span>
          </span>
        ))}
      </div>
      <div className="practice-slips">
        {stats.slips.length > 0 && <span className="practice-weak-label">Wrong keys</span>}
        {stats.slips.map(({ kind, count }) => (
          <span key={kind} className="practice-slip-chip" title={SLIPS[kind][1]}>
            {SLIPS[kind][0]}
            <span className="practice-weak-detail">{count}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
