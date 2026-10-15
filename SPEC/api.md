# API の経路の一覧（A3）

確認日：2026-10-16（JST）。この文書は、経路の一覧だけを書きます。経路の詳細（要求と応答）は、実装した Issue が `SPEC/` に書きます。型の正は `src/core/api/contract.ts`、経路の定数は `src/core/api/paths.ts` です。

| 名前 | メソッド | 経路 |
|---|---|---|
| health | GET | /api/health |
| session | GET | /api/session |
| campaignGet | GET | /api/campaign |
| campaignPut | PUT | /api/campaign |
| campaignTemplate | POST | /api/campaign/template |
| campaignAreas | POST | /api/campaign/areas |
| coverage | GET | /api/coverage |
| submissionCreate | POST | /api/submissions |
| submissionsMine | GET | /api/submissions/mine |
| submissionImage | GET | /api/submissions/:id/image |
| reviewQueue | GET | /api/review/queue |
| reviewAccept | POST | /api/review/:id/accept |
| reviewReturn | POST | /api/review/:id/return |
| reviewRevoke | POST | /api/review/:id/revoke |

- エラーの応答は `{ code, message }` です。コードの一覧は `API_ERROR_CODES`、文言は `src/config/strings/apiErrors.ts` です。
- 投稿（`POST /api/submissions`）は multipart/form-data です。フィールド名は `image`・`thumb`・`meta` と、ハニーポット欄（`website_url`）です。
- 差し戻しの理由のコードは `RETURN_REASON_CODES` です。表示は `src/config/strings/returnReasons.ts` にあります（仮置き）。
