# 確認キューの画面（D7）

確認日：2026-10-16（JST）。この文書は、実装済みの確認キューの画面の仕様です。API の仕様は `SPEC/api-review.md`、要件は `requirements.md` 3.4・3.5・3.7・4 章が正です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 画面（App Router） | `src/frontend/app/review/page.tsx` |
| 画面の部品 | `src/frontend/components/review/`（ReviewScreen・QueueList・QueueItem・CheckReasons・SubjectHintView・DuplicateCompare・OverQuotaConfirm・AcceptedList・ReturnDialog） |
| API と表示の組み立て | `src/frontend/lib/api/reviewApi.ts`（ReviewApi・ReviewViewBuilder・ReturnFormValidator） |
| 文言 | `src/config/strings/reviewQueue.ts`（差し戻しの理由は `returnReasons.ts`、要確認の理由は `checks.ts`、被写体の推定は `subjectHint.ts`） |
| 単体・E2E | `test/unit/frontend/reviewView.test.ts`・`test/e2e/review.spec.ts` |

## 2. 表示

- 確認待ちの投稿：画像（`/api/submissions/:id/image`）、マス（区分値・季節）、撮影月、地点名、説明文、要確認の理由（項目の名前・理由・修正の方法）。
- 被写体の推定（補助）：「補助」と明示し、不合格や要確認の根拠にしない旨を添えます。確信度が下限（`RULE_DEFAULTS.classifyConfidenceMin`、0.6）未満のときは「判定が確かでない」を添えます。推定が無いときは「被写体の推定はありません」です。
- 重複候補：API の `candidateIds` を、待ちの投稿か採用済みの投稿に対応づけ、画像と情報を並べて表示します。対応が取れないときは例外にします（代わりの値は作りません）。
- 採用済み（デモ）：取り消しの対象です。「実際の買取や権利の移転は行いません」を明記します。

## 3. 操作

| 操作 | 送る内容 | 結果 |
|---|---|---|
| 採用 | `POST /api/review/:id/accept`（`{}`） | 成功で一覧を読み直します。409（`over_quota_confirmation_required`）のときは、画面内の確認（超過して採用する／やめる）を出し、了承したら `{ "confirmOverQuota": true }` で再送します |
| 差し戻し | `POST /api/review/:id/return` | 理由（必須）、自由記述（「その他」は必須。上限は `LIMITS.returnReasonMaxChars`）、再投稿の可否（必須）を入力します |
| 採用の取り消し | `POST /api/review/:id/revoke` | 共通の確認ダイアログ（はい／いいえ）の後に、差し戻しと同じ入力を求めます |

- 処理中はすべての操作を無効にし、二重の送信を防ぎます。
- 失敗のときは、API の応答の文言（`message`）を表示します。通信の失敗は `REVIEW_QUEUE_STRINGS.requestFailed` を出します。
- ダイアログは `<dialog>` の modal で開きます。Esc で閉じ、フォーカスはダイアログの中にとどまります。ネイティブの alert・confirm・prompt は使いません。

## 4. 既知の逸脱

- 超過採用の確認は、Issue の本文の「共通のダイアログ」ではなく、「画面内の確認（ボタンを 2 段にする）」にしました（Issue の決定）。
- 取り消しは、共通の確認ダイアログの後に、理由の入力ダイアログを続けて開きます（API が理由を必須にするため）。
