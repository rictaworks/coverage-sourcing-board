import type { ApiEndpointName } from '../../core/api/paths';
import { notImplementedRoute, type RouteHandler } from '../http/router';
import type { ApiResponder } from '../http/responses';

/**
 * キャンペーン（と充足の一覧）の経路。C2 がこのモジュールのハンドラーを置き換える。
 * 現在は、すべて 501（not_implemented）を返す。
 */
export function campaignHandlers(responder: ApiResponder): Partial<Record<ApiEndpointName, RouteHandler>> {
  const notImplemented = notImplementedRoute(responder);
  return {
    campaignGet: notImplemented,
    campaignPut: notImplemented,
    campaignTemplate: notImplemented,
    campaignAreas: notImplemented,
    coverage: notImplemented,
  };
}
