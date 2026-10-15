# 日次の全削除の仕様（C6）

確認日：2026-10-16（JST）。この文書は、実装済みの日次の全削除の仕様です。requirements 3.9 に従います。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 削除と再投入の実行（`DailyPurge`・`PurgePlanBuilder`・`dailyPurge(env)`） | `src/worker/cron/dailyPurge.ts` |
| Cron の入口（`scheduled`） | `src/worker/index.ts` |
| テンプレートの投入の文 | `src/worker/db/templateSeed.ts`（A3） |
| テンプレートのデータ | `data/templates/shikoku-landscape.json`（Worker は JSON を直接 import します） |
| 文言 | `src/config/strings/purge.ts` |
| トレースの名前・フィールド | `src/config/trace.ts` |
| テスト | `test/workers/dailyPurge.worker.test.ts` |

## 2. 実行の時刻

- Cron Trigger は `0 18 * * *`（UTC）です。日本時間の 03:00 に当たります（`wrangler.toml` の `triggers.crons`。開発と本番で同じ式）。

## 3. 手順（1 回の batch）

1. 投稿系の行を削除します：`check_result`、`review`、`submission`。
2. キャンペーン系の行を削除します（テンプレートを含む全セッションの行）：`cell`、`accept_rule`、`period`、`area`、`campaign`。
3. `session` の行を削除します。
4. テンプレートを再投入します（A3 の `TemplateSeedBuilder` の 6 文）。`session`（システム用 ID）、`campaign`、`accept_rule`、`period`、`area`、`cell` の順です。

- 削除の順序の決定：`session` は最後に削除します。requirements 3.9 は、投稿系の行（判定結果、レビュー、投稿、セッション）を先に削除し、続けてキャンペーン系を削除すると書いています。この記述どおりに `session` を投稿系として先に削除すると、`cell`・`area`・`period`・`accept_rule`・`campaign` が `session` を外部キーで参照しているため、制約で失敗します（テストで確かめています）。そのため、`check_result`・`review`・`submission` を先に、キャンペーン系を次に、`session` を最後に削除します。requirements 3.9 の「子から親の順」の意図に沿った順序であり、記述の字面とは異なります。requirements の修正は人が判断してください。
- `daily_counter` は削除しません（requirements 3.9。UTC 0 時のリセットに従います）。
- クエリ数は 15 です（削除 9 文と、再投入 6 文）。上限（1 呼び出しあたり 50）の内に収まります。
- D1 の `batch` は全体が 1 つの単位です。途中で失敗したら全体が戻ります。部分的に成功した状態は残りません。

## 4. 失敗のとき

- 例外（`PURGE_STRINGS.errorPurgeFailed`）を投げます。握りつぶしません。Cron の実行はエラーとして記録されます。
- トレースに `cron.reset.failed` を残します。フィールドは、クエリ数・例外の種類の番号（`errorKind`）・処理時間だけです。メッセージや SQL の値は含めません。

## 5. トレース（個人情報を含みません）

| 名前 | フィールド |
|---|---|
| `cron.reset.started` | `queryCount` |
| `cron.reset.finished` | `queryCount`・`count`（削除の行数の合計）・`durationMs` |
| `cron.reset.failed` | `queryCount`・`errorKind`・`durationMs` |

- APP_ENV が `development` でも `production` でも、同じ手順で実行されます。APP_ENV が想定外の値なら、実行せずに例外を投げます。

## 6. 開発環境での実行手順

1. 開発用の D1 に migrations とテンプレートを入れます（`npm run db:migrate:local`、`npm run db:seed:local`）。
2. `wrangler dev --test-scheduled` で Worker を起動します（既定のポートは 8787）。
3. 別の端末で `curl "http://localhost:8787/__scheduled?cron=0+18+*+*+*"` を実行します。
4. 開発のログに `cron.reset.started` と `cron.reset.finished` が出ることを確かめます。

## 7. 本番で確認すること（人が行います）

- CPU 時間が 10 ms の内に収まるかは、本番のログで確かめます（requirements 12.4）。
- 本番の D1 のクエリ数と実行時間を、Cron の実行の後にログで確かめます。
- Cron の実行が、毎日 03:00（日本時間）に行われることを、ダッシュボードの Cron の実行履歴で確かめます。

## 8. テスト

- `test/workers/dailyPurge.worker.test.ts`（workers プロジェクト。開発用の D1 で実行します）。
- 確かめること：投稿の行が消えてテンプレートだけが残ること、2 回実行しても重複しないこと、`daily_counter` が残ること、クエリ数が 15 以下であること、途中の失敗で全体が戻ること、トレースの内容、古い Cookie への応答、`scheduled` の入口、文字列の直書きがないこと。

## 9. Edit scope からの逸脱

- テストの名前は `dailyPurge.worker.test.ts` にしました（workers プロジェクトの対象の名前に合わせるため。C1 と同じです）。
- `src/worker/index.ts`（`scheduled` の呼び出し先を `dailyPurge(env)` に変更）、`src/config/trace.ts`（トレースの名前 3 件とフィールド `queryCount` を追加。`cron.reset` は置き換え）、`tsconfig.json`（`resolveJsonModule` を追加。テンプレートの JSON を Worker から読むため）を変更しました。
- 削除の順序は Issue の記載と異なります（上の 3 章の理由）。
