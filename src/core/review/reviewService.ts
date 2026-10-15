/**
 * 最終確認の状態遷移（requirements 3.7・10 章）。外部に依存しない純粋なクラスです。
 * 許される遷移は次の 3 つだけです。
 *   pending_review → accepted（採用。枠を超えるときは確認の印が必要）
 *   pending_review → returned（差し戻し）
 *   accepted → returned（採用の取り消し）
 * 枠の判定は B1 の CoverageCalculator（キャンペーンの 1 マス分）で行います。
 */
import { LIMITS } from '../../config/limits';
import { REVIEW_DEV_MESSAGES } from '../../config/strings/review';
import { SUBJECT_KINDS } from '../../config/classifier';
import { normalizeText } from '../text/normalize';
import { defineCampaign } from '../campaign/defineCampaign';
import { CoverageCalculator } from '../campaign/coverageCalculator';
import type { Season } from '../campaign/period';
import { RETURN_REASON_CODES, type ReturnInfo, type ReturnReasonCode } from '../api/contract';
import type { AcceptRule, SubjectHintResult, SubjectKind, SubmissionStatus } from '../types';

/** 自由記述で拒否する文字：制御文字（C0・DEL・C1）と双方向の制御文字。 */
const FORBIDDEN_FREE_TEXT_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/;

/** 最終確認の失敗の種類（応答のコードへの対応は、経路の層で決める）。 */
export type ReviewErrorCode =
  | 'invalid_transition'
  | 'over_quota_confirmation_required'
  | 'reason_code_invalid'
  | 'free_text_required'
  | 'free_text_too_long'
  | 'free_text_invalid';

/** 想定の失敗。メッセージには入力の内容を含めない。 */
export class ReviewError extends Error {
  constructor(readonly code: ReviewErrorCode) {
    super(code);
  }
}

/** 差し戻し・取り消しの入力（要求の値。検証は ReviewService が行う）。 */
export interface ReturnRequest {
  readonly reasonCode: string;
  readonly freeText: string;
  readonly resubmittable: boolean;
}

export interface AcceptDecision {
  readonly status: 'accepted';
  readonly overQuota: boolean;
}

export interface ReturnDecision {
  readonly status: 'returned';
  readonly returnInfo: ReturnInfo;
}

/** 被写体の推定の行（check_result の subject_kind）。 */
export interface SubjectCheckRow {
  readonly item: string;
  readonly verdict: string;
  readonly reason: string;
  readonly confidence: number | null;
  readonly model: string | null;
}

/** 枠の判定の入力（1 マス分）。 */
export interface CellQuotaInput {
  readonly areaLabel: string;
  readonly season: Season;
  readonly required: number;
  readonly accepted: number;
  readonly rule: AcceptRule;
}

/** 確認キューの 1 件（画像の中身は含めない）。 */
export interface ReviewQueueEntry {
  readonly id: string;
  readonly cellId: string;
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
  /** 要確認（verdict=review）の判定の項目と理由のコード。 */
  readonly checks: readonly { readonly item: string; readonly verdict: 'review'; readonly reasonCode: string }[];
  /** 被写体の推定（補助。根拠にしない）。 */
  readonly subject: SubjectHintResult;
  /** 同じ画像・同じマスの地点名が一致する、既存の投稿（確認待ち・採用済み）の ID。 */
  readonly candidateIds: readonly string[];
}

/** 取り消しのための採用済みの 1 件。 */
export interface AcceptedEntry {
  readonly id: string;
  readonly cellId: string;
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
  readonly overQuota: boolean;
}

/** GET /api/review/queue の応答。 */
export interface ReviewQueueView {
  readonly items: readonly ReviewQueueEntry[];
  readonly accepted: readonly AcceptedEntry[];
}

/** reason 列に保存する差し戻しの内容（JSON）。 */
interface StoredReason {
  readonly reasonCode: ReturnReasonCode;
  readonly freeText: string;
}

export class ReviewService {
  /** 採用。pending_review だけを採用できます。枠を超えるときは、確認の印（confirmOverQuota）が無ければ拒否します。 */
  accept(status: SubmissionStatus, cellOpen: boolean, confirmOverQuota: boolean): AcceptDecision {
    if (status !== 'pending_review') {
      throw new ReviewError('invalid_transition');
    }
    if (!cellOpen && !confirmOverQuota) {
      throw new ReviewError('over_quota_confirmation_required');
    }
    return { status: 'accepted', overQuota: !cellOpen };
  }

