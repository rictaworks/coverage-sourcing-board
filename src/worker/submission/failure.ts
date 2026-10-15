import { API_ERROR_MESSAGES } from '../../config/strings/apiErrors';
import type { ApiErrorCode, RejectionReason, SubmissionRejectedBody } from '../../core/api/contract';

/**
 * 投稿の検証で、保存せずに返す失敗。code は API のエラーのコード、status は HTTP の状態。
 * 例外のメッセージには入力の内容を含めない（code と reasons だけを応答に出す）。
 */
export class SubmissionFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    readonly reasons: readonly RejectionReason[] = [],
  ) {
    super(code);
    this.name = 'SubmissionFailure';
  }

  /** 応答の本文。submission_rejected のときだけ reasons を含める。 */
  toBody(): { code: ApiErrorCode; message: string } | SubmissionRejectedBody {
    const message = API_ERROR_MESSAGES[this.code];
    if (this.code === 'submission_rejected') {
      return { code: 'submission_rejected', message, reasons: this.reasons };
    }
    return { code: this.code, message };
  }
}
