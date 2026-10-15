/**
 * SHA-256 のハッシュ（16 進の文字列）を返す。セッションの Cookie と IP のハッシュに使う。
 * 平文の値は保存しない（requirements 2.3・CLAUDE.md 8）。
 */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
