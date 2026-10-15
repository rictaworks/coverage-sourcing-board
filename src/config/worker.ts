/**
 * Worker の設定（セッション・Origin・レート制限の既定値）。
 * 数値と経路の接頭辞はここに置き、コードへ直書きしない。
 * 開発の Origin は、開発サーバー（Next.js の 3000 番と Workers の 8787 番）の既定の値です。
 */
export const WORKER_CONFIG = {
  /** API の経路の接頭辞。この接頭辞の要求だけを API として扱う。 */
  apiPrefix: '/api/',
  /** セッションの Cookie の名前（requirements 2.3）。 */
  sessionCookieName: 'csid',
  /** セッションの乱数の長さ（バイト）。16 バイト以上（CLAUDE.md 8）。 */
  sessionTokenBytes: 32,
  /** セッション Cookie の有効期間（秒）。1 日。 */
  sessionMaxAgeSeconds: 86400,
  /** 開発環境（APP_ENV=development）で許可する Origin。 */
  developmentOrigins: ['http://localhost:3000', 'http://localhost:8787'] as readonly string[],
  /** 状態を変えない要求。Origin の確認とレート制限の対象外。 */
  readMethods: ['GET', 'HEAD'] as readonly string[],
  /** 状態を変える要求。Origin の確認の対象。 */
  originCheckedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'] as readonly string[],
} as const;
