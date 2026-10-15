import { notImplementedRoute, type RouteHandler } from '../http/router';
import type { ApiResponder } from '../http/responses';
import type { ApiEndpointName } from '../../core/api/paths';
import { WORKER_STRINGS } from '../../config/strings/worker';
import { SubmissionFailure } from '../submission/failure';
import { SubmissionIntake } from '../submission/intake';

/**
 * 投稿の経路。POST /api/submissions（C3）を実装する。
 * 一覧（submissionsMine）と画像の取得（submissionImage）は C5 が担当するため、まだ 501 を返す。
 */
export function submissionHandlers(responder: ApiResponder): Partial<Record<ApiEndpointName, RouteHandler>> {
  const notImplemented = notImplementedRoute(responder);
  const intake = new SubmissionIntake();
  const submissionCreate: RouteHandler = async ({ request, env, sessionIdHash }) => {
    if (sessionIdHash === null) {
      throw new Error(WORKER_STRINGS.errorSessionMissing);
    }
    try {
      const accepted = await intake.accept(request, env, sessionIdHash);
      return responder.json(accepted, 201);
    } catch (error) {
      if (error instanceof SubmissionFailure) {
        return responder.json(error.toBody(), error.status);
      }
      throw error;
    }
  };
  return {
    submissionCreate,
    submissionsMine: notImplemented,
    submissionImage: notImplemented,
  };
}
