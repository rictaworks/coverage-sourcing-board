/**
 * Worker（API の基盤）の文言（日本語のみ）。API の応答の文言と、開発者向けの例外の文言を分けて置く。
 * API のエラーの文言は src/config/strings/apiErrors.ts にある。ここにあるのは基盤だけの文言。
 */
export const WORKER_STRINGS = {
  /** 基盤だけが使うエラーの文言（API の応答の本文に入る）。 */
  errorMessages: {
    not_implemented: 'この機能は、まだ実装されていません。',
    method_not_allowed: 'この経路では、そのメソッドは使えません。',
    origin_forbidden: '別のサイトからの操作は受け付けられません。画面を読み込み直して、もう一度お試しください。',
  },
  /** 開発者向けの例外の文言（応答には含めず、ログに残す）。 */
  errorRateLimiterMissing: 'Rate Limiting のバインディング（RATE_LIMITER）が設定されていません。',
  errorClientIpMissing: '接続元の IP（CF-Connecting-IP）が要求にありません。',
  errorSessionCountMissing: 'キャンペーンの数を取得できませんでした。',
  errorSessionMissing: 'セッションが解決されていない経路が、セッションを使おうとしました。',
  errorRouteNotRegistered: 'API の経路に、ハンドラーが登録されていません。',
  errorDailyPurgeNotImplemented: '日次の全削除は、まだ実装されていません（C6 で実装します）。',
  logUnhandledError: '未処理の例外です（例外の種類のみを記録します）。',
} as const;
