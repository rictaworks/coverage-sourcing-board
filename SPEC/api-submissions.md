# 投稿の受け取りの API（C3）

確認日：2026-10-16（JST）。この文書は、実装済みの `POST /api/submissions` の仕様です。経路の一覧は `SPEC/api.md`、型は `src/core/api/contract.ts` です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 経路のハンドラー（投稿だけ。一覧と画像は C5 の担当で、まだ 501） | `src/worker/routes/submissions.ts`（`submissionHandlers`） |
| 受け付けの順序（オーケストレーション） | `src/worker/submission/intake.ts`（`SubmissionIntake`） |
| multipart の読み取りと本文の上限 | `src/worker/submission/multipart.ts`（`MultipartReader`） |
| meta（JSON）の検証 | `src/worker/submission/meta.ts`（`SubmissionMetaParser`） |
| 画像の検査（保存用・分類用） | `src/worker/submission/imageGate.ts`（`SubmissionImageGate`） |
| 件数の上限（総数・セッションの 1 日） | `src/worker/submission/quota.ts`（`SubmissionQuota`） |
| 不合格の例外（応答の形を作る） | `src/worker/submission/failure.ts`（`SubmissionFailure`） |
| D1 の読み書き | `src/worker/repo/submissionRepo.ts`（`SubmissionRepo`） |
| 設定（本文の上限・ブラウザ判定の項目・ID の長さ） | `src/config/submission.ts` |
| 開発者向けの例外の文言 | `src/config/strings/submission.ts` |

## 2. 要求

- `Content-Type: multipart/form-data`。フィールドは `SUBMISSION_FORM_FIELDS` のとおりです。
  - `image`：保存する JPEG（長辺 1,600 px 以下、1,900,000 バイト以下）。
  - `thumb`：分類用の縮小 JPEG（長辺 512 px 以下、150,000 バイト以下）。保存しません。
  - `meta`：投稿の情報の JSON 文字列（下の 2.1）。判定結果（ブラウザが送る）も含みます。
  - `website_url`：ハニーポット欄。人は入力しません。値があれば拒否します。
- 本文の上限は `SUBMISSION_CONFIG.bodyMaxBytes`（保存用・分類用・余白の合計）です。Content-Length があれば、本文を読む前に上限と比べて 413 にします（数でない値は 400）。そのうえで、ストリームを読みながら数えます（Content-Length は信用しません）。超えたら 413（`payload_too_large`）です。

### 2.1 meta（JSON）

| キー | 型 | 検証 |
|---|---|---|
| `cellId` | 文字列 | 1〜128 文字。このセッションのマスの ID。他のセッションのマスは 400 |
| `shotMonth` | 整数 | 1〜12 |
| `spotName` | 文字列 | 前後の空白を除き、20 字以内（コードポイント数）。制御文字は不可。空欄は同一地点の判定を行わない |
| `caption` | 文字列 | 60 字以内。制御文字は不可。空欄可 |
| `phash` | 文字列 | 16 文字の 16 進（知覚ハッシュ） |
| `declaredOriginal` | 真偽値 | 必ず true。false なら 400（`declaration_required`） |
| `consent` | 真偽値 | 必ず true。false なら 400（`declaration_required`） |
| `checks` | 配列 | `{ item, verdict, reasonCode }`。item は `BROWSER_CHECK_ITEMS`（10 項目）のすべてを 1 回ずつ含む（欠けた項目や重複は 400 `invalid_request`）。verdict は pass・review・fail。reasonCode は `REASON` の値 |
| `resubmittedFrom` | 文字列または null | 再投稿の元の投稿の ID（省略可） |

## 3. 検証の順序

| 順 | 検証 | 失敗の応答 |
|---|---|---|
| 1 | 形式（multipart）、本文の上限、ハニーポット | 400 `invalid_request`・413 `payload_too_large`。ハニーポットは理由を返しません |
| 2 | 保存中の投稿の総数（全セッション）が 200 件以上 | 503 `storage_paused` |
| 3 | このセッションの 1 日の件数（UTC 0 時から。JST の 9 時）が 20 件以上 | 429 `daily_limit_reached` |
| 4 | meta の形、申告と同意 | 400 `invalid_request`・`declaration_required` |
| 5 | マスが自分のキャンペーンにある。採用数が必要数以上（募集終了） | 400 `invalid_request`・409 `cell_closed` |
| 5b | 再投稿の元（同じセッションの returned で、再投稿可能） | 409 `invalid_state` |
| 6 | 保存用の JPEG：JPEG の検査（B4）、長辺、バイト数、横向き、4:3 の比率（±1%）、最小短辺 | 400 `unsupported_image`・`metadata_not_allowed`・`trailing_bytes`・`invalid_request`（長辺・バイト数）・`submission_rejected`（横向き・比率・短辺） |
| 7 | 縮小 JPEG：JPEG の検査、長辺 512 px 以下、150,000 バイト以下 | 400 `unsupported_image`・`invalid_request` |
| 8 | ブラウザの判定に fail が 1 つでもある | 400 `submission_rejected`（reasons） |
| 9 | 重複：同一画像（距離 4 以下は fail、5〜8 は review）、同一地点（同じマス内で地点名が一致は review） | 400 `submission_rejected`（同一画像の fail のみ）。review は保存 |

