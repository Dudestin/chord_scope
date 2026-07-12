# chord_scope

MIDIキーボードからのリアルタイム入力をブラウザ上で可視化するWebアプリ。押鍵中の音名・五線譜・コード名をリアルタイムに表示する。

## セットアップ

```bash
npm install
npm run dev -- --host
```

ブラウザで `http://localhost:5173` を開き、MIDIアクセスを許可する。Web MIDI APIに対応した Chrome / Edge / Firefox で動作する。

## 技術スタック

- Vite + React + TypeScript
- [VexFlow](https://www.vexflow.com/) — 五線譜描画
- [tonal](https://github.com/tonaljs/tonal) — 音楽理論(音名変換・コード判定)
- Web MIDI API — MIDI入力

## 構成

- `src/midi/useMidi.ts` — Web MIDI APIへの接続と押鍵状態の管理
- `src/theory/analyze.ts` — MIDIノート番号から音名・コードを算出
- `src/components/StaffView.tsx` — 大譜表(ト音+ヘ音)の描画
- `src/components/NoteInfo.tsx` / `ChordInfo.tsx` — 音名・コード名の表示
