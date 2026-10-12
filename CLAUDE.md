# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

chord_scope is a browser app that visualizes real-time input from a MIDI keyboard: it shows the currently held notes, a grand staff, chord names, roman numerals, scale suggestions, and available tensions/avoid notes. A second view, Practice, turns this around: it shows notes, chords, chord symbols or cadences to play and judges what is played (sight-reading and cadence drills). Everything lives in the frontend — no backend, no persistence.

## Commands

```bash
npm run dev -- --host   # start Vite dev server (http://localhost:5173); must be reachable over
                         # Web MIDI, so use Chrome/Edge/Firefox and grant MIDI permission
npm run build            # tsc -b (project references) then vite build
npm run lint              # oxlint
npm run preview           # preview a production build
```

There is no test suite configured in this repo.

### Checking behaviour without a MIDI keyboard

The UI can be driven in a headless browser with a fake input. Before the app loads, replace `navigator.requestMIDIAccess` with a function resolving to `{ inputs: new Map([['fake', input]]), onstatechange: null }`; `useMidi` assigns `input.onmidimessage` itself, so notes are sent by calling it with `{ data: new Uint8Array([0x90, note, velocity]), timeStamp }` (`0x80` for note-off). Give the events explicit, spaced timestamps: the practice judge treats keys that arrive within `GESTURE_MS` of a completed step as part of the same keystroke.

The pure modules (`src/practice/*.ts`, `src/theory/*.ts`) can be imported straight from the dev server inside the page (`await import('/src/practice/session.ts')`) to check logic against many keys and seeds. How it feels to play still needs a real keyboard.

## Architecture

Data flows in one direction: **MIDI input → music-theory analysis → presentational components**, all wired together in `src/App.tsx`.

