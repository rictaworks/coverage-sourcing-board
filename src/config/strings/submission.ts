/** 投稿の受け取り（C3）の開発者向けの例外の文言（応答には含めず、ログにも入力の内容は残さない）。 */
export const SUBMISSION_DEV_MESSAGES = {
  errorRuleMissing: 'マスに対応する受入条件の行が、D1 にありません。',
  errorSubmissionMissing: '判定結果を足す投稿の行が、D1 にありません（全削除と重なった可能性があります）。',
  errorCountMissing: '投稿の件数を取得できませんでした。',
} as const;
