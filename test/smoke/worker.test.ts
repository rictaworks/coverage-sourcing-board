import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('workers project smoke', () => {
  it('GET /api/health returns 200 with JSON', async () => {
    const response = await SELF.fetch('http://localhost/api/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('exposes DB and RATE_LIMITER bindings', () => {
    expect(env.DB).toBeDefined();
    expect(env.RATE_LIMITER).toBeDefined();
  });

  it('does not expose the AI binding in the development environment', () => {
    expect((env as unknown as Record<string, unknown>).AI).toBeUndefined();
  });
});
