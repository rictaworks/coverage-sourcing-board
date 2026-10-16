import { RETURN_REASON_CODES, type CampaignResponse, type CoverageResponse, type ReturnReasonCode } from '../../../core/api/contract';
import type { AcceptedEntry, ReviewQueueView } from '../../../core/review/reviewService';
import type { SubjectHintResult } from '../../../core/types';
import { LIMITS } from '../../../config/limits';
import { RULE_DEFAULTS } from '../../../config/defaults';
import { TEXT_SEPARATORS } from '../../../config/strings/common';
import { CHECK_ITEM_LABELS, CHECK_REASON_TEXT } from '../../../config/strings/checks';
import { REVIEW_API_PATHS, REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import { STATUS_LABELS } from '../../../config/strings/status';
import { SUBJECT_HINT_STRINGS, SUBJECT_KIND_LABELS } from '../../../config/strings/subjectHint';
import { ApiClient } from '../apiClient';

/** 投稿の表示の共通の部分（画像・マス・撮影月・地点名・説明文）。 */
export interface SubmissionCardView {
  readonly id: string;
  readonly imageUrl: string;
  readonly cellLabel: string;
  readonly shotMonthLabel: string;
  readonly spotName: string;
  readonly caption: string;
}

/** 要確認の理由の 1 件（項目の名前・理由・修正方法）。 */
export interface CheckReasonView {
  readonly item: string;
  readonly label: string;
  readonly message: string;
  readonly fix: string;
}

/** 被写体の推定（補助）の表示。確信度が下限より低いときは uncertain を真にします。 */
export type SubjectView =
  | { readonly status: 'none'; readonly message: string }
  | {
      readonly status: 'estimated';
      readonly kindLabel: string;
      readonly confidenceLabel: string;
      readonly uncertain: boolean;
      readonly uncertainMessage: string | null;
    };

/** 重複候補の 1 件。待ちの投稿か採用済みの投稿のどちらか。 */
export interface DuplicateView extends SubmissionCardView {
  readonly statusLabel: string;
}

/** 確認キューの 1 件。 */
export interface ReviewItemView extends SubmissionCardView {
  readonly checks: readonly CheckReasonView[];
  readonly subject: SubjectView;
  readonly duplicates: readonly DuplicateView[];
}

/** 採用済みの 1 件（取り消しの対象）。 */
export interface AcceptedItemView extends SubmissionCardView {
  readonly overQuota: boolean;
}

export interface ReviewScreenView {
  readonly items: readonly ReviewItemView[];
  readonly accepted: readonly AcceptedItemView[];
}

/** 差し戻し・取り消しの要求の本文。 */
export interface ReturnRequestBody {
  readonly reasonCode: ReturnReasonCode;
  readonly freeText: string;
  readonly resubmittable: boolean;
}

/** 差し戻しの入力（画面の選択の状態）。未選択は null。 */
export interface ReturnFormInput {
  readonly reasonCode: string | null;
  readonly freeText: string;
  readonly resubmittable: boolean | null;
}

export type ReturnFormResult = { readonly ok: true; readonly request: ReturnRequestBody } | { readonly ok: false; readonly message: string };

/** 採用・差し戻し・取り消しの応答（画面が使う部分だけ）。 */
export interface ReviewActionResponse {
  readonly id: string;
  readonly status: string;
  readonly overQuota: boolean;
}

/** 確認キューの API の応答を、画面の表示の形に組み立てます。対応が取れないときは、代わりの値を作らず例外にします。 */
export class ReviewViewBuilder {
  /** マスの ID から「区分値・季節」の表示名を作ります。 */
  static cellLabels(
    campaign: Pick<CampaignResponse, 'areas' | 'periods'>,
    coverage: Pick<CoverageResponse, 'cells'>,
  ): Map<string, string> {
    const areaLabelById = new Map(campaign.areas.map((area) => [area.id, area.label]));
    const periodLabelById = new Map(campaign.periods.map((period) => [period.id, period.label]));
    const labels = new Map<string, string>();
    for (const cell of coverage.cells) {
      const areaLabel = areaLabelById.get(cell.areaId);
      const periodLabel = periodLabelById.get(cell.periodId);
      if (areaLabel === undefined || periodLabel === undefined) {
        throw new Error(REVIEW_QUEUE_STRINGS.viewMismatch);
      }
      labels.set(cell.cellId, `${areaLabel}${TEXT_SEPARATORS.compound}${periodLabel}`);
    }
    return labels;
  }

  build(queue: ReviewQueueView, cellLabels: ReadonlyMap<string, string>): ReviewScreenView {
    const pendingById = new Map(queue.items.map((item) => [item.id, item]));
    const acceptedById = new Map(queue.accepted.map((entry) => [entry.id, entry]));
    const items = queue.items.map((entry) => ({
      ...this.card(entry, cellLabels),
      checks: entry.checks.map((check) => this.checkOf(check.item, check.reasonCode)),
      subject: this.subjectOf(entry.subject),
      duplicates: entry.candidateIds.map((candidateId) => {
        const pending = pendingById.get(candidateId);
        if (pending !== undefined) {
          return { ...this.card(pending, cellLabels), statusLabel: REVIEW_QUEUE_STRINGS.duplicatePending };
        }
        const accepted = acceptedById.get(candidateId);
        if (accepted !== undefined) {
          return { ...this.card(accepted, cellLabels), statusLabel: STATUS_LABELS.accepted };
        }
        throw new Error(REVIEW_QUEUE_STRINGS.viewMismatch);
      }),
    }));
    const accepted = queue.accepted.map((entry) => ({ ...this.card(entry, cellLabels), overQuota: entry.overQuota }));
    return { items, accepted };
  }

  private card(entry: Pick<AcceptedEntry, 'id' | 'cellId' | 'shotMonth' | 'spotName' | 'caption'>, cellLabels: ReadonlyMap<string, string>): SubmissionCardView {
    const cellLabel = cellLabels.get(entry.cellId);
    if (cellLabel === undefined) {
      throw new Error(REVIEW_QUEUE_STRINGS.viewMismatch);
    }
    return {
      id: entry.id,
      imageUrl: REVIEW_API_PATHS.image(entry.id),
      cellLabel,
      shotMonthLabel: REVIEW_QUEUE_STRINGS.monthLabel(entry.shotMonth),
      spotName: entry.spotName === '' ? REVIEW_QUEUE_STRINGS.emptySpot : entry.spotName,
      caption: entry.caption === '' ? REVIEW_QUEUE_STRINGS.emptyCaption : entry.caption,
    };
  }

  private checkOf(item: string, reasonCode: string): CheckReasonView {
    if (!Object.hasOwn(CHECK_ITEM_LABELS, item) || !Object.hasOwn(CHECK_REASON_TEXT, reasonCode)) {
      throw new Error(REVIEW_QUEUE_STRINGS.viewMismatch);
    }
    const text = CHECK_REASON_TEXT[reasonCode as keyof typeof CHECK_REASON_TEXT];
    return {
      item,
      label: CHECK_ITEM_LABELS[item as keyof typeof CHECK_ITEM_LABELS],
      message: text.message,
      fix: text.fix,
    };
  }

  private subjectOf(subject: SubjectHintResult): SubjectView {
    if (subject.status === 'none') {
      return { status: 'none', message: SUBJECT_HINT_STRINGS.noneMessage };
    }
    const uncertain = subject.confidence < RULE_DEFAULTS.classifyConfidenceMin;
    return {
      status: 'estimated',
      kindLabel: SUBJECT_KIND_LABELS[subject.kind],
      confidenceLabel: `${REVIEW_QUEUE_STRINGS.subjectConfidencePrefix}${subject.confidence.toFixed(2)}`,
      uncertain,
      uncertainMessage: uncertain ? SUBJECT_HINT_STRINGS.uncertainMessage : null,
    };
  }
}

/** 差し戻し・取り消しの入力を検証します。最初に見つかった誤りの文言を返します（画面の文言は strings から）。 */
export class ReturnFormValidator {
  validate(input: ReturnFormInput): ReturnFormResult {
    const reasonCode = (RETURN_REASON_CODES as readonly string[]).find((code) => code === input.reasonCode);
    if (reasonCode === undefined) {
      return { ok: false, message: REVIEW_QUEUE_STRINGS.reasonMissing };
    }
    const freeText = input.freeText.trim();
    if (reasonCode === 'other' && freeText === '') {
      return { ok: false, message: REVIEW_QUEUE_STRINGS.freeTextMissing };
    }
    if ([...freeText].length > LIMITS.returnReasonMaxChars) {
      return { ok: false, message: REVIEW_QUEUE_STRINGS.freeTextTooLong(LIMITS.returnReasonMaxChars) };
    }
    if (input.resubmittable === null) {
      return { ok: false, message: REVIEW_QUEUE_STRINGS.resubmittableMissing };
    }
    return {
      ok: true,
      request: { reasonCode: reasonCode as ReturnReasonCode, freeText, resubmittable: input.resubmittable },
    };
  }
}

/** 確認キューの API を呼びます。同一オリジンの /api/ だけを使います。 */
export class ReviewApi {
  constructor(private readonly client: ApiClient = new ApiClient()) {}

  loadQueue(): Promise<ReviewQueueView> {
    return this.client.get<ReviewQueueView>(REVIEW_API_PATHS.queue);
  }

  async loadCellLabels(): Promise<Map<string, string>> {
    const campaign = await this.client.get<CampaignResponse>(REVIEW_API_PATHS.campaign);
    const coverage = await this.client.get<CoverageResponse>(REVIEW_API_PATHS.coverage);
    return ReviewViewBuilder.cellLabels(campaign, coverage);
  }

  /** 採用。枠を超えるときは、確認の印（confirmOverQuota）を付けて送ります。省略は false です。 */
  accept(submissionId: string, confirmOverQuota: boolean): Promise<ReviewActionResponse> {
    const body = confirmOverQuota ? { confirmOverQuota: true } : {};
    return this.client.post<ReviewActionResponse>(REVIEW_API_PATHS.action(submissionId, 'accept'), body);
  }

  returnSubmission(submissionId: string, request: ReturnRequestBody): Promise<ReviewActionResponse> {
    return this.client.post<ReviewActionResponse>(REVIEW_API_PATHS.action(submissionId, 'return'), request);
  }

  revoke(submissionId: string, request: ReturnRequestBody): Promise<ReviewActionResponse> {
    return this.client.post<ReviewActionResponse>(REVIEW_API_PATHS.action(submissionId, 'revoke'), request);
  }
}
