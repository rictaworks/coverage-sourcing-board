import { API_ENDPOINTS, type ApiEndpointName } from '../../core/api/paths';
import { WORKER_STRINGS } from '../../config/strings/worker';
import type { WorkerBindings } from '../env';
import type { ApiResponder } from './responses';

/** ハンドラーに渡す文脈。sessionIdHash は Cookie の値ではなく、そのハッシュ（health だけは null）。 */
export interface RouteContext {
  readonly request: Request;
  readonly env: WorkerBindings;
  readonly params: Readonly<Record<string, string>>;
  readonly sessionIdHash: string | null;
}

export type RouteHandler = (context: RouteContext) => Promise<Response>;

export type RouteHandlerTable = Partial<Record<ApiEndpointName, RouteHandler>>;

export type RouteMatch =
  | { readonly kind: 'found'; readonly name: ApiEndpointName; readonly params: Readonly<Record<string, string>> }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'badPath' }
  | { readonly kind: 'methodNotAllowed' };

/** 未実装の経路のハンドラー（501 と not_implemented を返す）。 */
export function notImplementedRoute(responder: ApiResponder): RouteHandler {
  const handler: RouteHandler = async () => responder.error('not_implemented', 501);
  NOT_IMPLEMENTED_HANDLERS.add(handler);
  return handler;
}

const NOT_IMPLEMENTED_HANDLERS = new WeakSet<RouteHandler>();

/** 未実装のハンドラーか。未実装の経路では、セッションを発行しない。 */
export function isNotImplementedRoute(handler: RouteHandler): boolean {
  return NOT_IMPLEMENTED_HANDLERS.has(handler);
}

/**
 * paths.ts の全経路を登録するルーター。登録のない経路は 404、メソッドが違えば 405 にする。
 * 登録されていない経路があれば、構成の時点で例外にする（フォールバックしない）。
 */
export class ApiRouter {
  constructor(private readonly handlers: RouteHandlerTable) {
    for (const name of Object.keys(API_ENDPOINTS) as ApiEndpointName[]) {
      if (handlers[name] === undefined) {
        throw new Error(WORKER_STRINGS.errorRouteNotRegistered);
      }
    }
  }

  match(method: string, pathname: string): RouteMatch {
    let pathFound = false;
    for (const name of Object.keys(API_ENDPOINTS) as ApiEndpointName[]) {
      const endpoint = API_ENDPOINTS[name];
      let params: Record<string, string> | null;
      try {
        params = this.matchPath(endpoint.path, pathname);
      } catch (error) {
        // 不正な % の並び（decodeURIComponent の URIError）だけを 400 にする。それ以外の例外は握りつぶさない。
        if (error instanceof URIError) {
          return { kind: 'badPath' };
        }
        throw error;
      }
      if (params === null) {
        continue;
      }
      pathFound = true;
      if (endpoint.method === method) {
        return { kind: 'found', name, params };
      }
    }
    return pathFound ? { kind: 'methodNotAllowed' } : { kind: 'notFound' };
  }

  handlerFor(name: ApiEndpointName): RouteHandler {
    const handler = this.handlers[name];
    if (handler === undefined) {
      throw new Error(WORKER_STRINGS.errorRouteNotRegistered);
    }
    return handler;
  }

  /** 経路の :name を、実際の値に対応づける。一致しなければ null。 */
  private matchPath(template: string, pathname: string): Record<string, string> | null {
    const expected = template.split('/');
    const actual = pathname.split('/');
    if (expected.length !== actual.length) {
      return null;
    }
    const params: Record<string, string> = {};
    for (let index = 0; index < expected.length; index += 1) {
      const segment = expected[index];
      if (segment.startsWith(':')) {
        if (actual[index] === '') {
          return null;
        }
        params[segment.slice(1)] = decodeURIComponent(actual[index]);
      } else if (segment !== actual[index]) {
        return null;
      }
    }
    return params;
  }
}
