/**
 * GA4 を読み込むかの判定。APP_ENV が production のときだけ true を返す。
 * 開発（development）や未設定のときは読み込まない。値の検証は行わず、production 以外はすべて読み込まない扱いとする。
 */
export function shouldLoadAnalytics(raw: string | undefined): boolean {
  return raw === 'production';
}
