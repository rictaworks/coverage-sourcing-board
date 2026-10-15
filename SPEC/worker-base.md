# Worker の基盤の仕様（C1）

確認日：2026-10-16（JST）。この文書は、実装済みの Worker の基盤の仕様です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 入口（要求の処理の順序・Cron の入口） | `src/worker/index.ts`（`WorkerApp`） |
| バインディングの型 | `src/worker/env.ts` |
| 応答の作成（nosniff・no-store・エラーの形） | `src/worker/http/responses.ts`（`ApiResponder`） |
| ルーター（paths.ts の全経路の登録） | `src/worker/http/router.ts`（`ApiRouter`） |
| Origin の確認 | `src/worker/http/originGuard.ts`（`OriginGuard`） |
| セッション Cookie | `src/worker/session/cookie.ts`（`SessionCookie`）、`src/worker/session/sessionService.ts`（`SessionService`） |
| レート制限 | `src/worker/security/rateLimit.ts`（`RateLimitGuard`） |
| SHA-256（Cookie と IP のハッシュ） | `src/worker/security/sha256.ts` |
| 機能ごとの未実装のハンドラー | `src/worker/routes/campaign.ts`・`submissions.ts`・`review.ts` |
| 日次の全削除（未実装） | `src/worker/cron/dailyPurge.ts` |
| 被写体の推定（常に「推定なし」） | `src/worker/ai/noSubjectHint.ts`・`subjectHintFactory.ts` |
| 設定（Cookie 名・有効期間・開発の Origin） | `src/config/worker.ts` |
| 文言（基盤のエラーと例外） | `src/config/strings/worker.ts` |

## 2. 要求の処理の順序

1. `APP_ENV` を判定します。想定外の値（未設定を含む）は例外にし、500（`internal_error`）を返します。
2. `/api/` で始まらない要求は 404（`not_found`）です。
3. 状態を変える要求（POST・PUT・PATCH・DELETE）は、`Origin` を確認します。一致しなければ 403（`origin_forbidden`）です。
4. GET と HEAD 以外の要求に、レート制限をかけます。超えたら 429（`rate_limited`）です。
5. 経路を振り分けます。登録のない経路は 404、メソッドが違えば 405（`method_not_allowed`）です。
6. `health` 以外は、セッション Cookie を検証します（無い・形式が不正・DB に無いときは発行します）。
7. ハンドラーを呼びます。すべての応答に `X-Content-Type-Options: nosniff` と `Cache-Control: no-store` を付けます。CORS の許可ヘッダーは付けません。

例外は握りつぶしません。例外は 500（`internal_error`）に変換し、例外の種類の名前だけを `console.error` に残します（メッセージや値は残しません）。

## 3. 経路の登録

- 経路は `src/core/api/paths.ts` の `API_ENDPOINTS` を使います。全経路をルーターに登録します。
- 登録のない経路があると、ルーターの構成の時点で例外にします。
- 機能のモジュール（C2・C3・C5）は、自分の経路のハンドラーを置き換えます。現在の未実装のハンドラーは 501（`not_implemented`）を返します。
- `coverage`（GET /api/coverage）は、キャンペーンの充足と同じ担当として `routes/campaign.ts` に置きました。C2 が確かめてください。

## 4. セッション（requirements 2.3）

- Cookie 名は `csid` です。値は 32 バイトの乱数（`crypto.getRandomValues`）を base64url で表した 43 文字です。
- DB（`session` テーブル）には、値の SHA-256 の 16 進の文字列（`id_hash`）だけを保存します。
- 属性は `HttpOnly; Secure; SameSite=Lax; Max-Age=86400; Path=/` です。
- Cookie がない・形式が不正・ハッシュが DB にないときだけ、新しい値を発行します。既存のセッションでは Set-Cookie を返しません。
- ハンドラーには、セッションのハッシュ（`sessionIdHash`）だけを渡します。Cookie の値は渡しません。
- `GET /api/session` は `{ "hasSession": true, "hasCampaign": boolean }` を返します。キャンペーンの有無は `campaign` テーブルを `session_id` で数えます。

## 5. Origin の確認（CLAUDE.md 8）

