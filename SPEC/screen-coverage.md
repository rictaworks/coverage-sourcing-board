# 充足マップの画面（D2）

確認日：2026-10-16（JST）。この文書は、実装済みの充足マップの画面の仕様です。要件は requirements 3.6・4 章、API は `SPEC/api-campaign.md` の充足の応答です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 画面（App Router） | `src/frontend/app/coverage/page.tsx`（見出しと `CoverageScreen` を置く） |
| 画面の状態（読み込み・表示・キャンペーンが無い・失敗）と再読み込み | `src/frontend/components/coverage/CoverageScreen.tsx` |
| 表（県ごとの行、季節の列、マス） | `src/frontend/components/coverage/CoverageTable.tsx`（`CoverageTable`・`CoverageCell`） |
| いま求めている場所の一覧 | `src/frontend/components/coverage/WantedList.tsx` |
| 表の見方 | `src/frontend/components/coverage/CoverageLegend.tsx` |
| API の読み込みと、表・一覧の組み立て | `src/frontend/lib/api/coverageApi.ts`（`CoverageApi`・`CoverageViewBuilder`） |
| 文言と経路 | `src/config/strings/coverage.ts` |
| スタイル | `src/frontend/components/coverage/coverage.module.css` |

## 2. データの流れ

1. `GET /api/campaign` で、区分値（県・名称）と期間（季節）を読みます。
2. `GET /api/coverage` で、マスごとの採用数・確認待ち数・必要数・募集終了（`closed`）と、「いま求めている場所」の順（`priority`）を読みます。
3. `CoverageViewBuilder` が、表と一覧の形に組み立てます。
   - 行は県の順（徳島・香川・愛媛・高知）、区分値は API の順です。
   - 列は季節の順です。期間の最初の月の順（3 月に始まる春・夏・秋・冬）で、期間の ID は決め打ちしません。
   - 募集終了か未充足かは、API の `closed` をそのまま使います。画面では計算しません。
   - いま求めている場所は、API の `priority` の順のまま並べます。画面では並べ替えません。
4. 1 のキャンペーンが無い（404 の `campaign_not_found`）ときは、案内を表示します。
5. 通信の失敗や、対応の取れない応答は、エラーの表示だけを出します（代わりの値は作りません）。

## 3. 表示

- 表の caption は「エリアと季節ごとの採用数と必要数」です。見出し（th）は `scope="col"`、行の見出しは `scope="row"`、県は `scope="rowgroup"` です。
- 各マスは「採用数／必要数」と、確認待ちの件数を表示します。
- 未充足（採用数 < 必要数）は、文字「未充足」と警告のアイコンで示します。募集終了は、文字「募集終了」と確認のアイコンで示します。色は補助として使います。
- 表は枠（`role="region"`、キーボードで移動できる）の中で横にスクロールします。ページ全体の横のスクロールは起こしません（375 px で確認）。
- 「採用（デモ）」の表示と、「実際の買取や権利の移転は行いません。」の注記は、`src/config/strings/status.ts` の文言を使います。
- いま求めている場所の各項目は、投稿者の役割のときだけ、`/submit?area=<区分値の ID>&period=<期間の ID>` へのリンクを表示します。役割は `RoleStore`（ブラウザに保存）から読みます。既定の役割は投稿者です。

## 4. 既知の注意（人が確かめる点）

- 投稿の画面（`/submit`）は、`area` と `period` の query を読みません。D4 の実装で読むように合わせてください（Issue #17 の受け入れ条件にはまだありません）。
- いま求めている場所の一覧は、件数の上限を設けず、API が返したすべての募集中のマスを表示します。上位だけに絞るかは、人が決めてください。
- キャンペーンが無いときの案内は、`/campaign` へのリンクです。

## 5. テスト

- `test/unit/frontend/coverageView.test.ts`：県ごとの行、季節の順（入力の順に関わらず）、未充足と募集終了、いま求めている場所の順（API の順のまま、募集終了は含まない）、対応が取れないときの例外、読み込みの 3 つの結果（ready・notFound・通信の失敗）。
- `test/e2e/coverage.spec.ts`：キャンペーンが無いときの案内、テンプレートの読み込み後の 84 マス（すべて「0／2」の未充足）といま求めている場所の 84 件、375 px でページ全体が横に広がらないこと、表の枠のフォーカス。
- 実行は、開発サーバー（3000 番・8787 番）に対して行います。
