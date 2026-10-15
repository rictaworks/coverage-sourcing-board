import { APP_STRINGS } from '../config/strings';

/**
 * Workers のバインディング。Workers AI（AI）は production の環境だけに宣言するため、任意とする。
 */
export interface WorkerBindings {
  DB: D1Database;
  RATE_LIMITER: RateLimit;
  APP_ENV: string;
  AI?: Ai;
}

declare global {
  namespace Cloudflare {
    // cloudflare:test の env（テストの型）と、Workers の型を、同じバインディングに揃える。
    interface Env extends WorkerBindings {}
  }
}

/**
 * 最小の API ルーター。C1 以降で拡張する。
 */
export class WorkerApp {
  async fetch(request: Request, env: WorkerBindings): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return Response.json({ status: 'ok' });
    }
    return new Response(APP_STRINGS.notFoundMessage, {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
}

export default {
  fetch(request: Request, env: WorkerBindings): Promise<Response> {
    return new WorkerApp().fetch(request, env);
  },
} satisfies ExportedHandler<WorkerBindings>;
