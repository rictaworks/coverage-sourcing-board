# 最終確認と投稿の参照の API（C5）

確認日：2026-10-16（JST）。この文書は、実装済みの審査の API の仕様です。経路の一覧は `SPEC/api.md`、型の正は `src/core/api/contract.ts` です（下の 6 章の逸脱を参照）。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 状態遷移（純粋） | `src/core/review/reviewService.ts`（`ReviewService`、`ReviewError`） |
| 経路のハンドラー | `src/worker/routes/review.ts`（`reviewHandlers`、`ReviewRoutes`） |
| 行の読み書き | `src/worker/repo/reviewRepo.ts`（`ReviewRepo`） |
| 文言（審査の API） | `src/config/strings/review.ts` |
| 枠の判定 | `src/core/campaign/coverageCalculator.ts`（B1）。1 マス分のキャンペーンを作って計算する |
| 候補（同一画像・同一地点） | `src/core/validation/duplicateChecker.ts`（B3 の判定を再利用する） |

## 2. 状態遷移（requirements 10.1）

| 操作 | 許される遷移 | 許されない遷移 |
|---|---|---|
| 採用（accept） | `pending_review` → `accepted` | それ以外は 409（`invalid_state`） |
| 差し戻し（return） | `pending_review` → `returned` | それ以外は 409 |
| 採用の取り消し（revoke） | `accepted` → `returned`（差し戻し扱い） | それ以外は 409 |

- 採用の枠：採用数が必要数未満なら採用します。必要数に達していれば、確認の印（`confirmOverQuota: true`）が無い限り 409（`over_quota_confirmation_required`）です。印があれば超過採用（`over_quota = 1`）として採用します。
- 書き込みは、review の行と submission の行を 1 回の D1 の batch で行います。条件（元の状態・枠）は、書き込みの SQL の中でも確かめます（同時の要求で枠を超えないように）。
- 取り消しの後は、採用数が減るため、マスは再び募集中になります（`GET /api/coverage` で確かめます）。
- 再投稿（`returned` から `checking`）は C3 の担当です。この API は、再投稿の可否（`resubmittable`）を返すまでです。

## 3. 経路

すべての経路は、このセッションのデータだけを扱います。他のセッションの投稿の ID は 404（`not_found`）です。ID の形式が違う場合も 404 です。

| 経路 | 応答 | 内容 |
|---|---|---|
| `GET /api/review/queue` | 200 | 確認キュー（`items`）と、取り消しのための採用済みの一覧（`accepted`） |
| `POST /api/review/:id/accept` | 200・400・404・409 | 要求 `{ "confirmOverQuota": true }`（省略は false。真偽値以外は 400） |
| `POST /api/review/:id/return` | 200・400・404・409 | 要求 `{ "reasonCode", "freeText", "resubmittable" }` |
| `POST /api/review/:id/revoke` | 200・400・404・409 | 要求は差し戻しと同じ |
| `GET /api/submissions/mine` | 200 | 自分の投稿の一覧（確認中の行は含めない） |
| `GET /api/submissions/:id/image` | 200・404 | 画像（JPEG）。`Content-Type: image/jpeg`、`X-Content-Type-Options: nosniff`、`Content-Disposition: inline` |

### 確認キューの 1 件（`items[]`）

- `id`・`cellId`・`shotMonth`・`spotName`・`caption`（画像の中身は含めない）
- `checks`：要確認（verdict が `review`）の判定の項目と理由のコード。被写体の推定の行は含めない。
- `subject`：被写体の推定（補助）。`{ "status": "estimated", "kind", "confidence", "model" }` か `{ "status": "none" }`。
- `candidateIds`：同じ画像（距離が要確認の範囲）または同じマスの同じ地点名の、既存の投稿（確認待ち・採用済み）の ID。

### 採用済みの 1 件（`accepted[]`）

`id`・`cellId`・`shotMonth`・`spotName`・`caption`・`overQuota`。

### 差し戻し・取り消しの応答

`{ "id", "status": "returned", "overQuota", "returnInfo": { "reasonCode", "freeText", "resubmittable" } }`

### 採用の応答

`{ "id", "status": "accepted", "overQuota" }`

### 自分の投稿の 1 件（`items[]`）

`id`・`cellId`・`status`・`createdAt`・`returnInfo`（差し戻しのときだけ。それ以外は null）・`shotMonth`・`spotName`・`caption`・`overQuota`。

## 4. 差し戻しの理由

