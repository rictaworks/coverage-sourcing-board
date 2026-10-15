import { API_ERROR_MESSAGES } from '../../config/strings/apiErrors';
import { WORKER_STRINGS } from '../../config/strings/worker';
import type { ApiErrorBody, ApiErrorCode } from '../../core/api/contract';

/** 基盤だけが使うエラーのコード（contract.ts の API_ERROR_CODES には含めない）。 */
export const WORKER_ERROR_CODES = ['not_implemented', 'method_not_allowed', 'origin_forbidden'] as const;
export type WorkerErrorCode = (typeof WORKER_ERROR_CODES)[number];
export type ResponseErrorCode = ApiErrorCode | WorkerErrorCode;

/**
 * API の応答を作る。すべての応答に nosniff と no-store（既にハンドラーが Cache-Control を付けていれば、それを残す）を付け、CORS の許可ヘッダーは付けない。
 */
export class ApiResponder {
  json(body: unknown, status: number = 200): Response {
    return this.finish(Response.json(body, { status }), null);
  }

  error(code: ResponseErrorCode, status: number): Response {
    const body: ApiErrorBody<ResponseErrorCode> = { code, message: this.messageOf(code) };
    return this.json(body, status);
  }

  /** 応答にセキュリティのヘッダーと、（あれば）Set-Cookie を付けて返す。 */
  finish(response: Response, setCookie: string | null): Response {
    const headers = new Headers(response.headers);
    headers.set('x-content-type-options', 'nosniff');
    if (!headers.has('cache-control')) {
      headers.set('cache-control', 'no-store');
    }
    if (setCookie !== null) {
      headers.append('set-cookie', setCookie);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  private messageOf(code: ResponseErrorCode): string {
    if (code in WORKER_STRINGS.errorMessages) {
      return WORKER_STRINGS.errorMessages[code as WorkerErrorCode];
    }
    return API_ERROR_MESSAGES[code as ApiErrorCode];
  }
}
