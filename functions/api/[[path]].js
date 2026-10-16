// 本番の同一オリジン転送（Pages）。フロントの /api/* を Worker へ渡す。
// 開発時の転送は src/frontend/next.config.mjs（rewrites）が担う。
//
// Worker は状態を変える要求の Origin を「Worker 自身のオリジン」と比べる（src/worker/http/originGuard.ts）。
// 転送すると Worker から見た自分のオリジンが変わるため、ここで Origin を確認してから Worker 側の値に置き換える。
const WORKER_ORIGIN = 'https://coverage-sourcing-board.rictaworks.workers.dev';
const CHECKED_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const headers = new Headers(request.headers);

  if (CHECKED_METHODS.includes(request.method)) {
    if (request.headers.get('origin') !== url.origin) {
      return new Response(
        JSON.stringify({ code: 'origin_forbidden', message: '別のサイトからの操作は受け付けられません。画面を読み込み直して、もう一度お試しください。' }),
        { status: 403, headers: { 'content-type': 'application/json; charset=utf-8' } },
      );
    }
    headers.set('origin', WORKER_ORIGIN);
  }

  const target = new URL(url.pathname + url.search, WORKER_ORIGIN);
  return fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: 'manual' }));
}
