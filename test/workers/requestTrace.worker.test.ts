import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { WorkerApp } from '../../src/worker';
import { testIp, TEST_BASE_URL } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';

async function run(path: string, seed: number, extraHeaders: Record<string, string> = {}) {
  const lines: string[] = [];
  const app = new WorkerApp((line) => lines.push(line));
  const response = await app.fetch(
    new Request(`${TEST_BASE_URL}${path}`, { headers: { 'cf-connecting-ip': testIp(seed), ...extraHeaders } }),
    env,
  );
  return { response, lines };
}

describe('要求ごとのトレース（SPEC/worker-base.md）', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('要求ごとに 1 件、メソッド・経路の型・状態コード・処理時間だけを残します', async () => {
    const { lines } = await run('/api/health', 160);
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line.name).toBe('request.handled');
    expect(Object.keys(line.fields).sort()).toEqual(['durationMs', 'method', 'route', 'status']);
    expect(line.fields).toMatchObject({ method: 'GET', route: '/api/health', status: 200 });
    expect(typeof line.fields.durationMs).toBe('number');
  });

  it('経路には実際の ID を含めず、テンプレートを残します。IP・Cookie・Origin も含めません', async () => {
    const { lines } = await run('/api/submissions/secret-id-123/image', 161, {
      cookie: 'csid=SECRETCOOKIEVALUE',
      origin: 'https://example.com',
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).fields.route).toBe('/api/submissions/:id/image');
    for (const secret of ['secret-id-123', 'SECRETCOOKIEVALUE', 'example.com', testIp(161)]) {
      expect(lines[0]).not.toContain(secret);
    }
  });

  it('登録のない経路と不正なパスも、経路の型は固定の名前にします', async () => {
    const notFound = await run('/api/no-such-path/xyz', 162);
    expect(JSON.parse(notFound.lines[0]).fields).toMatchObject({ route: 'unmatched', status: 404 });
    const bad = await run('/api/submissions/%E0%A4%A/image', 163);
    expect(JSON.parse(bad.lines[0]).fields).toMatchObject({ route: 'unmatched', status: 400 });
  });
});
