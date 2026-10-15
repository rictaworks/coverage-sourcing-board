import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError, type ApiRequestInit, type FetchLike } from '../../../src/frontend/lib/apiClient';
import { API_CLIENT_STRINGS } from '../../../src/config/strings/layout';
import { COMMON_STRINGS } from '../../../src/config/strings/common';

interface Recorded {
  readonly input: string;
  readonly init: ApiRequestInit;
}

/** 呼び出しを記録し、用意した応答を返す偽の fetch。 */
function fakeFetch(respond: () => Response): { fetcher: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetcher: FetchLike = async (input, init) => {
    calls.push({ input, init });
    return respond();
  };
  return { fetcher, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ApiClient（同一オリジンの API 呼び出し）', () => {
  it('同一オリジンの相対パスを、credentials: same-origin で呼びます', async () => {
    const { fetcher, calls } = fakeFetch(() => jsonResponse(200, { status: 'ok' }));
    const client = new ApiClient(fetcher);
    const result = await client.get<{ status: string }>('/api/health');
    expect(result).toEqual({ status: 'ok' });
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe('/api/health');
    expect(calls[0].init.credentials).toBe('same-origin');
    expect(calls[0].init.method).toBe('GET');
  });

  it('POST は JSON の本文を送ります', async () => {
    const { fetcher, calls } = fakeFetch(() => jsonResponse(200, { ok: true }));
    const client = new ApiClient(fetcher);
    await client.post('/api/submissions', { spot: 'sample' });
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(JSON.stringify({ spot: 'sample' }));
    expect(new Headers(calls[0].init.headers).get('content-type')).toBe('application/json');
  });

  it.each(['https://example.com/api/health', '//example.com/api/health', '/health', 'api/health'])(
    '同一オリジンの /api/ 以外の %s は呼びません',
    async (path) => {
      const { fetcher, calls } = fakeFetch(() => jsonResponse(200, {}));
      const client = new ApiClient(fetcher);
      await expect(client.get(path)).rejects.toThrow(API_CLIENT_STRINGS.invalidPath);
      expect(calls).toHaveLength(0);
    },
  );

  it('エラーの JSON（code と message）を、型つきの ApiError にします', async () => {
    const { fetcher } = fakeFetch(() => jsonResponse(429, { code: 'rate_limited', message: 'too many requests' }));
    const client = new ApiClient(fetcher);
    const error = await client.get('/api/health').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'rate_limited', message: 'too many requests', status: 429 });
  });

  it('エラーの本文が JSON でないときは、代わりの値を作らず、形式の誤りとして扱います', async () => {
    const { fetcher } = fakeFetch(() => new Response('<html>bad gateway</html>', { status: 502 }));
    const client = new ApiClient(fetcher);
    const error = await client.get('/api/health').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'malformed_response', message: COMMON_STRINGS.errorHeading, status: 502 });
  });
});
