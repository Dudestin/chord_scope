# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

chord_scope is a browser app that visualizes real-time input from a MIDI keyboard: it shows the currently held notes, a grand staff, chord names, roman numerals, scale suggestions, and available tensions/avoid notes. Everything lives in the frontend — no backend, no persistence.

## Commands

```bash
npm run dev -- --host   # start Vite dev server (http://localhost:5173); must be reachable over
                         # Web MIDI, so use Chrome/Edge/Firefox and grant MIDI permission
npm run build            # tsc -b (project references) then vite build
npm run lint              # oxlint
npm run preview           # preview a production build
```

There is no test suite configured in this repo.

## Architecture

Data flows in one direction: **MIDI input → music-theory analysis → presentational components**, all wired together in `src/App.tsx`.

- `src/midi/useMidi.ts` — the only place touching the Web MIDI API. Exposes a `useMidi()` hook returning connection `status` and `activeNotes: Map<midiNote, velocity>`. Handles note-on/note-off (including note-on with velocity 0 as note-off) and device hot-plug via `access.onstatechange`.
- `src/theory/analyze.ts` — pure functions built on `tonal` that turn the raw MIDI note set into music-theory facts:
  - `analyzeNotes` — MIDI numbers → sorted `NoteInfo[]` (name respects the current key's sharps/flats preference)
  - `detectChord` — chord symbol + alternates (needs ≥3 notes)
  - `computeTensions` — given a chord + tonic + mode, splits the current scale's non-chord tones into available tensions vs. avoid notes (avoid = a half-step above a chord tone)
  - `detectScales` — candidate scale names matching the held notes, filtered to a curated `COMMON_SCALE_TYPES` allowlist
  - `detectRomanNumeral` — roman numeral of the chord relative to the tonic
  - `ModalMode` (ionian…locrian) maps to tonal scale-type strings via `TONAL_SCALE_TYPE`
- `src/theory/keys.ts` — `KEY_OPTIONS`: the 15 key signatures around the circle of fifths (including enharmonic pairs like Gb/F#), each with its relative minor tonic and sharps/flats display preference.
- `src/theory/roles.ts` — `computeChordRoles` maps each held MIDI note to its chord role (root/3rd/5th/7th/extension), used to color-code notes consistently across the staff, piano keyboard, and chord chips.
- `src/components/` — presentational only; components receive fully-computed data (`NoteInfo[]`, `ChordResult`, role maps, tension sets) and never call into `theory/` themselves:
  - `StaffView.tsx` — renders the grand staff with VexFlow (SVG), imperatively drawing into a container ref on every relevant prop change. Notes below MIDI 60 (middle C) go on the bottom stave, everything else on top. Key/role coloring is applied via `setKeyStyle` on VexFlow `StaveNote`s.
  - `CircleOfFifths.tsx` — SVG key-selector wedge widget; clicking a wedge again on an enharmonic pair cycles between spellings (e.g. F# ↔ Gb), and re-clicking the already-selected C wedge toggles sharps/flats display since C has no enharmonic equivalent.
  - `PianoKeyboard.tsx`, `NoteInfo.tsx`, `ChordInfo.tsx`, `ScaleInfo.tsx`, `TensionInfo.tsx` — visual readouts driven by the same shared `roles`/`tension` data computed once in `App.tsx`.

### Key/mode state in App.tsx

`App.tsx` owns three pieces of interlocking state: `key` (a `KeyOption`), `tonic` (the actual note name analysis is relative to — differs from `key.spec` when in a minor mode), and `mode` (`ModalMode`). `MINOR_MODES` (aeolian/dorian/phrygian/locrian) determines whether `tonic` should track `key.minorTonic` or `key.spec`. Keyboard shortcuts (`[`/`]` to cycle keys by fifths, `m` to toggle major/minor) are wired directly in `App.tsx` via a `keydown` listener and are suppressed while a `<select>`/`<input>` has focus.

### Chord/note display prettification

Raw symbols from `tonal` (e.g. `m7b5`, `Bb`) are cosmetically converted to musical glyphs (♯, ♭, ø) for display only — each component that renders a chord symbol or note name (`ChordInfo.tsx`, `NoteInfo.tsx`, `ScaleInfo.tsx`, `TensionInfo.tsx`, `CircleOfFifths.tsx`) has its own small `prettify*` function doing this; the underlying theory functions always work with plain ASCII tonal notation.

## Linting

`oxlint` is configured with `react`, `typescript`, and `oxc` plugins (`.oxlintrc.json`); `react/rules-of-hooks` is an error.
