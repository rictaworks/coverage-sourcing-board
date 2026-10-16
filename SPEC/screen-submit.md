# 投稿と判定結果の画面（D4）

確認日：2026-10-16（JST）。この文書は、実装済みの `/submit` の仕様です。要件の正は requirements.md の 2.1・3.2・3.3・3.8・4 章です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 画面の入口（Suspense で囲む） | `src/frontend/app/submit/page.tsx` |
| 画面の本体（状態の管理・判定・送信） | `src/frontend/components/submit/SubmitScreen.tsx` |
| 写真の段階（D3 の部品を使う） | `src/frontend/components/submit/PhotoStep.tsx` |
| 入力欄（市町村・撮影月・地点名・説明文・申告・同意・ハニーポット） | `SubmitForm.tsx`・`AreaSelect.tsx`・`MonthSelect.tsx`・`DeclarationChecks.tsx`・`HoneypotField.tsx` |
| 判定結果の表示と被写体の推定（補助） | `src/frontend/components/submit/JudgeResult.tsx` |
| 一次判定・入力の検査・マスの解決 | `src/frontend/lib/submit/runChecks.ts` |
| multipart の組み立てと送信 | `src/frontend/lib/submit/submitApi.ts` |
| 文言（機能ごと） | `src/config/strings/submit.ts` |

判定結果は、独立した URL を作らず、同じ `/submit` の中に表示します。

## 2. 画面の流れ

1. 写真を選ぶ（JPEG または PNG、5 MB 以下、横向き）。枠を確定すると、保存用の画像と特徴量ができます（D3）。写真の段階は、キャンペーンの読み込みを待ちません。
2. 入力欄を埋める。市町村は、キャンペーンの区分値からだけ選びます。撮影月（1〜12）は必須で、季節は月から導出します。
3. 「一次判定をする」で判定します。入力の検査（欄の誤り）の後、マスを確認し（募集終了・期間の外・マスなし）、B3 の判定を行います。
4. 不合格が 1 つでもあれば送信しません。要確認または合格だけなら「送信する」を表示します。
5. 送信中は、ボタンを無効にし、送信の要求は 1 回だけ送ります。
6. 201 で「投稿を受け付けました」（確認待ち）を表示します。受付番号と、被写体の推定（補助）を示します。

入力や写真を変えると、判定と送信の結果は無効になります。確認待ちの後は、入力と写真を初めに戻します。

## 3. 入力欄と検査

| 欄 | 必須 | 検査（上限は `src/config/limits.ts`） |
|---|---|---|
| 市町村（区分） | 必須 | キャンペーンの区分値だけ。空は誤り |
| 撮影月 | 必須 | 1〜12 の整数。未選択は誤り |
| 地点名 | 任意 | 前後の空白を除いて 20 字以内（コードポイント）。制御文字は不可 |
| 一行説明 | 任意 | 60 字以内。制御文字は不可（改行を含めない） |
| 申告（AI で生成していない・他で使っていない） | 必須 | 両方にチェック。未チェックは誤り |
| 同意 | 必須 | チェック。未チェックは誤り |
| ハニーポット（website_url） | — | 人には見せない（画面の外に置き、`aria-hidden`・`tabindex="-1"`・`autocomplete="off"`）。値があれば、ブラウザは送信せず（`SubmitApi`）、Worker も拒否 |

字数は入力中に残りを示します。Worker は同じ上限で検査します（SPEC/api-submissions.md）。

マスの扱い：区分と撮影月から、撮影月を含む期間のマスを選びます。募集終了（充足の応答の `closed`）のマスは、判定に進めません。撮影月がどの期間にも含まれないときも、判定に進めません。

## 4. 一次判定（B3）

