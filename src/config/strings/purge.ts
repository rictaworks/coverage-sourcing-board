/**
 * 日次の全削除（requirements 3.9）の文言（日本語のみ）。
 * 応答の本文には出さず、開発者向けの例外の文言として使う。
 */
export const PURGE_STRINGS = {
  errorPurgeFailed: '日次の全削除に失敗しました。batch は全体が戻ったため、データは変更されていません。',
} as const;
