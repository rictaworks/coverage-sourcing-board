import type { ApiEndpointName } from '../../core/api/paths';
import { notImplementedRoute, type RouteHandler } from '../http/router';
import type { ApiResponder } from '../http/responses';

/**
 * 投稿の経路。C3 がこのモジュールのハンドラーを置き換える。
 * 現在は、すべて 501（not_implemented）を返す。
 */
export function submissionHandlers(responder: ApiResponder): Partial<Record<ApiEndpointName, RouteHandler>> {
  const notImplemented = notImplementedRoute(responder);
  return {
    submissionCreate: notImplemented,
    submissionsMine: notImplemented,
    submissionImage: notImplemented,
  };
}
