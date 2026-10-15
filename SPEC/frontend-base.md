# フロントの基盤の仕様（D1）

確認日：2026-10-16（JST）。この文書は、実装済みのフロントの基盤の仕様です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 画面（App Router） | `src/frontend/app/`（トップ、`legal/`、準備中の 5 画面、`not-found.tsx`） |
| テーマのトークン | `src/frontend/app/globals.css` の `:root` |
| 共通の要素 | `src/frontend/components/layout/`（AmberBanner・SiteHeader・ConsultButton・SiteFooter・Analytics・PendingPage） |
| 共通の部品 | `src/frontend/components/common/`（Icon・Dialog・ErrorMessage） |
| トップの部品 | `src/frontend/components/top/RoleSwitch.tsx` |
| API クライアント | `src/frontend/lib/apiClient.ts` |
| 役割の保持 | `src/frontend/lib/roleStore.ts` |
| GA4 の判定 | `src/frontend/lib/appEnv.ts` |
| GA4 の設定 | `src/config/analytics.ts` |
| 文言 | `src/config/strings/layout.ts`・`top.ts`・`legal.ts`・`dialog.ts` |
| セキュリティヘッダー | `src/frontend/public/_headers` |

## 2. テーマ「藍」（ライト固定）

- `:root` にトークンを定義し、各画面はトークンだけを使います。`color-scheme: light` を指定し、`prefers-color-scheme` による分岐は書きません。`body` は背景色を明示します。
- 文字と背景の対比は、WCAG AA（4.5:1）以上です（2026-10-16 に計算）。

| トークン | 値 | 対になる背景 | 対比 |
|---|---|---|---|
| `--color-text` | `#1c2331` | `#faf7f0` | 14.71:1 |
| `--color-text-muted` | `#515a6b` | `#faf7f0` | 6.49:1 |
| `--color-accent`（アクセント） | `#1f3a68` | `#faf7f0` | 10.53:1 |
| `--color-accent-contrast` | `#ffffff` | `--color-accent` | 11.27:1 |
| `--color-amber-text` | `#5a3b00` | `--color-amber-bg`（`#fbeec2`） | 8.79:1 |
| `--color-pass` | `#25613a` | `#faf7f0` | 6.89:1 |
| `--color-review` | `#7a4f00` | `#faf7f0` | 6.66:1 |
| `--color-fail` | `#9b2c2c` | `#faf7f0` | 7.03:1 |

背景は `--color-bg`（`#faf7f0`）、面は `--color-surface`（`#ffffff`）、境界線は `--color-border`（`#d6cfbf`）です。

## 3. 全デモ共通の要素（requirements 4.1）

- アンバーバナー（`data-testid="amber-banner"`）：2 文を表示します。
- ヘッダー：サイト名と、ナビの右端の「← デモ一覧へ」（区切り線つき。`https://rictaworks.jp/#demos`）。
- 右下固定の「ご相談はこちら」（`position: fixed; bottom: 1.5rem; right: 1.5rem;`。`https://rictaworks.jp/`）。
- フッター：`/legal` へのリンク。
- ページタイトル：日本語。トップは `APP_STRINGS.pageTitle`、各画面は `PAGE_TITLES`・`LEGAL_STRINGS.title`。
- アイコンは Font Awesome を使います。CSS は `layout.tsx` で読み込み、実行時の注入は行いません（`config.autoAddCss = false`）。

## 4. GA4（G-C04W1XKS16）

- 読み込みは `APP_ENV` が `production` のときだけです（`shouldLoadAnalytics`）。`development`・未設定・そのほかの値では読み込みません。
- 値の検証（例外）は行いません。未設定で build や dev が止まらないようにするためです。そのため、本番のビルドで `APP_ENV=production` を付け忘れると、GA4 は読み込まれません（人が確かめる点）。
- 測定 ID と送信先は `src/config/analytics.ts` に置きます。

## 5. 役割の保持（発注者・投稿者）

- 保存先は `localStorage`（キー `csb-demo-role`）です。この画面の表示の切り替えにだけ使い、サーバーの状態には使いません。
- 既定の役割は投稿者です（仮の値）。保存された値が不正なときも既定の役割を返します。
- 読み書きは例外を外に出しません。ストレージが使えないときは既定の役割を表示し、保存は行わずに `false` を返します。
- 初回の描画は既定の役割で行い、保存された役割は描画の後に読みます（表示のずれを防ぎます）。

## 6. API クライアント

- `ApiClient` は同一オリジンの `/api/` で始まるパスだけを呼びます（それ以外は例外）。`credentials: 'same-origin'` を付けます。
- エラー応答の `{ code, message }` は `ApiError`（`code`・`status` を持つ）にします。本文が形式に合わないときは、`code` を `malformed_response` とし、本文の代わりに `COMMON_STRINGS.errorHeading` を使います。
- 開発時の `/api/*` は、`next.config.mjs` の rewrites で Workers（8787 番）へ転送します（`/api/health` で 200 と JSON を確認しました）。

## 7. セキュリティヘッダー（`_headers`）

- `Content-Security-Policy`：`script-src` と `style-src` に `'unsafe-inline'` を含みます。Next.js の静的出力は、ハイドレーションのためにインラインの script を出し、静的出力では nonce を使えないためです。送信先は `self` と GA4 に必要なものだけです。
- `connect-src` に `https://*.google-analytics.com` と `https://*.analytics.google.com` を加えます。GA4 の計測データの送信先が地域ごとのサブドメインになるためです（`script-src` には `https://www.googletagmanager.com` が既にあります）。
- `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`、`X-Frame-Options: DENY`、`frame-ancestors 'none'` を設定します。
- ヘッダーは Cloudflare Pages の配信で有効になります。ローカルの dev では適用されません。

## 8. 既知の注意

- ハードコード検査（`test/unit/hardcode.test.ts`）は、リポジトリ直下の `out`・`.next`・`node_modules` と、ビルド成果物の `src/frontend/.next`・`src/frontend/out` だけを読み飛ばします。別の階層の同名フォルダは検査します。ビルドや dev の後でも検査は失敗しません。
- `next dev` は `src/frontend/AGENTS.md` と `src/frontend/CLAUDE.md` を作ります。`DELETE/frontend-generated/` へ移して扱いません（SPEC/setup.md の 3 章）。
