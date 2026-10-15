import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../src/worker/index';
import {
  DEVELOPMENT_API_ORIGIN,
  DEVELOPMENT_WEB_ORIGIN,
  FOREIGN_ORIGIN,
  TEST_BASE_URL,
  testIp,
} from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';

const SUBMISSION_PATH = `${TEST_BASE_URL}/api/submissions`;

function postWithOrigin(origin: string | null, seed: number): Promise<Response> {
  const headers: Record<string, string> = { 'cf-connecting-ip': testIp(seed) };
  if (origin !== null) {
    headers.origin = origin;
  }
  return SELF.fetch(SUBMISSION_PATH, { method: 'POST', headers, body: '{}' });
}

async function errorCodeOf(response: Response): Promise<string> {
  return ((await response.json()) as { code: string }).code;
}

describe('Origin の確認（開発の設定：APP_ENV=development）', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('開発の Web（localhost:3000）からの POST は通ります（未実装の 501）', async () => {
    const response = await postWithOrigin(DEVELOPMENT_WEB_ORIGIN, 1);
    expect(response.status).toBe(501);
  });

  it('開発の API（localhost:8787）からの POST も通ります', async () => {
    const response = await postWithOrigin(DEVELOPMENT_API_ORIGIN, 2);
    expect(response.status).toBe(501);
  });

  it('Origin が無い POST は 403 です', async () => {
    const response = await postWithOrigin(null, 3);
    expect(response.status).toBe(403);
    expect(await errorCodeOf(response)).toBe('origin_forbidden');
  });

  it('他のサイトの Origin からの POST は 403 です', async () => {
    const response = await postWithOrigin(FOREIGN_ORIGIN, 4);
    expect(response.status).toBe(403);
  });

  it('GET には Origin の確認をしません（Origin が無くても通ります）', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/health`, { headers: { origin: FOREIGN_ORIGIN } });
    expect(response.status).toBe(200);
  });
});

describe('Origin の確認（本番の設定：APP_ENV=production）', () => {
  const productionEnv = { ...env, APP_ENV: 'production' };

  it('本番では、自分のオリジン（要求の URL の origin）からの POST は通ります', async () => {
    const response = await worker.fetch(
      new Request(SUBMISSION_PATH, {
        method: 'POST',
        headers: { origin: TEST_BASE_URL, 'cf-connecting-ip': testIp(5) },
        body: '{}',
      }),
      productionEnv,
    );
    expect(response.status).toBe(501);
  });

  it('本番では、開発の Origin（localhost:3000）からの POST は 403 です', async () => {
    const response = await worker.fetch(
      new Request(SUBMISSION_PATH, {
        method: 'POST',
        headers: { origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': testIp(6) },
        body: '{}',
      }),
      productionEnv,
    );
    expect(response.status).toBe(403);
  });

  it('APP_ENV が想定外の値なら、例外として 500（internal_error）にします（フォールバックしません）', async () => {
    const invalidEnv = { ...env, APP_ENV: 'staging' };
    const response = await worker.fetch(
      new Request(`${TEST_BASE_URL}/api/health`),
      invalidEnv,
    );
    expect(response.status).toBe(500);
    expect(await errorCodeOf(response)).toBe('internal_error');
  });
});