- 許可する Origin は、要求の URL の origin（自分のオリジン）です。
- `APP_ENV=development` のときだけ、`src/config/worker.ts` の `developmentOrigins`（`http://localhost:3000` と `http://localhost:8787`）を追加で許可します。
- 本番では、自分のオリジンだけを許可します。
- `Origin` が無い状態を変える要求は拒否します。

## 6. レート制限（requirements 3.8）

- バインディング `RATE_LIMITER`（wrangler.toml の `simple = { limit = 5, period = 10 }`）を使います。10 秒に 5 回までです。
- キーは `CF-Connecting-IP` の SHA-256 の 16 進の文字列です。IP そのものは保存もトレースもしません。
- `CF-Connecting-IP` が無いとき、またはバインディングが無いときは、例外にして 500 を返します（制限値の代用はしません）。

### 確認の結果（確認日：2026-10-16）

| 確認事項 | 結果 |
|---|---|
| `wrangler dev` で模擬されるか | 模擬されます。Cloudflare の bindings の対応表（`developers.cloudflare.com/workers/development-testing/bindings-per-env`）に、Rate Limiting がローカルで模擬されると記載されています。実際にも、同じ IP の 6 回目の POST が 429 になることを確かめました。 |
| 無料プランで使えるか | 未確認です。公式の Rate Limiting の文書では、プランによる制限の記載を確認できませんでした。第三者の記事では無料プランでも使えるとされていますが、公式の料金ページでは確かめていません。人が公式の料金ページで確かめてください。 |
| `period` の値 | 10 秒または 60 秒です（公式の文書の記載）。 |

## 7. 未実装・未対応

- トレース：要求ごとに 1 件（`request.handled`）を残します。値はメソッド、経路の型（`/api/review/:id/accept` のようなテンプレート。一致しない場合は `unmatched`）、状態コード、処理時間（ミリ秒）だけです。IP・Cookie・Origin・画像・説明文は含めません。文字列の値は `TRACE_LABELS` の既定の名前だけを受け付けます。要求 ID は出していません。
- 不正なパス（不正な % の並び）は 400（`invalid_request`）を返します。
- 日次の全削除（requirements 3.9）：C6 が実装します。現在は例外を投げます。
- 被写体の推定：`subjectHintFactory` は常に `NoSubjectHint`（status が none）を返します。AI のバインディングの実装は C4 が行います。
- 基盤のエラーの符号（`not_implemented`・`method_not_allowed`・`origin_forbidden`）は、`src/core/api/contract.ts` の `API_ERROR_CODES` にありません。基盤の内部で定義しています（`src/worker/http/responses.ts`）。契約に含めるかは人が決めてください。

## 8. テスト

- `test/workers/*.worker.test.ts`（workers プロジェクト。wrangler.toml の開発環境で実行します）。
  - `session.worker.test.ts`：Cookie の発行・属性・ハッシュの保存・再利用・不正な形式。
  - `router.worker.test.ts`：404・405・501 の JSON、全経路の登録、ヘッダー。
  - `originGuard.worker.test.ts`：開発と本番の Origin の許可と拒否、APP_ENV の不正な値。
  - `rateLimit.worker.test.ts`：実際のバインディングでの 429、テストダブル（`test/helpers/recordingRateLimiter.ts`）での分岐、キーのハッシュ、バインディングと IP が無いときの例外。
- テストの入力は `test/fixtures/workerRequests.ts` に置きます。D1 のマイグレーションは `test/helpers/d1Migrations.ts` で適用します。
- 既存の `test/smoke/worker.test.ts` と `test/workers/schema.worker.test.ts` は、変更していません。

## 9. Edit scope からの逸脱

- テストの名前は `*.worker.test.ts` にしました。`vitest.config.ts` の workers プロジェクトは、この名前の形を対象にするためです（Issue の `session.test.ts` などは、node プロジェクトで実行されてしまいます）。
- 追加したファイル：`src/config/worker.ts`（設定）、`src/config/strings/worker.ts`（文言）、`src/worker/security/sha256.ts`、`src/worker/http/*`、`src/worker/session/*`、`src/worker/env.ts`、`test/helpers/*`、`test/fixtures/workerRequests.ts`。
- health はセッションの対象外です（死活確認のため DB を使わない）。Issue の「/api/* ごとに Cookie を検証」とは異なります。既存の smoke テストが、DB のテーブルが無い状態で health を 200 にするために必要でした。
