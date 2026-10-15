/**
 * Worker とフロントの API 契約（要求と応答の型、エラーと差し戻しのコード）。
 * 外部に依存しない型と定数だけを置く。日本語の文字列は含めない（文言は src/config/strings/ に置く）。
 */
import type { AcceptRule, CheckItem, ReasonCode, SubjectHintResult, SubmissionStatus, Verdict } from '../types';

/** 県のコード（英字）。表示名は src/config/strings/prefectures.ts にある。 */
export const PREFECTURE_CODES = ['tokushima', 'kagawa', 'ehime', 'kochi'] as const;
export type PrefectureCode = (typeof PREFECTURE_CODES)[number];

/** エラーのコード。文言は src/config/strings/apiErrors.ts のキーと一致させる。 */
export const API_ERROR_CODES = [
  'invalid_request',
  'unsupported_image',
  'metadata_not_allowed',
  'trailing_bytes',
  'payload_too_large',
  'declaration_required',
  'rate_limited',
  'daily_limit_reached',
  'storage_paused',
  'cell_closed',
  'submission_rejected',
  'not_found',
  'invalid_state',
  'internal_error',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** エラー応答の本文。message は表示用の文言（src/config/strings/apiErrors.ts）。 */
export interface ApiErrorBody {
  readonly code: ApiErrorCode;
  readonly message: string;
}

/** 即時不合格（submission_rejected）の応答。理由と修正方法の一覧を含む。 */
export interface SubmissionRejectedBody extends ApiErrorBody {
  readonly code: 'submission_rejected';
  readonly reasons: readonly RejectionReason[];
}

export interface RejectionReason {
  readonly item: CheckItem;
  readonly reasonCode: ReasonCode;
}

/** 投稿（multipart/form-data）のフィールド名。 */
export const SUBMISSION_FORM_FIELDS = {
  /** 保存する JPEG（長辺 1,600 px 以下）。 */
  image: 'image',
  /** 一覧用の縮小画像（JPEG）。 */
  thumb: 'thumb',
  /** 投稿の情報（SubmissionMeta の JSON 文字列）。 */
  meta: 'meta',
  /** ハニーポット欄。人は入力せず、入力された場合は拒否する。 */
  honeypot: 'website_url',
} as const;

/** 投稿の情報（meta の JSON）。位置情報と機種情報は含めない。 */
export interface SubmissionMeta {
  readonly cellId: string;
  /** 撮影月（1〜12）。季節は月から導出する。 */
  readonly shotMonth: number;
  /** 地点名（空欄可。空欄なら同一地点の判定を行わない）。 */
  readonly spotName: string;
  /** 説明文（60 字以内）。 */
  readonly caption: string;
  /** オリジナルの写真であることの申告（必須）。 */
  readonly declaredOriginal: boolean;
  /** 掲載・利用への同意（必須）。 */
  readonly consent: boolean;
}

/** 差し戻しの理由のコード（requirements 3.7。表示の文言は仮置き）。 */
export const RETURN_REASON_CODES = [
  'ratio',
  'resolution',
  'shoot_declaration',
  'subject',
  'other',
] as const;
export type ReturnReasonCode = (typeof RETURN_REASON_CODES)[number];

/** 差し戻しの情報。 */
export interface ReturnInfo {
  readonly reasonCode: ReturnReasonCode;
  readonly freeText: string;
  /** 再投稿で対応できるかどうか。 */
  readonly resubmittable: boolean;
}

/** 応答の型（各経路）。 */
export interface HealthResponse {
  readonly status: 'ok';
}

export interface SessionResponse {
  /** 本日の残りの投稿数（セッション単位）。 */
  readonly remainingToday: number;
}

export interface PeriodView {
  readonly id: string;
  readonly label: string;
  readonly months: readonly number[];
}

export interface AreaView {
  readonly id: string;
  readonly prefecture: PrefectureCode;
  readonly label: string;
}

export interface CampaignResponse {
  readonly id: string;
  readonly name: string;
  readonly areas: readonly AreaView[];
  readonly periods: readonly PeriodView[];
  readonly acceptRule: AcceptRule;
}

/** マスごとの必要数（一律または個別）。個別の場合は、マスの ID ごとの値。 */
export type RequiredPerCell =
  | { readonly mode: 'uniform'; readonly value: number }
  | { readonly mode: 'individual'; readonly values: Readonly<Record<string, number>> };

/** PUT /api/campaign の要求。 */
export interface CampaignUpdateRequest {
  readonly name: string;
  readonly requiredPerCell: RequiredPerCell;
}

/** POST /api/campaign/template の要求。 */
export interface TemplateSelectRequest {
  readonly templateId: string;
}

/** POST /api/campaign/areas の要求。 */
export interface CampaignAreasRequest {
  readonly areas: readonly { readonly prefecture: PrefectureCode; readonly label: string }[];
}

export interface CellCoverage {
  readonly cellId: string;
  readonly areaId: string;
  readonly periodId: string;
  readonly accepted: number;
  readonly pendingReview: number;
  readonly required: number;
  /** 採用数が必要数に達したマス（募集終了）。 */
  readonly closed: boolean;
}

export interface CoverageResponse {
  readonly cells: readonly CellCoverage[];
  /** 「いま求めている場所」の順（充足率の低い順）。マスの ID の並び。 */
  readonly priority: readonly string[];
}

/** POST /api/submissions の成功時の応答。 */
export interface SubmissionCreatedResponse {
  readonly id: string;
  readonly status: Extract<SubmissionStatus, 'pending_review'>;
}

export interface MySubmissionItem {
  readonly id: string;
  readonly cellId: string;
  readonly status: SubmissionStatus;
  readonly createdAt: string;
  readonly returnInfo: ReturnInfo | null;
}

export interface MySubmissionsResponse {
  readonly items: readonly MySubmissionItem[];
}

export interface CheckSummary {
  readonly item: CheckItem;
  readonly verdict: Verdict;
  readonly reasonCode: ReasonCode;
}

export interface ReviewQueueItem {
  readonly id: string;
  readonly cellId: string;
  readonly checks: readonly CheckSummary[];
  /** 被写体の推定（補助。根拠にしない）。 */
  readonly subject: SubjectHintResult;
  /** 同じマス内で、地点名が一致する既存の投稿の ID。 */
  readonly spotMatchIds: readonly string[];
}

export interface ReviewQueueResponse {
  readonly items: readonly ReviewQueueItem[];
}

/** POST /api/review/:id/accept の要求。枠を超える採用は overQuota を true にする。 */
export interface AcceptRequest {
  readonly overQuota: boolean;
}

/** 採用・差し戻し・取り消しの応答。 */
export interface ReviewStatusResponse {
  readonly id: string;
  readonly status: SubmissionStatus;
  readonly overQuota: boolean;
}
