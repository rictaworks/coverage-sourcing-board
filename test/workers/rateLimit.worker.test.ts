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

  it('上限を超えると 429（rate_limited）になり、それより前の応答は全て 400（形式の検査）です', async () => {
    const ip = testIp(120);
    const attempts = 12;
    // 窓の時間に依存しないよう、同時に送る（直列だと負荷で窓をまたぎ、429 にならないことがある）。
    const responses = await Promise.all(Array.from({ length: attempts }, () => postFrom(ip)));
    const statuses = responses.map((response) => response.status);
    const limited = responses.filter((response) => response.status === 429);
    expect(limited.length, `statuses: ${statuses.join(',')}`).toBeGreaterThan(0);
    expect(statuses.every((status) => status === 400 || status === 429), `statuses: ${statuses.join(',')}`).toBe(true);
    expect(statuses.filter((status) => status === 400).length, `statuses: ${statuses.join(',')}`).toBeGreaterThan(0);
    expect(((await limited[0]!.json()) as { code: string }).code).toBe('rate_limited');
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
    expect(response.status).toBe(400);
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
