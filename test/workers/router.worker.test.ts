import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { API_ENDPOINTS, type ApiEndpointName } from '../../src/core/api/paths';
import { testIp, DEVELOPMENT_WEB_ORIGIN, TEST_BASE_URL } from '../fixtures/workerRequests';
import { isNotImplementedRoute, notImplementedRoute, type RouteHandler } from '../../src/worker/http/router';
import { ApiResponder } from '../../src/worker/http/responses';
import { applyMigrations } from '../helpers/d1Migrations';

/** 経路の :id を、テスト用の値に置き換える。 */
function concretePath(path: string): string {
  return path.replace(':id', 'test-id');
}

function expectSecureHeaders(response: Response): void {
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
}

describe('ルーター（SPEC/worker-base.md）', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('GET /api/health は 200 で、nosniff と no-store のヘッダーを持ちます', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expectSecureHeaders(response);
  });

  it('登録のない経路は 404 を JSON（code と message）で返します', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/no-such-path`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('not_found');
    expect(body.message.length).toBeGreaterThan(0);
    expectSecureHeaders(response);
  });

  it('メソッドが違う場合は 405 を JSON で返します（Origin は開発の許可済みの値）', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/health`, {
      method: 'POST',
      headers: { origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': testIp(101) },
    });
    expect(response.status).toBe(405);
    expect(((await response.json()) as { code: string }).code).toBe('method_not_allowed');
    expectSecureHeaders(response);
  });

  it('paths の全経路が登録されています（未実装は 501 と not_implemented）', async () => {
    const entries = Object.entries(API_ENDPOINTS) as [ApiEndpointName, { method: string; path: string }][];
    // C2 が実装したキャンペーンと充足の経路は、501 ではなくなる（別のテストで確かめる）。
    // C3 が実装した投稿の受け取り（POST /api/submissions）も、501 ではなくなる（test/workers/submissions.worker.test.ts で確かめる）。
    const implemented = new Set<ApiEndpointName>(['health', 'session', 'campaignGet', 'campaignPut', 'campaignTemplate', 'campaignAreas', 'coverage', 'submissionCreate']);
    let seed = 110;
    for (const [name, endpoint] of entries) {
      if (implemented.has(name)) {
        continue;
      }
      seed += 1;
      const headers: Record<string, string> = { 'cf-connecting-ip': testIp(seed) };
      if (endpoint.method !== 'GET') {
        headers.origin = DEVELOPMENT_WEB_ORIGIN;
      }
      const response = await SELF.fetch(`${TEST_BASE_URL}${concretePath(endpoint.path)}`, {
        method: endpoint.method,
        headers,
        body: endpoint.method === 'GET' ? undefined : '{}',
      });
      expect(response.status, name).toBe(501);
      const body = (await response.json()) as { code: string; message: string };
      expect(body.code, name).toBe('not_implemented');
      expect(body.message.length, name).toBeGreaterThan(0);
      expectSecureHeaders(response);
    }
  });
});

describe('不正なパス（SPEC/worker-base.md）', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('不正な % の並びを含むパスは、500 ではなく 400（invalid_request）を返します', async () => {
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/submissions/%E0%A4%A/image`, {
      headers: { 'cf-connecting-ip': testIp(150) },
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe('invalid_request');
  });

  it('未実装のハンドラーだけが印を持ち、実装済みのハンドラーは未実装と判定されません', async () => {
    const responder = new ApiResponder();
    const stub = notImplementedRoute(responder);
    const implemented: RouteHandler = async () => new Response('ok');
    expect(isNotImplementedRoute(stub)).toBe(true);
    expect(isNotImplementedRoute(implemented)).toBe(false);
    expect((await stub({} as never)).status).toBe(501);
  });
});
