/**
 * 確認キューの画面（D7）の E2E のテスト用の入力データ。日本語の値はこのファイルにだけ置きます（test/unit/hardcode.test.ts）。
 * 表示文は置きません（表示文は src/config/strings/ にあります）。
 */
export const REVIEW_INPUTS = {
  spotName: 'E2E 地点',
  caption: 'E2E 説明文',
  revokeFreeText: 'E2E 取り消し',
} as const;
