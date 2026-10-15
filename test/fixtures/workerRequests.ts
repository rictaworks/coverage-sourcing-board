/**
 * Worker のテストで使う要求の入力データ（オリジン・IP・Cookie の形式）。
 * 実装（src/worker）は呼ばない。テストの入力として、固定の値だけを置く。
 * IP は文書用の範囲（203.0.113.0/24）の値。
 */

/** SELF.fetch の基準の URL（request.url の origin がこの値になる）。 */
export const TEST_BASE_URL = 'http://localhost';

/** 開発の既定の Origin（Next.js の開発サーバー）。 */
export const DEVELOPMENT_WEB_ORIGIN = 'http://localhost:3000';

/** 開発の既定の Origin（Workers の開発サーバー）。 */
export const DEVELOPMENT_API_ORIGIN = 'http://localhost:8787';

/** 許可されていない他のサイトの Origin。 */
export const FOREIGN_ORIGIN = 'https://example.com';

/** 連番から、テスト用の IP（文書用の範囲）を作る。テストごとに別の IP を使い、レート制限の状態を分ける。 */
export function testIp(seed: number): string {
  return `203.0.113.${seed}`;
}

/** 形式の正しくない Cookie の値（43 文字の base64url ではない）。 */
export const MALFORMED_COOKIE_VALUE = 'short-value';