- `Validator`（B3）を、保存する画像の寸法と大きさで実行します。Worker も保存する画像で検査するため、比率と寸法が揃います。
- 昼間の判定は、選んだ区分値の県の県庁所在地の座標だけで行います（`SubmissionChecker.daytimeFor`）。
- 品質を推定できない元の画像（PNG など）は、`jpeg_quality` を判定しません。Worker は 10 項目を求めるため、この項目は合格（`passed`）として送ります。
- 送るのは、項目ごとに 1 件です（Worker の `meta.checks`）。同じ項目に複数の理由があるときは、不合格を優先します。画面には、すべての理由を表示します。
- 理由の文言と修正方法は `src/config/strings/checks.ts`（CHECK_REASON_TEXT）から引きます。

## 5. 送信（POST /api/submissions）

- multipart のフィールド：`image`（保存用の JPEG）・`thumb`（分類用の縮小 JPEG）・`meta`（JSON）・`website_url`（ハニーポット。通常は空）。
- `meta`：`cellId`・`shotMonth`・`spotName`・`caption`・`phash`・`checks`（10 項目）・`declaredOriginal`・`consent`・`resubmittedFrom`。
- 位置情報・機種情報などの EXIF の値は、送りません（`submitApi.test.ts` で確かめます）。
- 再投稿：`/submit?resubmit=<投稿の ID>` で開くと、`resubmittedFrom` にその ID を付けて送ります。画面に、再投稿として送ることを示します。

### 応答と表示

| 応答 | 表示 |
|---|---|
| 201 | 「投稿を受け付けました」（確認待ち）。応答の `checks` のうち要確認の項目（`RequiredChecks`。なければ「要確認の項目はありません」）。被写体の推定。上限の再開の案内（`resumeNotice`）があれば、その文言 |
| 400 `submission_rejected` | サーバーの理由と修正方法（同一画像の不合格など） |
| 400・409・413・429・503 | `src/config/strings/apiErrors.ts` の文言（上限・募集終了・保存中の一時停止など） |
| 本文の形式が合わない | 通信の失敗の文言（代わりの値は作りません） |

被写体の推定は補助です。推定できないときは「被写体の推定はありません」を示します。

## 6. テスト

- 単体（Vitest）：`test/unit/frontend/runChecks.test.ts`（一次判定の組み立て・マスの解決・入力の検査）、`test/unit/frontend/submitApi.test.ts`（multipart の中身・送信の応答）。
- ブラウザ（Playwright）：`test/e2e/submit.spec.ts`。写真から判定、確認待ち、申告と同意の未チェック、地点名 21 字、縦向き、同一画像の 2 回目、二重送信、ハニーポット、再投稿の入口、スマートフォンの幅。

## 7. 未確定・既知の制約

- 再投稿の初期値：`/submit?resubmit=<投稿の ID>` で開くと、`GET /api/submissions/mine` の応答から元の投稿を ID で引き、その `cellId` のマスの市町村（区分）を初期値にします（`ResubmitPrefill`）。応答は `cellId` を持ちますが、撮影月（`shotMonth`）を持たないため、撮影月は推測せず空のままにします（画面にその旨の案内を出します）。元の投稿またはマスが見つからないとき、応答の読み込みに失敗したときは、初期値を入れず、案内を出します。撮影月を初期値にするには、mine の応答に `shotMonth` が必要です（C5 側の変更。人の判断が必要です）。
- 区分の初期値は `?area=<区分の ID>` と、再投稿の `?resubmit=<投稿の ID>`（D5 の導線）に対応します。`?period=` は使いません。
- 「トリミング枠に戻る」の操作は、写真を選び直す操作で代えています。比率は保存する画像で判定するため、通常は比率の不合格になりません。
- 地点名の 20 字の数え方：ブラウザ（`SubmitFormRules`）は、前後の空白を除いた地点名だけをコードポイントで数えます。Worker（`src/worker/submission/meta.ts` の `textField`）も、前後の空白を除いた地点名だけをコードポイントで数えるため、両者は一致しています。どちらも市町村名を含めません。要件 3.0 の「市町村名を含めて 20 字」とは扱いが違う可能性があり、これは人の確認が必要です（確認事項は残ります）。
- 申告と同意は、ブラウザと Worker の両方で検査します。Worker 側の検査は `test/workers/submissions.worker.test.ts` で確かめます。
