import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../src/worker/index';
import { sha256Hex } from '../../src/worker/security/sha256';
import { RecordingRateLimiter } from '../helpers/recordingRateLimiter';
import { DEVELOPMENT_WEB_ORIGIN, TEST_BASE_URL, testIp } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';

const SUBMISSION_PATH = `${TEST_BASE_URL}/api/submissions`;

function postFrom(ip: string | null): Promise<Response> {
  const headers: Record<string, string> = { origin: DEVELOPMENT_WEB_ORIGIN };
  if (ip !== null) {
    headers['cf-connecting-ip'] = ip;
  }
  return SELF.fetch(SUBMISSION_PATH, { method: 'POST', headers, body: '{}' });
}

describe('レート制限（RATE_LIMITER のバインディング。10 秒に 5 回まで）', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('上限を超えると 429（rate_limited）になり、それより前の応答は全て 501 です', async () => {
    const ip = testIp(120);
    const maxAttempts = 12;
    const statuses: number[] = [];
    let limited: Response | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await postFrom(ip);
      statuses.push(response.status);
      if (response.status === 429) {
        limited = response;
        break;
      }
    }
    expect(limited, `statuses: ${statuses.join(',')}`).not.toBeNull();
    const before = statuses.slice(0, -1);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((status) => status === 501), `statuses: ${statuses.join(',')}`).toBe(true);
    expect(((await limited!.json()) as { code: string }).code).toBe('rate_limited');
  });

  it('GET にはレート制限を適用しません（同じ IP から続けて呼んでも 200 です）', async () => {
    const ip = testIp(121);
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const response = await SELF.fetch(`${TEST_BASE_URL}/api/health`, { headers: { 'cf-connecting-ip': ip } });
      expect(response.status).toBe(200);
    }
  });

  it('バインディングが許可を返せば通ります（テストダブル）', async () => {
    const binding = new RecordingRateLimiter(true);
    const response = await worker.fetch(
      new Request(SUBMISSION_PATH, {
        method: 'POST',
        headers: { origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': testIp(122) },
        body: '{}',
      }),
      { ...env, RATE_LIMITER: binding },
    );
    expect(response.status).toBe(501);
    expect(binding.keys).toHaveLength(1);
  });

  it('バインディングが拒否を返せば 429 です（テストダブル）', async () => {
    const binding = new RecordingRateLimiter(false);
    const response = await worker.fetch(
      new Request(SUBMISSION_PATH, {
        method: 'POST',
        headers: { origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': testIp(123) },
        body: '{}',
      }),
      { ...env, RATE_LIMITER: binding },
    );
    expect(response.status).toBe(429);
  });

  it('キーは CF-Connecting-IP の SHA-256 のハッシュで、IP そのものは含みません', async () => {
    const ip = testIp(124);
    const binding = new RecordingRateLimiter(true);
    await worker.fetch(
      new Request(SUBMISSION_PATH, {
        method: 'POST',
        headers: { origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': ip },
        body: '{}',
      }),
      { ...env, RATE_LIMITER: binding },
    );
    const [key] = binding.keys;
    expect(key).toBe(await sha256Hex(ip));
    expect(key).not.toContain(ip);
  });

  it('バインディングが無いときは例外として 500（internal_error）にします（制限値を作りません）', async () => {
    const response = await worker.fetch(
      new Request(SUBMISSION_PATH, {
        method: 'POST',
        headers: { origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': testIp(125) },
        body: '{}',
      }),
      { ...env, RATE_LIMITER: undefined } as unknown as typeof env,
    );
    expect(response.status).toBe(500);
    expect(((await response.json()) as { code: string }).code).toBe('internal_error');
  });

  it('CF-Connecting-IP が無いときは例外として 500（internal_error）にします', async () => {
    const response = await postFrom(null);
    expect(response.status).toBe(500);
    expect(((await response.json()) as { code: string }).code).toBe('internal_error');
  });
});
