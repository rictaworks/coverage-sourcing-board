import type { ApiEndpointName } from '../../core/api/paths';
import { notImplementedRoute, type RouteHandler } from '../http/router';
import type { ApiResponder } from '../http/responses';

/**
 * 審査の経路。C5 がこのモジュールのハンドラーを置き換える。
 * 現在は、すべて 501（not_implemented）を返す。
 */
export function reviewHandlers(responder: ApiResponder): Partial<Record<ApiEndpointName, RouteHandler>> {
  const notImplemented = notImplementedRoute(responder);
  return {
    reviewQueue: notImplemented,
    reviewAccept: notImplemented,
    reviewReturn: notImplemented,
    reviewRevoke: notImplemented,
  };
}
