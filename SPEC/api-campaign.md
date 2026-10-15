# キャンペーンと充足マップの API（C2）

確認日：2026-10-16（JST）。この文書は、実装済みのキャンペーンと充足の API の仕様です。経路の一覧は `SPEC/api.md`、型は `src/core/api/contract.ts`（契約）と `src/worker/routes/campaign.ts`（キャンペーンの応答）です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 経路のハンドラー | `src/worker/routes/campaign.ts`（`campaignHandlers`、`CampaignRoutes`） |
| キャンペーンの行の読み書き | `src/worker/repo/campaignRepo.ts`（`CampaignRepo`） |
| 件数の読み取り | `src/worker/repo/coverageRepo.ts`（`CoverageRepo`） |
| 設定（テンプレートの ID・入力の上限・既定値） | `src/config/campaignApi.ts` |
| 文言（キャンペーンの 404・区分値の重複、開発者向けの例外） | `src/config/strings/campaignApi.ts` |

## 2. 方針

- 1 セッション 1 キャンペーンです（デモ版の簡略化）。テンプレートの読み込みで、既にキャンペーンがあれば、何もせず既存のキャンペーンを返します。
- テンプレートは、システム用 ID の行（`TEMPLATE_SESSION_ID`）を `INSERT ... SELECT` で複製します。新しい ID は、テンプレートの ID の接頭辞を付け替えて作ります（`replace`）。複製は 1 回の D1 の batch で行い、キャンペーンの挿入は、このセッションにキャンペーンが無いときだけ行います（同時の要求でも 2 件にならない）。
- すべての利用者のクエリは `session_id` を条件に含み、システム用 ID の行を含めません。他のセッションのデータ（マスの件数を含む）は返しません（requirements 2.3）。
- 状態を変える要求（POST・PUT）は、基盤（C1）の Origin の確認とレート制限を通ります。
- 充足は B1 の `CoverageCalculator` で計算します。確認待ちは枠に含めません。採用数が必要数に達したマスは募集終了（`closed: true`）になり、`priority`（いま求めている場所）に含まれません。
- 入力は B1 の `defineCampaign` で検証します。違反は 400 です。

## 3. 経路

| 経路 | 応答 | 内容 |
|---|---|---|
| `POST /api/campaign/template` | 201（複製した）・200（既にある） | 要求 `{ "templateId": "shikoku-landscape" }`。ほかの ID は 400 |
| `GET /api/campaign` | 200・404（`campaign_not_found`） | キャンペーンの全体 |
| `PUT /api/campaign` | 200・400・404 | 要求 `{ name, requiredPerCell, acceptRule }`。`requiredPerCell` は `{ "mode": "uniform", "value": n }` または `{ "mode": "individual", "values": { マスの ID: n } }` |
| `POST /api/campaign/areas` | 201・400・404・409（`area_duplicate`） | 要求 `{ "areas": [{ "prefecture": "kochi", "label": "..." }] }`。1 件だけ。追加するマスの必要数は既定値 |
| `GET /api/coverage` | 200・404 | マスごとの充足と、いま求めている場所の順 |

### キャンペーンの応答（`CampaignDetailResponse`）

契約の `CampaignResponse`（`id`・`name`・`areas`・`periods`・`acceptRule`）に、`cells`（マスの ID・区分値の ID・期間の ID・必要数）を加えたものです。`cells` は契約の型に無いため、この文書で定めます（人の確認が必要です）。

### 充足の応答（`CoverageResponse`）

`cells` の各要素は `cellId`・`areaId`・`periodId`・`accepted`（採用数）・`pendingReview`（確認待ち数）・`required`・`closed`（募集終了）です。`priority` は募集中のマスの ID を、充足率の低い順（同じなら必要数との差の大きい順、さらに同じならマスの並び順）に並べたものです。

## 4. エラー

| 状況 | 状態 | code | message の出どころ |
|---|---|---|---|
| 本文の形が違う・テンプレートの ID が違う・区分値の件数が 1 でない | 400 | `invalid_request` | `API_ERROR_MESSAGES.invalid_request` |
| 入力の違反（必要数 0、名称が空、区分値が長すぎる、個別の必要数の過不足など） | 400 | `invalid_request` | `CAMPAIGN_ERROR_MESSAGES`（B1） |
| キャンペーンが無い | 404 | `campaign_not_found` | `CAMPAIGN_API_ERROR_MESSAGES` |
| 区分値の重複（正規化した値が一致） | 409 | `area_duplicate` | `CAMPAIGN_API_ERROR_MESSAGES` |

## 5. 設定の既定値（仮の値）

requirements に数値がないため、次の値は仮です（`src/config/campaignApi.ts`）。人が決めて、この文書を更新します。

- キャンペーンの名称の上限：40 字。
- 区分値の追加で作るマスの既定の必要数：2（テンプレートの既定と同じ）。
- 区分値（エリア）の件数の上限：50 件（`areasMax`。超えると 400）。
- 必要数の範囲：1 以上 999 以下の整数（`requiredMax`。範囲外は 400）。
- 受入条件の maxInputBytes・maxPixels：requirements 3.0 の既定値（5 MB・4,000 万画素）以下に限る（超えると 400）。
- キャンペーンの名称：区分値と同じ禁止文字（制御文字・ゼロ幅の文字・双方向の制御文字）を拒否する（NAME_INVALID）。
- 区分値の長さの上限：40 字（`LIMITS.areaLabelMaxChars`、B1 の仮の値）。

## 6. 契約からの逸脱（人の確認が必要）

- `area_duplicate`・`campaign_not_found` は、`src/core/api/contract.ts` の `API_ERROR_CODES` と `src/config/strings/apiErrors.ts` に無いため、キャンペーンの文言ファイルに置きました。契約に加えるかは人が決めてください。
- `PUT /api/campaign` の要求に `acceptRule` を加えました（契約の `CampaignUpdateRequest` には無い）。
- `CampaignDetailResponse` の `cells` は契約に無い（上の 3 章のとおり）。
- 名称の上限と既定の必要数は、`src/config/limits.ts` ではなく `src/config/campaignApi.ts` に置きました。
- `POST /api/campaign/template` の要求の `templateId` は、`CAMPAIGN_API_CONFIG.defaultTemplateId` の値だけを受け付けます（テンプレートは 1 つだけのため）。

## 7. テスト

- `test/workers/campaign.worker.test.ts`：テンプレートの複製（1・21・4・84・1 件、2 回目は増えない）、取得、編集（必要数 0 は 400、個別の必要数）、区分値の追加（全角と半角の重複は 409）、セッションの隔離。
- `test/workers/coverage.worker.test.ts`：件数（採用と確認待ちだけを数える）、募集終了、確認待ちが枠に入らないこと、充足率の順、セッションの隔離。
- 実行は `npm test`（workers プロジェクト。`*.worker.test.ts` の名前にしています。C1 と同じ理由です）。