- `src/midi/useMidi.ts` — the only place touching the Web MIDI API. Exposes a `useMidi()` hook returning connection `status`, `activeNotes: Map<midiNote, velocity>`, and `subscribe(listener)` for discrete note-on/note-off events (the practice judge needs these: state alone cannot tell a re-struck key from a held one). Handles note-on/note-off (including note-on with velocity 0 as note-off) and device hot-plug via `access.onstatechange`.
- `src/theory/analyze.ts` — pure functions built on `tonal` that turn the raw MIDI note set into music-theory facts:
  - `analyzeNotes` — MIDI numbers → sorted `NoteInfo[]` (name respects the current key's sharps/flats preference)
  - `detectChord` — chord symbol + alternates (needs ≥3 notes)
  - `computeTensions` — given a chord + tonic + mode, splits the current scale's non-chord tones into available tensions vs. avoid notes (avoid = a half-step above a chord tone)
  - `detectScales` — candidate scale names matching the held notes, filtered to a curated `COMMON_SCALE_TYPES` allowlist
  - `detectRomanNumeral` — roman numeral of the chord relative to the tonic
  - `ModalMode` (ionian…locrian) maps to tonal scale-type strings via `TONAL_SCALE_TYPE`
- `src/theory/keys.ts` — `KEY_OPTIONS`: the 15 key signatures around the circle of fifths (including enharmonic pairs like Gb/F#), each with its relative minor tonic and sharps/flats display preference. `nextKeyByFifth` steps through the 12 keys with one spelling per pitch (used when cadence practice travels round the circle).
- `src/theory/roles.ts` — `computeChordRoles` maps each held MIDI note to its chord role (root/3rd/5th/7th/extension), used to color-code notes consistently across the staff, piano keyboard, and chord chips.
- `src/theory/clefs.ts` — `ClefName`, plus staff geometry shared by both views: `CLEF_MIDDLE_LINE` (diatonic position of each clef's middle line) and `staffLine`.
- `src/components/` — presentational only; components receive fully-computed data (`NoteInfo[]`, `ChordResult`, role maps, tension sets) and never call into `theory/` themselves:
  - `StaffView.tsx` — renders the grand staff with VexFlow (SVG), imperatively drawing into a container ref on every relevant prop change. Notes below MIDI 60 (middle C) go on the bottom stave, everything else on top. Key/role coloring is applied via `setKeyStyle` on VexFlow `StaveNote`s.
  - `CircleOfFifths.tsx` — SVG key-selector wedge widget; clicking a wedge again on an enharmonic pair cycles between spellings (e.g. F# ↔ Gb), and re-clicking the already-selected C wedge toggles sharps/flats display since C has no enharmonic equivalent.
  - `PianoKeyboard.tsx`, `NoteInfo.tsx`, `ChordInfo.tsx`, `ScaleInfo.tsx`, `TensionInfo.tsx` — visual readouts driven by the same shared `roles`/`tension` data computed once in `App.tsx`.
  - `PracticeStaff.tsx`, `ChordPrompt.tsx`, `PracticeStats.tsx`, `PracticeSettings.tsx` — the Practice view (see below).
  - `vexKey.ts` — `toVexKey` (`'F#4'` → `'f#/4'`), shared by the two staff components.

### Practice view

`App.tsx` holds `view: 'analyze' | 'practice'`. Practice shows an exercise and waits until it is played correctly — there is no tempo or rhythm. It follows the same one-way shape as the analysis side: **note events → pure reducer → view models → presentational components**. Everything in `src/practice/` except `usePractice.ts` is pure (no React, DOM, `Math.random` or clock).

Five drills (`DrillKind`): `notes` (single notes on one staff), `hands` (one note per staff at once), `chords` (2–4 notes on a staff), `symbols` (chord symbols, any voicing), `cadence` (I–IV–V7–I or I–IV–I6/4–V7–I written out for both hands).

- **Config.** `PracticeSettings` is what the settings panel edits; `PracticeConfig` adds the key (`keySpec`), `minor` and the two clefs. `App.tsx` memoizes it, and a new config object re-deals the exercise (the result log survives). Anything that must not restart the exercise has to stay out of it: the key goes in as `key.spec`, and `minor` is only ever true for the cadence drill.
- `generate.ts` — seeded generation. `generateMeasure(config, seed, slot, prev, keySpec?)` returns one measure of steps and the advanced seed.
  - Notes are spelled from their staff position under the key signature, never from a MIDI number, so Cb4 or E#4 read correctly in the 7-flat/7-sharp keys. `spellForStaff` does the reverse for a wrong key that has to be drawn.
  - Melodies are a weighted random walk over staff positions; `hands` keeps the two notes at least a minor third apart; chords stack diatonic shapes (`CHORD_SHAPES`).
  - Cadences are keyboard-style: three-note right-hand chords from `CADENCE_SHAPES` (one set per starting inversion, common tones kept, V7 without its fifth) over a left-hand bass. `config.minor` uses the relative minor in harmonic form, so V7 gets a raised leading tone (a double sharp in G#, D# and A# minor). Steps carry `chord: { numeral, key }`.
- `session.ts` — `sessionReducer`, the judge:
  - a staff step completes when every target key is down and at least one was struck during the step (a repeated note must be re-struck; a tone shared with the previous chord may stay down). A symbol step completes when the sounding pitch classes equal the chord's, so it is also re-checked on note-off;
  - keys arriving within `GESTURE_MS` of a completion belong to that keystroke: they never count toward the next step, and a stray one marks the completed step as missed;
  - a wrong key is a miss and stays on display (`wrongShown`) until the next one or until the step is completed; after `HINT_AFTER_MISSES` misses the answer is marked on the keyboard. `skip` records the step as skipped;
  - the exercise is a ring of `MEASURES` measures. Finishing a measure replaces it immediately with what comes after the other one, so the next measure can always be read ahead;
  - every measure has its own key (`keys`). They are all `config.keySpec` except while cadences cycle (`cycleKeys`), when each new measure moves one key on with `nextKeyByFifth`;
  - every completed step appends a `StepResult` to `log`;
  - randomness comes from a seed kept in state and time only from event timestamps, which keeps the reducer pure under StrictMode. Updates must stay immutable for the same reason.
- `stats.ts` — `computeStats(log, drill)` derives first-try rate, median reading time, streaks and weak items for one drill. Staff drills are tracked per note (`clef:name`), chord symbols and cadence chords per chord (`'Dm7'`, `'Eb V7'`). Nothing is stored beyond the session.
- `view.ts` — selectors from session state to what components draw: `StaffModel` (measures, each with its own `keySignature`, an optional `keyName`, and steps with a status, the keys per staff and an optional `numeral`), `PromptModel` for chord symbols, and keyboard `KeyMark`s.
- `usePractice.ts` — subscribes to `useMidi` while the view is active and hands `App.tsx` the models, stats, actions and `keySpec` (the key of the measure being played). Models pass through `useStableModel` (a JSON round trip) so the staff is only redrawn when its content changes, not on every key event.
- `PracticeStaff.tsx` draws with VexFlow but places notes on a fixed grid through manual `TickContext`s instead of a `Formatter`: the cursor is then just a cell, and nothing shifts when a measure is swapped. Accidentals are applied per measure and must exist before a note's `ModifierContext` is attached. A measure whose key differs from the one before it gets its own key signature (`ContinuedStave` gives a later measure its clef without drawing one); cadences also get the key name above and roman numerals below.
- `PianoKeyboard` takes optional `marks` to colour keys by judgement instead of velocity.

### Key/mode state in App.tsx

`App.tsx` owns three pieces of interlocking state: `key` (a `KeyOption`), `tonic` (the actual note name analysis is relative to — differs from `key.spec` when in a minor mode), and `mode` (`ModalMode`). `MINOR_MODES` (aeolian/dorian/phrygian/locrian) determines whether `tonic` should track `key.minorTonic` or `key.spec`. Keyboard shortcuts (`[`/`]` to cycle keys by fifths, `m` to toggle major/minor) are wired directly in `App.tsx` via a `keydown` listener and are suppressed while a `<select>`/`<input>` has focus.

- Compare keys by `spec`, never by identity. Re-clicking the C wedge stores a copy of the option with `sharps` flipped, and that copy is not in `KEY_OPTIONS`.
- `shownKey` is the key the selector displays and the one `[`, `]` and `m` act on. It is `key`, except in Practice while cadences cycle, when it follows `practice.keySpec`. `keepShownKey()` copies it into `key` before anything that restarts the exercise (a settings change, switching views, `m`); without that the exercise would drop back to the key the cycle set out from.

### Chord/note display prettification

Raw symbols from `tonal` (e.g. `m7b5`, `Bb`) are cosmetically converted to musical glyphs (♯, ♭, ø) for display only — each component that renders a chord symbol or note name (`ChordInfo.tsx`, `NoteInfo.tsx`, `ScaleInfo.tsx`, `TensionInfo.tsx`, `CircleOfFifths.tsx`, `ChordPrompt.tsx`, `PracticeStats.tsx`, `PracticeStaff.tsx`) has its own small `prettify*` function doing this; the underlying theory functions always work with plain ASCII tonal notation.

## Linting

`oxlint` is configured with `react`, `typescript`, and `oxc` plugins (`.oxlintrc.json`); `react/rules-of-hooks` is an error.