- 理由のコードは契約の `RETURN_REASON_CODES`（`ratio`・`resolution`・`shoot_declaration`・`subject`・`other`）。一覧に無ければ 400（`invalid_request`）です。
- 自由記述は、前後の空白と連続する空白を除いて保存します。上限は `LIMITS.returnReasonMaxChars`（仮の値 200 字）で、超えると 400 です。理由が `other` のときは、自由記述が必要です（空だと 400）。
- 自由記述は HTML として扱いません（文字列のまま保存し、表示は文字として描画する）。
- 保存の形：review 行の `reason` 列に JSON（`{"reasonCode","freeText"}`）を入れ、`resubmittable` 列に再投稿の可否を入れます。自由記述の列が無いためです（6 章を参照）。

## 5. エラー

| 状況 | 状態 | code | message の出どころ |
|---|---|---|---|
| 本文の形が違う・理由のコードが一覧に無い・自由記述が長すぎる・その他で自由記述が無い | 400 | `invalid_request` | 形：`API_ERROR_MESSAGES`、範囲：`REVIEW_ERROR_MESSAGES` |
| 投稿が無い（他のセッションを含む）・ID の形式が違う | 404 | `not_found` | `API_ERROR_MESSAGES` |
| 状態が許されない（例：pending_review でない投稿の採用） | 409 | `invalid_state` | `API_ERROR_MESSAGES` |
| 枠を超える採用で、確認の印が無い | 409 | `over_quota_confirmation_required` | `REVIEW_ERROR_MESSAGES` |

## 6. 契約からの逸脱（人の確認が必要）

`src/core/api/contract.ts` と `src/core/api/paths.ts` は、この Issue の編集の範囲外のため変えていません。次の点を、人が決めて契約に反映してください。

1. 採用の要求は、契約の `AcceptRequest`（`overQuota`）ではなく、Issue の決定どおり `confirmOverQuota` を使います。
2. 確認キューの項目は、契約の `spotMatchIds` ではなく `candidateIds`（同一画像と同一地点の候補）を使います。キューの応答には `accepted` を加えました。
3. `over_quota_confirmation_required` は、契約の `API_ERROR_CODES` に無いコードです。
4. 差し戻し・取り消しの応答に `returnInfo` を加えました。取り消しは、差し戻しと同じ理由の入力を必要とします（差し戻し扱いの理由を残すため）。
5. 差し戻しの自由記述は、保存の列が無いため、review の `reason` 列に JSON で入れています。専用の列を作るなら、マイグレーションが必要です（この Issue の範囲外）。
6. 取り消しの後も `over_quota` は残します（過去に超過採用されたことの記録）。
7. `GET /api/submissions/mine` と `GET /api/submissions/:id/image` は、C3 の `submissions.ts` ではなく、`reviewHandlers`（`review.ts`）から登録して C1 の 501 を上書きしています。C3 が `submissions.ts` を実装するときに、これらを移してください。
8. 画像の `Cache-Control` は、仕様の `private, no-store` ではなく `no-store` になります。基盤の `ApiResponder.finish`（`src/worker/http/responses.ts`）が全応答に `no-store` を上書きするためです。`private, no-store` にするには、基盤の変更が必要です（この Issue の範囲外）。

## 7. 被写体の推定の行（C3 との約束）

C3 は、被写体の推定の結果を `check_result` に次のとおり保存してください。審査の API は、この形を読みます。

- `item` = `subject_kind`、`verdict` = `info`、`reason` = 区分（`landscape`・`closeup`・`people`・`other`）、`confidence` と `model` を入れる。
- 推定なし（上限・失敗）の場合は、この行を作らないか、区分以外の `reason` を入れる（審査の API は推定なしとして扱う）。

## 8. テスト

- `test/unit/core/reviewService.test.ts`：状態遷移の全組み合わせ、枠の判定、差し戻しの検証、理由の保存形式、被写体の推定の読み取り。
- `test/workers/review.worker.test.ts`：キュー、採用（枠内・超過・確認の印・409）、差し戻し（検証・400）、取り消し（マスが募集中に戻る）、他のセッションの隔離（404）、画像の配信、Origin の検査。
- `test/workers/mine.worker.test.ts`：自分の投稿の一覧（差し戻しの内容・超過採用・他のセッションの隔離）。
- 実行は `npm test`（workers プロジェクト。`*.worker.test.ts` の名前にしています。C1 と C2 と同じ理由です）。