- 6 と 7 の JPEG の検査は、再エンコードせずに行います（CLAUDE.md 8）。APP1・APP2〜APP15（ICC の APP2 を含む）・COM は、許可リストにないため拒否します。
- `submission_rejected` の応答は `reasons`（`{ item, reasonCode }` の配列）を含みます。文言は、フロントが `src/config/strings/checks.ts` から引きます。
- 重複の比較の対象は、同じセッションの保存済みの投稿（pending_review・accepted・returned）です。再投稿の元は比較から外します。
- 被写体の推定（`subjectHintFactory`）は、保存（挿入）の後で呼びます。上限に当たった要求では呼びません。失敗しても投稿は止めません（推定なしで保存します）。
- 季節と撮影月の整合：撮影月がマスの期間の月に含まれないときは、ブラウザが `shoot_month_season` を合格にしていても、Worker が要確認（`shoot_month_mismatch`）に置き換えて保存します（不合格にはしません）。ブラウザが不合格または要確認にしていれば、その判定を変えません。

## 4. 保存

- 上限（総数 200 件・セッションの 1 日 20 件）の判定と投稿の挿入は、1 つの `INSERT ... SELECT ... WHERE` の文で行います（並行の要求でも超えません）。判定結果の行は、同じ batch の中で、投稿が挿入されたときだけ入ります。挿入された行数（changes）が 0 なら、総数の上限なら 503（`storage_paused`）、そうでなければ 429（`daily_limit_reached`）を返します。手順 2・3 の確認は、早めに断るためのもので、最終の判定は挿入の文の条件です。被写体の推定の行は、挿入の後の 1 回の INSERT で足します。

- `submission`：`status = pending_review`、`over_quota = 0`、`declared_original`・`consent` は 1、`resubmitted_from` は再投稿の元。画像は保存用の JPEG のバイト列（再エンコードしない）。
- `check_result`：ブラウザの判定（10 項目）と重複の判定（2 項目）は、投稿と同じ D1 の batch で保存します。被写体の推定（`subject_kind`、verdict は info）は、その後に足します。被写体の推定が無いときは reason に `none` を残します。
- 位置情報（緯度・経度）と機種情報は保存しません。縮小 JPEG は保存しません。

## 5. 応答

- 201：`{ id, status: "pending_review", checks: [{ item, verdict, reasonCode }], subject }`。`subject` は `SubjectHintResult`（推定なしは `{ status: "none" }`）です。
- 400・409・413・429・503：`{ code, message }`。`submission_rejected` のみ `reasons` を含みます。message は `src/config/strings/apiErrors.ts` から引きます。

## 6. 契約からの逸脱（人の確認が必要）

- Issue の一部のコード（`intake_paused`・`session_daily_limit`）は、契約にある `storage_paused`・`daily_limit_reached` を使いました。契約に無いコードを増やさないためです。
- 寸法の違反は、契約の `submission_rejected`（理由つき）に載せました。長辺・バイト数の違反は、理由のコードが無いため `invalid_request` です。
- 判定結果とハニーポットは、Issue の「判定結果の JSON」というフィールドではなく、`meta`（JSON）の中に入れました（契約の四つのフィールドに従うため）。
- 再投稿の元（`resubmittedFrom`）は、契約の `SubmissionMeta` に無いため、この文書で定めました。
- 1 日の件数は、保存された投稿の件数で数えます（拒否された試行は数えません）。
- 季節と撮影月の整合は、要確認として実装しました（3 の下の説明）。マスの期間の月（`period.months`）で判定します。
- 同じ元の投稿からの再投稿：再投稿は、元の投稿が `returned` で、`review.resubmittable = 1` のときだけ受け付けます。元の投稿ごとの再投稿の回数の制限や、同じ元からの二重の再投稿の拒否は、まだ実装していません（現状は 1 日の件数と総数の上限だけで制限します）。

- 既知の制約：重複の判定に使う `phash` はブラウザの申告値のため、改ざんすると同一画像の重複の判定を回避できます。Worker が画像を再エンコードしない制約（CPU 時間）と両立しないため、サーバー側では再計算しません。
- トレース：拒否のとき `submission.rejected` を残します（拒否の種類 `failureCode`、状態コード、理由のコード `reasonCode` だけ。説明文・地点名・Cookie・IP・画像は含めません）。上限による拒否は、`failureCode` が `storage_paused`（総数）か `daily_limit_reached`（1 日の件数）で区別できます。
- 被写体の推定の行を足すとき（`addCheck`）に投稿の行が無ければ（03:00 の全削除と重なった場合）、明示的な内部エラー（500）にします。

## 7. テスト

- `test/workers/submissions.worker.test.ts`：各検査の拒否（EXIF・余分なバイト・SVG・縦向き・比率・短辺・長辺・バイト数・縮小画像）、ハニーポット、申告、マスの状態（他のセッション・募集終了）、重複（距離 0・4・6）、同一地点、季節の違い、被写体の推定（AI なし）、保存の内容（バイト列の一致・位置情報の列がないこと）、再投稿。
- `test/workers/submissionQuota.worker.test.ts`：UTC 0 時の境界、セッションの 1 日の上限（20 件）、総数の上限（199 件は受け付け、200 件で 503）。
- `test/workers/submissionTrace.worker.test.ts`：拒否のトレース（個人情報を含まないこと）と、`addCheck` の行なしの扱い。
- 実行は `npm test`（workers プロジェクト）。
