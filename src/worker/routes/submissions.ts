import { notImplementedRoute, type RouteHandler } from '../http/router';
import type { ApiResponder } from '../http/responses';
import type { ApiEndpointName } from '../../core/api/paths';
import { WORKER_STRINGS } from '../../config/strings/worker';
import { resolveAppEnv } from '../../config/env';
import { DebugTracer } from '../../core/trace';
import type { TraceLabel } from '../../config/trace';
import { SubmissionFailure } from '../submission/failure';
import { SubmissionIntake } from '../submission/intake';

/**
 * 投稿の経路。POST /api/submissions（C3）を実装する。
 * 一覧（submissionsMine）と画像の取得（submissionImage）は C5 が担当するため、まだ 501 を返す。
 */
export function submissionHandlers(responder: ApiResponder, traceSink: (line: string) => void): Partial<Record<ApiEndpointName, RouteHandler>> {
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
        traceRejection(new DebugTracer(resolveAppEnv(env.APP_ENV), traceSink), error);
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

/**
 * 拒否のトレース。残すのは、拒否の種類（failureCode）、状態コード、不合格の理由のコードだけ。
 * 説明文・地点名・Cookie・IP・画像など、入力の値は含めない。
 */
function traceRejection(tracer: DebugTracer, failure: SubmissionFailure): void {
  tracer.summary('submission.rejected', { failureCode: failure.code, status: failure.status, count: failure.reasons.length });
  for (const reason of failure.reasons) {
    tracer.summary('submission.rejected', { failureCode: failure.code, reasonCode: reason.reasonCode as TraceLabel });
  }
}
