# 自分の投稿の画面（D5）

確認日：2026-10-16（JST）。この文書は、実装済みの画面の仕様です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 画面（App Router） | `src/frontend/app/mine/page.tsx` |
| 画面の部品 | `src/frontend/components/mine/`（MineScreen・MineList・MineItem） |
| 表示の組み立てと読み込み | `src/frontend/lib/api/mineApi.ts`（MineViewBuilder・MineApi） |
| 文言と経路 | `src/config/strings/mine.ts`（状態の文言は `status.ts`、理由の文言は `returnReasons.ts`） |
| API | `GET /api/submissions/mine`・`GET /api/submissions/:id/image`（SPEC/api-review.md の 3 章） |

## 2. 表示

- このセッションの投稿だけを、新しい順に一覧で表示します（API は作成の古い順で返すため、画面で逆順にします）。
- 各項目：縮小した写真（画像の経路を CSS で縮小）、状態、撮影月、地点名、説明文。地点名・説明文が空のときは「（未入力）」と表示します。
- 状態は文字で示します（確認待ち・採用（デモ）・差し戻し）。採用（デモ）の項目には「実際の買取や権利の移転は行いません。」を表示します。
- 差し戻しの項目には、理由の区分（`RETURN_REASON_LABELS`）と自由記述を表示します。
  - 再投稿できる差し戻し：「この投稿は再投稿できます。」と「再投稿する」のリンク（`/submit?resubmit=<投稿の ID>`）を表示します。
  - 再投稿できない差し戻し：リンクを出さず、「この投稿は再投稿できません。」と文字で示します。
- 地点名・説明文・自由記述は、テキストとして描画します（HTML として解釈しません）。
- 投稿が無いときは、「投稿はまだありません。」と投稿の画面への案内を表示します。
- 通信の失敗は、エラーの表示だけを出します（代わりの一覧は作りません）。
- 表示の組み立てで、対応が取れない応答（checking の投稿、差し戻しの状態と内容の不一致、未知の理由のコード）は例外にします。

## 3. 未確定の事項

- 再投稿の導線の query 名は `resubmit` です（`/submit?resubmit=<投稿の ID>`）。Issue #18 の本文と requirements 4 章の `from` とは異なり、D4 も `resubmit` で読みます。正は `src/config/strings/mine.ts` の `MINE_SUBMIT_LINK` の 1 箇所です。
- 注意：mine API の応答に、市町村・季節・判定の要約が含まれないため、一覧には表示しません（後続で表示する場合は、API の拡張が要ります）。
- 文言は仮置きで、公開前に確定します（requirements 4.2）。
