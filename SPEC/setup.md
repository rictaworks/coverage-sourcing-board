# 開発環境の仕様（A1）

確認日：2026-10-16（JST）。この文書は、実装済みの開発環境の仕様です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 単一の package.json と package-lock.json | リポジトリ直下 |
| Next.js（フロント）の project root | `src/frontend/`（`next dev src/frontend`、`next build src/frontend`） |
| Next.js の画面 | `src/frontend/app/` |
| Next.js の設定 | `src/frontend/next.config.mjs` |
| フロントの tsconfig | `src/frontend/tsconfig.json`（ルートの tsconfig.json は Workers・テスト・config 用） |
| 静的出力（本番） | `src/frontend/out/`（`npm run build:web`） |
| Next.js のビルドキャッシュ | `src/frontend/.next/`（tsbuildinfo も `.next/cache/` に置く） |
| Workers（API・Cron） | `src/worker/index.ts`（wrangler.toml の `main`） |
| 文字列と既定値 | `src/config/strings.ts` |
| D1 のマイグレーション | `migrations/`（まだ SQL はありません） |
| 開発用スクリプト | `scripts/`（`scripts/db-migrate-local.mjs`） |
| テスト | `test/smoke/`（node と workers）、`test/e2e/`（Playwright） |
| 設定 | `vitest.config.ts`、`playwright.config.ts`、`wrangler.toml` |

パスの別名（`@/` など）は使いません。import は相対パスで書きます。

## 2. 版と公開日

npm の公開日は `npm view <パッケージ> time --json` で確かめました。各版は公開から 2 週間以上（2026-10-02 より前）経っています。

| パッケージ | 版 | 公開日 |
|---|---|---|
| next | 16.3.8 | 2026-09-30 |
| react / react-dom | 19.3.0 | 2026-09-09 |
| @types/react / @types/react-dom | 19.3.0 | 2026-09-09 |
| typescript | 5.9.3 | 2025-09-30（6.0.x は使いません） |
| wrangler | 4.146.0 | 2026-10-01 |
| @cloudflare/workers-types | 5.20261001.1 | 2026-10-01（wrangler の peer が要求） |
| vitest | 4.1.11 | 2026-08-18 |
| @cloudflare/vitest-plugin | 1.3.5 | 2026-10-01（旧名 @cloudflare/vitest-pool-workers から移行） |
| @playwright/test | 1.63.0 | 2026-09-04 |
| exifr | 7.1.3 | 2021-08-05 |
| @fortawesome/fontawesome-svg-core / free-solid-svg-icons | 7.3.1 | 2026-07-15 |
| @fortawesome/react-fontawesome | 3.5.0 | 2026-07-20 |
| concurrently | 10.0.5 | 2026-08-15 |

すべて `^` や `~` を付けず、正確な版で固定しています。

### 注意事項

- npm 10.9.8（Node 22 に同梱）では、`vitest` 4.1.11 の peer 解決が `Cannot read properties of null (reading 'edgesOut')` で失敗します。そのため、package-lock.json は npm 11（`npx -y npm@11 install`）で作成しました。`npm ci` は npm 10 でも通ることを確かめています。
- `@cloudflare/vitest-pool-workers` は `@cloudflare/vitest-plugin` へ改名されたため、公開から 2 週間以上経った 1.3.5 に移行しました。`cloudflareTest` の使い方は同じです。
- wrangler.toml の `compatibility_date` は `2026-08-20` です。`@cloudflare/vitest-plugin` が内部で使う workerd が対応する最新の日付（2026-08-22）より前にしています。
- `npm audit --omit=dev` の結果は 0 件（high 以上なし）です（2026-10-16 確認）。
- 開発用の依存を含めた `npm audit` では、high が 4 件、critical が 2 件あります（concurrently などの経由。2026-10-16 確認）。
- 本番（Worker と静的出力）には開発用の依存が入らないため、本番への影響は小さいと判断しています。ただし、断定はしていません。
- 残る作業：該当する依存の版の更新は、後続の Issue で検討します。

## 3. 開発の起動方法

1. `npm ci`（Node 22 以上）
2. `npm run dev`：フロント（3000 番）と Workers の dev サーバー（8787 番）を同時に起動します。個別には `npm run dev:web`、`npm run dev:api` です。
3. ブラウザで `http://localhost:3000/` を開きます。`http://localhost:3000/api/health` と `http://localhost:8787/api/health` は、どちらも `{"status":"ok"}` を返します。
4. `npm run db:migrate:local`：`migrations/` に SQL がない場合は、適用せずに正常終了します。
5. `npm test`：Vitest（node と workers の 2 プロジェクト）を実行します。
6. `npm run test:e2e`：Playwright を実行します。テストの前に、2 つの開発サーバーを起動します（既に起動している場合は再利用します）。初回のみ `npx playwright install chromium` が必要です。
7. `npm run build:web`：静的出力を `src/frontend/out/` に作ります。

Next.js は、`next dev` が AI エージェントを検出したときに `src/frontend/` へ `AGENTS.md` と `CLAUDE.md` を作ることがあります。これらは `DELETE/frontend-generated/` へ移し、扱いません（6 章）。

## 4. 転送の方法（開発時の /api/*）

- `src/frontend/next.config.mjs` が、開発サーバー（`PHASE_DEVELOPMENT_SERVER`）のときだけ `rewrites` を設定します。`/api/:path*` を `http://localhost:8787/api/:path*` へ転送します。
- 本番の `next build` は `output: 'export'` の静的出力だけを作ります。`rewrites` は本番の設定に入りません。確認として、`src/frontend/out/` を検索し、`8787` と `/api/health` が含まれないことを確かめています。
- 本番の API の経路（同一オリジン）は、配備の段階で決めます。

## 5. Workers と環境

- `wrangler.toml` の既定（`APP_ENV = "development"`）は、`wrangler dev` と vitest の workers プロジェクトで使われます。
- 開発側の Worker 名は `coverage-sourcing-board-dev`、本番は `coverage-sourcing-board` です。`--env production` を付けないデプロイで本番を上書きしないための分離です。
- `[env.production]` は `APP_ENV = "production"` です。D1（`DB`）、Rate Limiting（`RATE_LIMITER`、`simple = { limit = 5, period = 10 }`）、Cron（`0 18 * * *`、UTC。日本時間 03:00）を同じ内容で宣言しています。
- Workers AI（`AI`）は `[env.production.ai]` だけに宣言しています。開発環境ではバインディングを作らないため、分類は「被写体の推定はありません」になります（テストで確かめています）。
- `RATE_LIMITER` の `namespace_id`（`8100001`）は、このリポジトリ専用の整数として仮に決めた値です。デプロイの前に人が確認してください。

## 6. 本番の値と未決の事項（人が確かめること）

- 本番の D1 の `database_id` は仮の値（`00000000-0000-0000-0000-000000000000`）です。開発の値も同じ仮の値です。本番の D1 を作成した後、デプロイの前に、人が `[[env.production.d1_databases]]` の値を置き換えます。秘密値ではありません。
- Next が生成した AGENTS.md と CLAUDE.md は移動して扱わない（`DELETE/frontend-generated/` へ移動済み）。
- Edit scope の外で、次のファイルを追加・変更しました。`package.json` の `"type": "module"`（vitest の設定を ESM で読むため）、`scripts/db-migrate-local.mjs`（migrations が空のときに wrangler がエラーになるため）、`src/frontend/tsconfig.json`（Next.js の project root に必要）、`src/config/strings.ts`（画面の文字列を `src/config/` に分けるため）、`src/frontend/next-env.d.ts`（Next.js が生成）。
