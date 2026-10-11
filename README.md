# chord_scope

MIDIキーボードからのリアルタイム入力をブラウザ上で可視化するWebアプリ。押鍵中の音名・五線譜・コード名をリアルタイムに表示する。

画面上部の切替で、表示された譜面を読んで弾く初見練習 (Practice) モードも使える。

## Practice モード

出題された音符やコード記号を MIDI キーボードで弾くと正誤を判定する。正しい鍵盤を弾くまで待つ方式で、テンポやリズムは問わない。

- **Single notes** — 片手の単音フレーズ
- **Both hands** — 大譜表の上下段に 1 音ずつ。両手同時に押さえる
- **Chords** — 2〜4 音の和音
- **Chord symbols** — コード記号を読んで、好きなヴォイシングで押さえる (構成音がすべて鳴り、余計な音が無ければ正解)

譜面は 2 小節ぶん表示され、1 小節を弾き終えるとその小節だけが次の出題に差し替わる。弾いている小節の隣に、常に次の小節が見えている。

調は五度圏 (または `[` `]`) で、音域・最大の跳躍・臨時記号の有無などは鍵盤の下の設定で選ぶ。同じ箇所で 3 回間違えると、正解の鍵盤が表示される。成績 (一発正答率・読むのにかかる時間・苦手な音) はページを開いている間だけ集計する。

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
- `src/practice/` — Practice モードの出題生成 (`generate.ts`)・判定 (`session.ts`)・成績集計 (`stats.ts`)
- `src/components/PracticeStaff.tsx` / `ChordPrompt.tsx` — 出題の譜面とコード記号の表示