  /** 差し戻し。pending_review だけを差し戻せます。理由と自由記述を検証します。 */
  returnSubmission(status: SubmissionStatus, request: ReturnRequest): ReturnDecision {
    if (status !== 'pending_review') {
      throw new ReviewError('invalid_transition');
    }
    return { status: 'returned', returnInfo: this.normalizeReturnRequest(request) };
  }

  /** 採用の取り消し。accepted だけを取り消せ、差し戻しの扱い（returned）にします。 */
  revoke(status: SubmissionStatus, request: ReturnRequest): ReturnDecision {
    if (status !== 'accepted') {
      throw new ReviewError('invalid_transition');
    }
    return { status: 'returned', returnInfo: this.normalizeReturnRequest(request) };
  }

  /**
   * マスの募集中かどうか（採用数が必要数未満）。B1 の CoverageCalculator で、1 マスだけのキャンペーンを計算します。
   * 確認待ちは枠に含めません（採用数だけを渡します）。
   */
  isCellOpen(input: CellQuotaInput): boolean {
    const campaign = defineCampaign(
      {
        name: REVIEW_DEV_MESSAGES.internalCampaignName,
        areas: [input.areaLabel],
        seasons: [input.season],
        required: input.required,
        rule: input.rule,
      },
      () => REVIEW_DEV_MESSAGES.internalCampaignName,
    );
    const cell = campaign.cells[0];
    const report = new CoverageCalculator().compute(campaign, [
      { campaignId: campaign.id, cellId: cell.id, accepted: input.accepted, pending: 0 },
    ]);
    return report.cells[0].open;
  }

  /** 差し戻しの入力を検証し、保存する形に直します。自由記述は前後の空白を除き、HTML として扱いません（そのまま文字列）。 */
  normalizeReturnRequest(request: ReturnRequest): ReturnInfo {
    if (!(RETURN_REASON_CODES as readonly string[]).includes(request.reasonCode)) {
      throw new ReviewError('reason_code_invalid');
    }
    const reasonCode = request.reasonCode as ReturnReasonCode;
    if (FORBIDDEN_FREE_TEXT_CHARS.test(request.freeText)) {
      throw new ReviewError('free_text_invalid');
    }
    const freeText = normalizeText(request.freeText);
    if ([...freeText].length > LIMITS.returnReasonMaxChars) {
      throw new ReviewError('free_text_too_long');
    }
    if (reasonCode === 'other' && freeText === '') {
      throw new ReviewError('free_text_required');
    }
    return { reasonCode, freeText, resubmittable: request.resubmittable };
  }

  /** 差し戻しの内容を reason 列の文字列にする。 */
  static encodeReason(info: Pick<ReturnInfo, 'reasonCode' | 'freeText'>): string {
    const stored: StoredReason = { reasonCode: info.reasonCode, freeText: info.freeText };
    return JSON.stringify(stored);
  }

  /** reason 列の文字列を読む。形が違えば例外にします（保存の不整合。応答には含めません）。 */
  static decodeReason(raw: string): StoredReason {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(REVIEW_DEV_MESSAGES.errorStoredReasonInvalid);
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(REVIEW_DEV_MESSAGES.errorStoredReasonInvalid);
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.reasonCode !== 'string' ||
      !(RETURN_REASON_CODES as readonly string[]).includes(record.reasonCode) ||
      typeof record.freeText !== 'string'
    ) {
      throw new Error(REVIEW_DEV_MESSAGES.errorStoredReasonInvalid);
    }
    return { reasonCode: record.reasonCode as ReturnReasonCode, freeText: record.freeText };
  }

  /** check_result の subject_kind の行から、被写体の推定（補助）を読む。行が無い・区分が想定外なら推定なし。 */
  static subjectFrom(row: SubjectCheckRow | null): SubjectHintResult {
    if (row === null || row.verdict !== 'info' || row.confidence === null || row.model === null) {
      return { status: 'none' };
    }
    const kind = (SUBJECT_KINDS as readonly string[]).includes(row.reason) ? (row.reason as SubjectKind) : null;
    if (kind === null) {
      return { status: 'none' };
    }
    return { status: 'estimated', kind, confidence: row.confidence, model: row.model };
  }
}
