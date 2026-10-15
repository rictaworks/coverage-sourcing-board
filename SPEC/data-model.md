# データモデルとテンプレートの仕様（A3）

確認日：2026-10-16（JST）。この文書は、実装済みのスキーマとテンプレートの仕様です。requirements 6 章に従います。

## 1. 配置

| 対象 | 場所 |
|---|---|
| スキーマ（D1 の初期化） | `migrations/0001_init.sql` |
| テンプレートのデータ | `data/templates/shikoku-landscape.json`（出典は `data/README.md`） |
| テンプレートの投入（SQL の作成） | `src/worker/db/templateSeed.ts`（`TemplateSeedBuilder`） |
| ローカルへの投入 | `scripts/seed-template-local.mjs`（`npm run db:seed:local`） |
| API の経路 | `src/core/api/paths.ts`（`API_ENDPOINTS`） |
| API の契約（型・エラー・差し戻しのコード） | `src/core/api/contract.ts` |
| 文言 | `src/config/strings/apiErrors.ts`・`returnReasons.ts`・`status.ts`・`prefectures.ts` |

## 2. 時刻と文字コード

- 日時の列は、JST の文字列（ISO 8601、`+09:00` 付き。例：`2026-10-16T01:30:00+09:00`）で保存します。既定値は SQLite の `strftime` で作ります。
- `daily_counter.date_utc` だけは UTC の日付です（UTC 0 時にリセット。requirements 3.8）。
- 文字コードは UTF-8 です。

## 3. テーブル（10 件）

| テーブル | 主キー | 備考 |
|---|---|---|
| session | `id_hash` | Cookie の値の SHA-256 です。Cookie の値そのものは持ちません。 |
| campaign | `id` | `session_id` を持ちます。 |
| area | `id` | `prefecture`・`label`・`normalized`・`bbox`（NULL 可）。 |
| period | `id` | `months` は JSON の配列（例：`[3,4,5]`）。 |
| cell | `id` | `area_id` × `period_id` のマス。`required` は 0 以上です。 |
| accept_rule | `id` | キャンペーンごとに 1 件（`campaign_id` が一意）。 |
| submission | `id` | `image` は BLOB です。位置情報（緯度・経度）と機種情報の列はありません。`status` は `checking`・`pending_review`・`accepted`・`returned` のいずれかです。`resubmitted_from` で元の投稿を指します。 |
| check_result | `id` | 判定の結果（項目ごと）。 |
| review | `id` | `submission_id` が一意です（投稿ごとに 0 または 1 行）。 |
| daily_counter | (`date_utc`, `kind`) | セッションに紐づけません。 |

- daily_counter 以外のテーブルは `session_id` を持ち、`session_id` を先頭にした索引があります。
- session は `session_id` の列を持ちません。主キーの `id_hash` が、その役割を担います。
- 日次の全削除（requirements 3.9）の実装は、後続の Issue で行います。

## 4. テンプレート「四国 風景写真」

| 項目 | 値 |
|---|---|
| エリア | 21（徳島県 6・香川県 5・愛媛県 3・高知県 7） |
| 期間 | 4（春 3〜5 月、夏 6〜8 月、秋 9〜11 月、冬 12・1・2 月） |
| マス | 84（エリア × 期間） |
| マスの必要数の初期値 | 2（全体 168）。保存中の投稿の総数の上限（200 件。requirements 3.8）に収まります。 |
| 受入条件 | 既定値（requirements 3.0）と同じ（4:3、許容誤差 1%、横向き、JPEG・PNG、最小短辺 800 px、ピント 30、重複の距離 4、昼間必須、5 MB、4,000 万画素） |

- 境界データ（bbox）は持ちません（requirements 12.5）。

## 5. テンプレートの投入

- 投入は、固定のシステム用 ID（`TEMPLATE_SESSION_ID`＝`system-template`）の行として作ります。利用者のクエリには含めません。
- 行の ID は固定です。`INSERT ... ON CONFLICT ... DO UPDATE` で投入するため、2 回実行しても行は重複しません。
- 文の数は 6 件です（session・campaign・accept_rule・period・area・cell）。
- 1 文のバインド変数は 100 以下です。エリアと期間は JSON を 1 つの変数で渡し、マスは `INSERT ... SELECT`（エリア × 期間）で作ります。
- ローカルの確認では、2 回の実行の後も、システム用 ID の行は 1・21・4・84・1 件（必要数の合計は 168）でした。

## 6. 未決の事項

- 各マスの必要数の初期値（2）は、仮の値です。運用の結果で見直します。
- 境界データの出典とライセンスは未確認です。確認するまで、市町村の照合は行いません。
