# キャンペーン設定の画面（D6）

確認日：2026-10-16（JST）。この文書は、実装済みのキャンペーン設定の画面の仕様です。API は `SPEC/api-campaign.md`、文言は `src/config/strings/campaignSettings.ts` です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 画面（App Router） | `src/frontend/app/campaign/page.tsx` |
| 画面の本体（状態と API の呼び出し） | `src/frontend/components/campaign/CampaignSettings.tsx` |
| 部品 | `src/frontend/components/campaign/`（TemplateLoader・AreaAddForm・CellRequirementGrid・AcceptRuleForm） |
| API の呼び出しと検査（純粋な関数） | `src/frontend/lib/api/campaignApi.ts`（`CampaignApi`・`CampaignDraftBuilder`） |
| 文言 | `src/config/strings/campaignSettings.ts`（API の文言は `src/config/strings/campaignApi.ts`） |

## 2. 画面の流れ

1. 開くと `GET /api/campaign` を呼びます。キャンペーンが無い（404）ときは、「テンプレート（四国 風景写真）を読み込む」ボタンを出します。
2. 読み込むと、`POST /api/campaign/template` を呼び、編集の画面に変わります。既に読み込み済みのときは、その旨を表示します。
3. 編集の画面は、区分値の追加、名称、必要数の表（エリア × 季節）、受入条件、保存の順に並びます。
4. 保存は `PUT /api/campaign` で行います。送る前に、ブラウザで検査します（B1 の `defineCampaign` を使います）。Worker でも同じ規則で検査されます。

## 3. 入力の規則

- 必要数：1 以上 999 以下の整数だけを受け付けます（全角の数字は半角に直します）。一律の値は、保存するまで各マスに入るだけです。保存は、マスごとの個別の値（`mode: individual`）で送ります。
- 名称：空は不可、40 字以内（`CAMPAIGN_API_CONFIG.nameMaxChars`）、制御文字と双方向の制御文字は不可です。
- 区分値の追加：正規化（NFKC）したうえで、既存の区分値と一致すると重複とみなします（全角と半角の違いだけの重複を含みます）。件数の上限は 50 件です。追加するマスの必要数は 2 です。
- 受入条件の数値（既定値の範囲の中だけで編集できます）。

| 項目 | 入力の単位 | 範囲（既定値から作る） |
|---|---|---|
| 許容誤差 | % | 0 以上 1 以下 |
| 最小の短辺 | px（整数） | 1 以上 800 以下 |
| 最大のファイルサイズ | MB | 0.1 以上 5 以下 |
| 最大の画素数 | 万画素（整数） | 1 以上 4000 以下 |

比率（4 : 3）、向き（横のみ）、許容形式（JPEG・PNG）、昼間（必須）、季節と月の整合、同一地点の扱いは、表示だけです。

## 4. 失敗の表示

- 項目の近くに文字で示します（色だけに頼りません）。欄には `aria-invalid` と `aria-describedby` を付けます。
- Worker が返した文言は、そのまま表示します（フォールバックの文言は作りません）。名称・必要数・受入条件の文言は、それぞれの項目の近くに出します。
- 保存の結果と区分値の追加の結果は、画面の中の `role="status"` の欄で示します（`alert()` は使いません）。

## 5. 既知の注意

- 充足マップ（`/coverage`）は、この画面の後に作られるため、このページの確認は充足の API（`GET /api/coverage`）で行います。
- 一律の必要数を適用しただけでは、保存されません。保存の前に、区分値を追加すると、未保存の値は残したまま、追加のマスの既定値（2）が入ります。
- 受入条件の範囲（既定値の上限、下限の 0.1 MB など）は、この画面の仮の値です。人が確定します。
