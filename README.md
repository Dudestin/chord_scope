# chord_scope

MIDIキーボードからのリアルタイム入力をブラウザ上で可視化するWebアプリ。押鍵中の音名・五線譜・コード名をリアルタイムに表示する。

画面上部の切替で、表示された譜面を読んで弾く初見練習 (Practice) モードも使える。

## Practice モード

出題された音符やコード記号を MIDI キーボードで弾くと正誤を判定する。弾かれるまで待つ方式で、テンポやリズムは問わない。間違えたときは、弾き直しても、そのまま次へ進んでもよい (Play through misses)。

- **Single notes** — 片手の単音フレーズ
- **Both hands** — 大譜表の上下段に 1 音ずつ。両手同時に押さえる
- **Chords** — 2〜4 音の和音
- **Chord symbols** — コード記号を読んで、好きなヴォイシングで押さえる (構成音がすべて鳴り、余計な音が無ければ正解)
- **Cadences** — カデンツ (I–IV–V7–I / I–IV–I6/4–V7–I) を譜面どおりに弾く。右手は 3 音の密集配置、左手はバス。短調 (五度圏の内側、または `m`) は和声的短音階で、右手の開始形 (基本形・第1転回形・第2転回形) を選べる。「Keys」を Circle of fifths にすると、1 回弾くたびに五度圏を 1 つ進んで全調を回る

譜面には複数の小節が表示され (既定は 4 小節)、1 小節を弾き終えるとその小節だけが次の出題に差し替わる。弾いている小節の先に、常に続きの小節が見えている。表示する小節数は設定の「Measures」で 1・2・3・4・6・8 から選べる。五線譜は横一列に 4 小節まで並び、それを超えると段を折り返す (ウィンドウが狭いときは譜面全体が縮小される)。コード記号は 1 小節を 1 行に並べる。

調は五度圏 (または `[` `]`) で、音域・最大の跳躍・臨時記号の有無などは鍵盤の下の設定で選ぶ。同じ箇所で 3 回間違えると、正解の鍵盤が表示される。成績 (一発正答率・読むのにかかる時間・苦手な音) はページを開いている間だけ集計する。

- **Wrong keys** — 間違えて弾いた鍵盤を原因別に数える。譜面のドリルでは、調号の見落とし (Key signature)、臨時記号の見落とし (Accidental)、オクターブ違い (Octave)、隣の鍵盤 (Next key)、もう一方の段の音部記号で読んだ音 (Other clef)、線や間の数え違い (A third off)。コード記号では、外した構成音 (3rd / 5th / 7th)。ト音記号とヘ音記号の組み合わせでは、音部記号の読み違いと 3 度のずれは向きでしか区別できないので、1 回ごとではなく回数の偏りを見る
- **Repeat misses** — 間違えた音やコードを、続けて 3 回正しく弾けるまで多めに出題する (カデンツは進行が決まっているので対象外)
- **Play through misses** (既定でオン) — 間違えた鍵盤を弾いたあと、弾き直さずに次の音やコードを弾くと、そのまま先へ進む。弾き直してもよい。進んだ場合、置いていった箇所はミスとして記録される。飛ばせるのは 1 つ先までで、次と同じ鍵盤は弾き直しとして扱う。オフにすると、正しく弾くまで先へ進まない
- **Read ahead** — 小節の 1 つ目を弾くと、その小節の残りが隠れる。弾く前に小節を読み切って、弾いている間は次の小節を読む練習。隠れた箇所で間違えると、その音は表示される

## セットアップ

```bash
npm install
npm run dev -- --host
```

ブラウザで `http://localhost:5173` を開き、MIDIアクセスを許可する。Web MIDI APIに対応した Chrome / Edge / Firefox で動作する。

## デプロイ

`master` に push すると、GitHub Actions (`.github/workflows/deploy.yml`) が lint とビルドを行い、`dist/` を GitHub Pages に公開する。アセットは相対パスで参照しているので (`vite.config.ts` の `base: './'`)、リポジトリ名のサブパスでもそのまま動く。

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
- `src/practice/` — Practice モードの出題生成 (`generate.ts`)・判定 (`session.ts`)・ミスの分類 (`slips.ts`)・成績集計 (`stats.ts`)
- `src/components/PracticeStaff.tsx` / `ChordPrompt.tsx` — 出題の譜面とコード記号の表示
