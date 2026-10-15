import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { WORKER_CONFIG } from '../../src/config/worker';
import { sha256Hex } from '../../src/worker/security/sha256';
import { MALFORMED_COOKIE_VALUE, TEST_BASE_URL } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';

/** Set-Cookie から csid の値を取り出す。 */
function extractToken(setCookie: string | null): string | null {
  const match = setCookie?.match(new RegExp(`^${WORKER_CONFIG.sessionCookieName}=([^;]+)`));
  return match?.[1] ?? null;
}

async function countSessionRows(idHash: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM session WHERE id_hash = ?').bind(idHash).first<{ n: number }>();
  return row?.n ?? -1;
}

describe('セッション Cookie（requirements 2.3・SPEC/worker-base.md）', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('Cookie が無い要求で Set-Cookie を返し、値は base64url の 43 文字（32 バイト）です', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/session`);
    const token = extractToken(response.headers.get('set-cookie'));
    expect(token).not.toBeNull();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('Set-Cookie の属性は HttpOnly、Secure、SameSite=Lax、Max-Age=86400、Path=/ です', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/session`);
    const setCookie = response.headers.get('set-cookie') ?? '';
    const attributes = setCookie.split(';').map((part) => part.trim());
    expect(attributes).toContain('HttpOnly');
    expect(attributes).toContain('Secure');
    expect(attributes).toContain('SameSite=Lax');
    expect(attributes).toContain('Max-Age=86400');
    expect(attributes).toContain('Path=/');
  });

  it('DB には Cookie の値そのものがなく、SHA-256 のハッシュだけがあります', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/session`);
    const token = extractToken(response.headers.get('set-cookie'));
    if (token === null) {
      throw new Error('csid token missing in Set-Cookie');
    }
    expect(await countSessionRows(token)).toBe(0);
    expect(await countSessionRows(await sha256Hex(token))).toBe(1);
  });

  it('同じ Cookie で 2 回目の要求をしても、新しい Cookie を発行しません', async () => {
    const first = await SELF.fetch(`${TEST_BASE_URL}/api/session`);
    const token = extractToken(first.headers.get('set-cookie'));
    const second = await SELF.fetch(`${TEST_BASE_URL}/api/session`, {
      headers: { cookie: `${WORKER_CONFIG.sessionCookieName}=${token}` },
    });
    expect(second.headers.get('set-cookie')).toBeNull();
  });

  it('形式が不正な Cookie では、新しい Cookie を発行します', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/session`, {
      headers: { cookie: `${WORKER_CONFIG.sessionCookieName}=${MALFORMED_COOKIE_VALUE}` },
    });
    const token = extractToken(response.headers.get('set-cookie'));
    expect(token).not.toBeNull();
    expect(token).not.toBe(MALFORMED_COOKIE_VALUE);
  });

  it('DB に無い形式の正しい Cookie でも、新しい Cookie を発行します', async () => {
    const unknownToken = 'A'.repeat(43);
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/session`, {
      headers: { cookie: `${WORKER_CONFIG.sessionCookieName}=${unknownToken}` },
    });
    const token = extractToken(response.headers.get('set-cookie'));
    expect(token).not.toBeNull();
    expect(token).not.toBe(unknownToken);
  });

  it('GET /api/session は、セッションの有無と、キャンペーンの有無を返します', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/session`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ hasSession: true, hasCampaign: false });
  });

  it('登録のない経路・メソッド違いでは、セッションの行を作りません', async () => {
    const count = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM session').first<{ n: number }>())?.n ?? -1;
    const before = await count();
    const notFound = await SELF.fetch(`${TEST_BASE_URL}/api/no-such-path`);
    const notAllowed = await SELF.fetch(`${TEST_BASE_URL}/api/health`, { method: 'DELETE', headers: { origin: TEST_BASE_URL, 'cf-connecting-ip': '203.0.113.200' } });
    // 全経路が実装済みになったため、未実装（501）の経路は無い。404 とメソッド違い（405）で確かめる。
    expect([notFound.status, notAllowed.status]).toEqual([404, 405]);
    expect(notFound.headers.get('set-cookie')).toBeNull();
    expect(notAllowed.headers.get('set-cookie')).toBeNull();
    expect(await count()).toBe(before);
  });
});
