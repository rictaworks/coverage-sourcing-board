import { API_ENDPOINTS } from '../../../core/api/paths';
import { SUBMISSION_FORM_FIELDS, type CheckSummary } from '../../../core/api/contract';
import { COMMON_STRINGS } from '../../../config/strings/common';
import { SUBJECT_KIND_LABELS } from '../../../config/strings/subjectHint';
import type { CheckItem, SubjectKind, Verdict } from '../../../core/types';
import { BROWSER_CHECK_ITEMS } from '../../../config/submission';
import { ApiError, MALFORMED_RESPONSE_CODE } from '../apiClient';
import type { PreparedImage } from '../image/preparedImage';
import type { BrowserCheckResult } from './runChecks';

/** ハニーポットに値があったため、送信しなかったことを示すコード。 */
export const HONEYPOT_FILLED_CODE = 'honeypot_filled';

/** 送信の入力（整形の結果・画面の入力・判定結果・ハニーポットの値）。 */
export interface SubmitPayload {
  readonly prepared: PreparedImage;
  readonly cellId: string;
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
  /** 1 項目 1 件の判定（Worker の meta.checks）。 */
  readonly checks: readonly BrowserCheckResult[];
  /** 申告（AI 生成でない・他で使っていない）。画面で両方にチェックしたときだけ true。 */
  readonly declaredOriginal: boolean;
  /** 掲載・利用への同意。 */
  readonly consent: boolean;
  /** ハニーポット欄の値。人は空のまま送ります。値があれば Worker が拒否します。 */
  readonly honeypot: string;
  /** 再投稿の元の投稿の ID。通常の投稿では null。 */
  readonly resubmittedFrom: string | null;
}

/** 被写体の推定の応答（補助）。推定できないときは、上限の再開の案内（あれば）を持ちます。 */
export type SubjectView =
  | { readonly status: 'estimated'; readonly kind: SubjectKind; readonly confidence: number; readonly uncertain: boolean }
  | { readonly status: 'none'; readonly resumeNotice: string | null };

/** 投稿の受け付けの応答（201）。 */
export interface SubmissionAccepted {
  readonly id: string;
  readonly status: 'pending_review';
  readonly checks: readonly CheckSummary[];
  readonly subject: SubjectView;
}

/** 不合格の理由（応答の reasons）。 */
export interface ServerReason {
  readonly item: string;
  readonly reasonCode: string;
}

/** 投稿の送信の失敗。code と HTTP の状態を持ち、submission_rejected では理由の一覧も持ちます。 */
export class SubmitApiError extends ApiError {
  readonly reasons: readonly ServerReason[];

  constructor(code: string, message: string, status: number, reasons: readonly ServerReason[] = []) {
    super(code, message, status);
    this.name = 'SubmitApiError';
    this.reasons = reasons;
  }
}

/** multipart の組み立て（送るのは image・thumb・meta・ハニーポットだけ。位置情報と機種情報は含めません）。 */
export class SubmissionFormBuilder {
  build(payload: SubmitPayload): FormData {
    const form = new FormData();
    form.append(SUBMISSION_FORM_FIELDS.image, new File([payload.prepared.saved.blob], 'image.jpg', { type: 'image/jpeg' }));
    form.append(SUBMISSION_FORM_FIELDS.thumb, new File([payload.prepared.classifyImage.blob], 'thumb.jpg', { type: 'image/jpeg' }));
    form.append(SUBMISSION_FORM_FIELDS.meta, JSON.stringify(this.meta(payload)));
    form.append(SUBMISSION_FORM_FIELDS.honeypot, payload.honeypot);
    return form;
  }

  /** meta の JSON（SPEC/api-submissions.md の 2.1）。位置情報・機種情報などの EXIF の値は含めません。 */
  private meta(payload: SubmitPayload) {
    return {
      cellId: payload.cellId,
      shotMonth: payload.shotMonth,
      spotName: payload.spotName.trim(),
      caption: payload.caption.trim(),
      phash: payload.prepared.features.phash,
      checks: payload.checks.map((check) => ({ item: check.item, verdict: check.verdict, reasonCode: check.reasonCode })),
      declaredOriginal: payload.declaredOriginal,
      consent: payload.consent,
      resubmittedFrom: payload.resubmittedFrom,
    };
  }
}

