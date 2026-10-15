import { resolveAppEnv } from '../config/env';
import { WORKER_CONFIG } from '../config/worker';
import { WORKER_STRINGS } from '../config/strings/worker';
import { ApiRouter, isNotImplementedRoute, type RouteHandler, type RouteHandlerTable } from './http/router';
import { ApiResponder } from './http/responses';
import { OriginGuard } from './http/originGuard';
import type { WorkerBindings } from './env';
import type { ApiEndpointName } from '../core/api/paths';
import { RateLimitGuard } from './security/rateLimit';
import { SessionService } from './session/sessionService';
import { campaignHandlers } from './routes/campaign';
import { submissionHandlers } from './routes/submissions';
import { reviewHandlers } from './routes/review';
import { dailyPurge } from './cron/dailyPurge';
import { DebugTracer } from '../core/trace';
import { API_ENDPOINTS } from '../core/api/paths';
import { TRACE_METHOD_LABELS, TRACE_ROUTE_UNMATCHED, type TraceLabel } from '../config/trace';

/**
 * Workers の入口。要求ごとに、次の順で処理する（SPEC/worker-base.md）。
 * 1. APP_ENV の判定（想定外の値は例外）と、API 以外の経路は 404
 * 2. 状態を変える要求の Origin の確認（403）
 * 3. GET と HEAD 以外のレート制限（429）
 * 4. 経路の振り分け（404・405・ハンドラー）
 * 5. セッション Cookie の検証（無ければ発行）。経路が見つかり、セッションを使う場合だけ。health と 404・405・501（未実装）は対象外
 * 不正なパス（不正な % の並び）は 400（invalid_request）にする。
 * 例外は握りつぶさず、500（internal_error）に変換する。
 * 要求ごとに、トレースを 1 件残す（要求 ID・メソッド・経路の型・状態コード・処理時間だけ）。
 */
export class WorkerApp {
  private readonly responder = new ApiResponder();

  /** sink はトレースの出力先。既定は console.log（Workers のログ）。 */
  constructor(private readonly traceSink: (line: string) => void = (line) => console.log(line)) {}

  async fetch(request: Request, env: WorkerBindings): Promise<Response> {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const routeRef: { label: TraceLabel } = { label: TRACE_ROUTE_UNMATCHED };
    const response = await this.handle(request, env, routeRef);
    this.trace(request, env, requestId, routeRef.label, response.status, Date.now() - startedAt);
    return response;
  }

  /** 要求のトレースを 1 件残す。APP_ENV が不正なときは、500 の応答だけを返し、トレースは出さない。 */
  private trace(request: Request, env: WorkerBindings, requestId: string, route: TraceLabel, status: number, durationMs: number): void {
    let appEnv: ReturnType<typeof resolveAppEnv>;
    try {
      appEnv = resolveAppEnv(env.APP_ENV);
    } catch {
      return;
    }
    const known = (TRACE_METHOD_LABELS as readonly string[]).includes(request.method);
    const method = (known ? request.method : 'OTHER') as TraceLabel;
    new DebugTracer(appEnv, this.traceSink).summary('request.handled', { requestId, method, route, status, durationMs });
  }

  private async handle(request: Request, env: WorkerBindings, routeRef: { label: TraceLabel }): Promise<Response> {
    try {
      const appEnv = resolveAppEnv(env.APP_ENV);
      const url = new URL(request.url);
      if (!url.pathname.startsWith(WORKER_CONFIG.apiPrefix)) {
        return this.responder.error('not_found', 404);
      }
      if (!new OriginGuard(appEnv).isAllowed(request)) {
        return this.responder.error('origin_forbidden', 403);
      }
      const isReadMethod = (WORKER_CONFIG.readMethods as readonly string[]).includes(request.method);
      if (!isReadMethod && !(await new RateLimitGuard().isAllowed(request, env.RATE_LIMITER))) {
        return this.responder.error('rate_limited', 429);
      }
      const router = new ApiRouter(this.createHandlers());
      const match = router.match(request.method, url.pathname);
      if (match.kind === 'found') {
        routeRef.label = API_ENDPOINTS[match.name].path;
      }
      // health は死活確認のため、セッションを発行しない（DB を使わない）。それ以外の /api/* は Cookie を検証する。
      const isHealth = match.kind === 'found' && match.name === 'health';
      const usesSession = match.kind === 'found' && !isHealth && !isNotImplementedRoute(router.handlerFor(match.name));
      const session = !usesSession ? null : await new SessionService(env.DB).resolve(request.headers.get('cookie'));
      let response: Response;
      switch (match.kind) {
        case 'notFound':
          response = this.responder.error('not_found', 404);
          break;
        case 'badPath':
          response = this.responder.error('invalid_request', 400);
          break;
        case 'methodNotAllowed':
          response = this.responder.error('method_not_allowed', 405);
          break;
        case 'found':
          response = await router.handlerFor(match.name)({
            request,
            env,
            params: match.params,
            sessionIdHash: session?.sessionIdHash ?? null,
          });
          break;
      }
      return this.responder.finish(response, session?.setCookie ?? null);
    } catch (error) {
      console.error(WORKER_STRINGS.logUnhandledError, error instanceof Error ? error.name : 'unknown');
      return this.responder.error('internal_error', 500);
    }
  }

  /** paths.ts の全経路を登録する。機能のモジュールは、それぞれのハンドラーを返す。 */
  private createHandlers(): RouteHandlerTable {
    const health: RouteHandler = async () => this.responder.json({ status: 'ok' });
    const session: RouteHandler = async ({ env, sessionIdHash }) => {
      if (sessionIdHash === null) {
        throw new Error(WORKER_STRINGS.errorSessionMissing);
      }
      return this.responder.json({
        hasSession: true,
        hasCampaign: await new SessionService(env.DB).hasCampaign(sessionIdHash),
      });
    };
    const handlers: Partial<Record<ApiEndpointName, RouteHandler>> = {
      health,
      session,
      ...campaignHandlers(this.responder),
      ...submissionHandlers(this.responder),
      ...reviewHandlers(this.responder),
    };
    return handlers;
  }
}

export default {
  fetch(request: Request, env: WorkerBindings): Promise<Response> {
    return new WorkerApp().fetch(request, env);
  },
  async scheduled(_controller: ScheduledController, env: WorkerBindings): Promise<void> {
    await dailyPurge(env);
  },
} satisfies ExportedHandler<WorkerBindings>;