/** 投稿の送信（POST /api/submissions）。同一オリジンの /api/ だけを呼びます。 */
export class SubmitApi {
  constructor(
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
    private readonly builder: SubmissionFormBuilder = new SubmissionFormBuilder(),
  ) {}

  async submit(payload: SubmitPayload): Promise<SubmissionAccepted> {
    if (payload.honeypot !== '') {
      // ハニーポットに値があるときは送りません（人は入力しない欄です）。
      throw new SubmitApiError(HONEYPOT_FILLED_CODE, COMMON_STRINGS.errorHeading, 0);
    }
    const response = await this.fetcher(API_ENDPOINTS.submissionCreate.path, {
      method: API_ENDPOINTS.submissionCreate.method,
      credentials: 'same-origin',
      body: this.builder.build(payload),
    });
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new SubmitApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, response.status);
    }
    if (!response.ok) {
      throw this.errorOf(parsed, response.status);
    }
    return this.acceptedOf(parsed);
  }

  /** エラー応答の本文を読みます。形式が合わなければ、形式の誤りとして扱います。 */
  private errorOf(body: unknown, status: number): SubmitApiError {
    if (!isRecord(body) || typeof body.code !== 'string' || typeof body.message !== 'string') {
      return new SubmitApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, status);
    }
    const reasons = Array.isArray(body.reasons) ? body.reasons.filter(isReason) : [];
    return new SubmitApiError(body.code, body.message, status, reasons);
  }

  /** 201 の本文を読みます。形が合わなければ、代わりの値を作らず例外にします。 */
  private acceptedOf(body: unknown): SubmissionAccepted {
    if (!isRecord(body) || typeof body.id !== 'string' || body.status !== 'pending_review' || !Array.isArray(body.checks)) {
      throw new SubmitApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, 201);
    }
    return {
      id: body.id,
      status: 'pending_review',
      checks: this.checksOf(body.checks),
      subject: this.subjectOf(body.subject),
    };
  }

  /** checks の要素ごとに item・verdict・reasonCode を検証します。合わなければ、型を当てずに例外にします。 */
  private checksOf(value: unknown[]): CheckSummary[] {
    return value.map((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.item !== 'string' ||
        !(CHECK_ITEMS as readonly string[]).includes(entry.item) ||
        typeof entry.verdict !== 'string' ||
        !(VERDICTS as readonly string[]).includes(entry.verdict) ||
        typeof entry.reasonCode !== 'string'
      ) {
        throw new SubmitApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, 201);
      }
      return { item: entry.item as CheckItem, verdict: entry.verdict as Verdict, reasonCode: entry.reasonCode };
    });
  }

  private subjectOf(value: unknown): SubjectView {
    if (!isRecord(value)) {
      throw new SubmitApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, 201);
    }
    if (value.status === 'estimated' && typeof value.kind === 'string' && isSubjectKind(value.kind) && typeof value.confidence === 'number') {
      return { status: 'estimated', kind: value.kind, confidence: value.confidence, uncertain: value.uncertain === true };
    }
    if (value.status === 'none') {
      return { status: 'none', resumeNotice: typeof value.resumeNotice === 'string' ? value.resumeNotice : null };
    }
    throw new SubmitApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, 201);
  }
}

/** Worker が返しうる判定項目（ブラウザの項目と、Worker が判定する重複・被写体）。 */
const CHECK_ITEMS = [...BROWSER_CHECK_ITEMS, 'duplicate_image', 'duplicate_spot', 'subject_kind'] as const satisfies readonly CheckItem[];
const VERDICTS = ['pass', 'fail', 'review', 'info'] as const satisfies readonly Verdict[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isReason(value: unknown): value is ServerReason {
  return isRecord(value) && typeof value.item === 'string' && typeof value.reasonCode === 'string';
}

function isSubjectKind(value: string): value is SubjectKind {
  return Object.keys(SUBJECT_KIND_LABELS).includes(value);
}
