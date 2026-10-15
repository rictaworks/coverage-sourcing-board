import { API_ERROR_MESSAGES } from '../../config/strings/apiErrors';
import { WORKER_STRINGS } from '../../config/strings/worker';
import { REVIEW_DEV_MESSAGES, REVIEW_ERROR_MESSAGES } from '../../config/strings/review';
import { LIMITS } from '../../config/limits';
import { Period } from '../../core/campaign/period';
import type { ApiEndpointName } from '../../core/api/paths';
import type { MySubmissionItem, ReturnInfo } from '../../core/api/contract';
import { ReviewError, ReviewService, type AcceptedEntry, type ReviewQueueEntry, type ReviewQueueView, type ReturnRequest } from '../../core/review/reviewService';
import { DuplicateChecker, type SubmissionForDuplicate } from '../../core/validation/duplicateChecker';
import type { SubmissionStatus } from '../../core/types';
import { type RouteContext, type RouteHandler } from '../http/router';
import type { ApiResponder } from '../http/responses';
import { CampaignRepo } from '../repo/campaignRepo';
import { ReviewRepo, type CheckRow, type MineRow, type QueueRow, type SubmissionRow } from '../repo/reviewRepo';

/** 投稿の ID の形式（新規の ID は UUID。形式が違えば、存在しない扱いの 404 にする）。 */
const SUBMISSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 被写体の推定の判定項目（check_result の item）。 */
const SUBJECT_CHECK_ITEM = 'subject_kind';

/** 画像の応答の型（JPEG だけを保存する。requirements 8）。 */
const IMAGE_CONTENT_TYPE = 'image/jpeg';

/** 要求の本文が、仕様の形に合わないこと（400 invalid_request）。 */
class InvalidBodyError extends Error {}

/** 要求の本文が、上限の大きさを超えること（413 payload_too_large）。 */
class BodyTooLargeError extends Error {}

/** 差し戻し・採用の取り消しの応答（投稿の状態と差し戻しの内容）。 */
export interface ReviewReturnResponse {
  readonly id: string;
  readonly status: SubmissionStatus;
  readonly overQuota: boolean;
  readonly returnInfo: ReturnInfo;
}

/** 採用の応答。 */
export interface ReviewAcceptResponse {
  readonly id: string;
  readonly status: 'accepted';
  readonly overQuota: boolean;
}

/** 自分の投稿の 1 件（契約の MySubmissionItem に、一覧の表示に要る項目を加えたもの）。 */
export interface MySubmissionView extends MySubmissionItem {
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
  readonly overQuota: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > LIMITS.reviewBodyMaxBytes) {
    throw new BodyTooLargeError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidBodyError();
  }
  if (!isRecord(parsed)) {
    throw new InvalidBodyError();
  }
  return parsed;
}

/** 採用の要求。確認の印（confirmOverQuota）は省略できる（省略は false）。値があれば真偽値だけを受け付ける。 */
function parseAcceptBody(body: Record<string, unknown>): boolean {
  if (body.confirmOverQuota === undefined) {
    return false;
  }
  if (typeof body.confirmOverQuota !== 'boolean') {
    throw new InvalidBodyError();
  }
  return body.confirmOverQuota;
}

/** 差し戻し・取り消しの要求の形（値の範囲は ReviewService が見る）。 */
function parseReturnBody(body: Record<string, unknown>): ReturnRequest {
  if (typeof body.reasonCode !== 'string' || typeof body.freeText !== 'string' || typeof body.resubmittable !== 'boolean') {
    throw new InvalidBodyError();
  }
  return { reasonCode: body.reasonCode, freeText: body.freeText, resubmittable: body.resubmittable };
}

function requireSession(context: RouteContext): string {
  if (context.sessionIdHash === null) {
    throw new Error(WORKER_STRINGS.errorSessionMissing);
  }
  return context.sessionIdHash;
}

/** 経路の ID を取り出す。形式が違えば null（存在しない扱い）。 */
function submissionIdOf(context: RouteContext): string | null {
  const id = context.params.id;
  return id !== undefined && SUBMISSION_ID_PATTERN.test(id) ? id : null;
}

function newReviewId(): string {
  return crypto.randomUUID();
}

function toDuplicateInput(sessionHash: string, row: QueueRow): SubmissionForDuplicate {
  return {
    id: row.id,
    sessionId: sessionHash,
    municipality: row.areaLabel,
    season: Period.fromMonth(row.months[0]).season,
    spotName: row.spotName,
    phash: row.phash,
  };
}

function toAcceptedEntry(row: SubmissionRow): AcceptedEntry {
  return { id: row.id, cellId: row.cellId, shotMonth: row.shotMonth, spotName: row.spotName, caption: row.caption, overQuota: row.overQuota };
}

/** 差し戻しの情報（reason 列の JSON と、resubmittable 列）から、応答の形を作る。差し戻しの行が無ければ例外（保存の不整合）。 */
function returnInfoOf(row: MineRow): ReturnInfo | null {
  if (row.status !== 'returned') {
    return null;
  }
  if (row.reason === null || row.resubmittable === null) {
    throw new Error(REVIEW_DEV_MESSAGES.errorStoredReasonInvalid);
  }
  const stored = ReviewService.decodeReason(row.reason);
  return { reasonCode: stored.reasonCode, freeText: stored.freeText, resubmittable: row.resubmittable === 1 };
}

/**
 * 最終確認と投稿の参照の経路（C5）。
 * すべての経路は、セッションのデータだけを扱います（session_id で絞る。他のセッションの ID は 404）。
 * 採用・差し戻し・取り消しは、判定を ReviewService（純粋）で行い、書き込みは ReviewRepo の batch で行います。
 */
class ReviewRoutes {
  private readonly service = new ReviewService();

  constructor(private readonly responder: ApiResponder) {}

  async queue(context: RouteContext): Promise<Response> {
    try {
      const session = requireSession(context);
      const view = await this.buildQueue(session, context.env.DB);
      return this.responder.json(view, 200);
    } catch (error) {
      return this.failure(error);
    }
  }

  async accept(context: RouteContext): Promise<Response> {
    try {
      const session = requireSession(context);
      const body = await readJsonObject(context.request);
      const id = submissionIdOf(context);
      if (id === null) {
        return this.notFound();
      }
      const confirmOverQuota = parseAcceptBody(body);
      const reviews = new ReviewRepo(context.env.DB);
      const submission = await reviews.readSubmission(session, id);
      if (submission === null) {
        return this.notFound();
      }
      const cell = await reviews.readCellContext(session, submission.cellId);
      if (cell === null) {
        throw new Error(REVIEW_DEV_MESSAGES.errorCellMissing);
      }
      const rule = await new CampaignRepo(context.env.DB).readAcceptRule(session);
      if (rule === null) {
        throw new Error(REVIEW_DEV_MESSAGES.errorRuleMissing);
      }
      const accepted = await new CampaignRepo(context.env.DB).countAcceptedInCell(session, submission.cellId);
      const open = this.service.isCellOpen({
        areaLabel: cell.areaLabel,
        season: Period.fromMonth(cell.months[0]).season,
        required: cell.required,
        accepted,
        rule,
      });
      const decision = this.service.accept(submission.status, open, confirmOverQuota);
      const changed = await reviews.accept(session, {
        reviewId: newReviewId(),
        submissionId: id,
        from: 'pending_review',
        decision: 'accept',
        reason: null,
        resubmittable: null,
        overQuota: decision.overQuota,
      });
      if (changed !== 1) {
        return this.invalidState();
      }
      const response: ReviewAcceptResponse = { id, status: decision.status, overQuota: decision.overQuota };
      return this.responder.json(response, 200);
    } catch (error) {
      return this.failure(error);
    }
  }

  async returnSubmission(context: RouteContext): Promise<Response> {
    return this.transition(context, 'return');
  }

  async revoke(context: RouteContext): Promise<Response> {
    return this.transition(context, 'revoke');
  }

  async mine(context: RouteContext): Promise<Response> {
    try {
      const session = requireSession(context);
      const rows = await new ReviewRepo(context.env.DB).listMine(session);
      const items: MySubmissionView[] = rows.map((row) => ({
        id: row.id,
        cellId: row.cellId,
        status: row.status,
        createdAt: row.createdAt,
        returnInfo: returnInfoOf(row),
        shotMonth: row.shotMonth,
        spotName: row.spotName,
        caption: row.caption,
        overQuota: row.overQuota,
      }));
      return this.responder.json({ items }, 200);
    } catch (error) {
      return this.failure(error);
    }
  }

  async image(context: RouteContext): Promise<Response> {
    try {
      const session = requireSession(context);
      const id = submissionIdOf(context);
      if (id === null) {
        return this.notFound();
      }
      const bytes = await new ReviewRepo(context.env.DB).readImage(session, id);
      if (bytes === null) {
        return this.notFound();
      }
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          'content-type': IMAGE_CONTENT_TYPE,
          'content-disposition': 'inline',
          'cache-control': 'private, no-store',
        },
      });
    } catch (error) {
      return this.failure(error);
    }
  }

  /** 差し戻し（pending_review から）と採用の取り消し（accepted から）。どちらも、理由を検証して保存する。 */
  private async transition(context: RouteContext, kind: 'return' | 'revoke'): Promise<Response> {
    try {
      const session = requireSession(context);
      const body = await readJsonObject(context.request);
      const id = submissionIdOf(context);
      if (id === null) {
        return this.notFound();
      }
      const request = parseReturnBody(body);
      const reviews = new ReviewRepo(context.env.DB);
      const submission = await reviews.readSubmission(session, id);
      if (submission === null) {
        return this.notFound();
      }
      const decision =
        kind === 'return' ? this.service.returnSubmission(submission.status, request) : this.service.revoke(submission.status, request);
      const changed = await reviews.transition(session, {
        reviewId: newReviewId(),
        submissionId: id,
        from: submission.status,
        decision: kind,
        reason: ReviewService.encodeReason(decision.returnInfo),
        resubmittable: decision.returnInfo.resubmittable,
        overQuota: false,
      });
      if (changed !== 1) {
        return this.invalidState();
      }
      const response: ReviewReturnResponse = {
        id,
        status: decision.status,
        overQuota: submission.overQuota,
        returnInfo: decision.returnInfo,
      };
      return this.responder.json(response, 200);
    } catch (error) {
      return this.failure(error);
    }
  }

  /** 確認キューと、取り消しのための採用済みの一覧。候補は、同じセッションの確認待ち・採用済みの投稿だけを比べます。 */
  private async buildQueue(session: string, db: D1Database): Promise<ReviewQueueView> {
    const reviews = new ReviewRepo(db);
    const pending = await reviews.listPending(session);
    const accepted = (await reviews.listAccepted(session)).map(toAcceptedEntry);
    if (pending.length === 0) {
      return { items: [], accepted };
    }
    const rule = await new CampaignRepo(db).readAcceptRule(session);
    if (rule === null) {
      throw new Error(REVIEW_DEV_MESSAGES.errorRuleMissing);
    }
    const rows = await reviews.listCandidateRows(session);
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const candidates = rows.map((row) => toDuplicateInput(session, row));
    const checker = new DuplicateChecker(rule);
    const checksBySubmission = this.groupChecks(await reviews.listCheckRows(session));
    const items: ReviewQueueEntry[] = pending.map((submission) => {
      const row = rowById.get(submission.id);
      if (row === undefined) {
        throw new Error(REVIEW_DEV_MESSAGES.errorCellMissing);
      }
      const checkRows = checksBySubmission.get(submission.id) ?? [];
      return {
        id: submission.id,
        cellId: submission.cellId,
        shotMonth: submission.shotMonth,
        spotName: submission.spotName,
        caption: submission.caption,
        checks: checkRows
          .filter((check) => check.item !== SUBJECT_CHECK_ITEM && check.verdict === 'review')
          .map((check) => ({ item: check.item, verdict: 'review' as const, reasonCode: check.reason })),
        subject: ReviewService.subjectFrom(checkRows.find((check) => check.item === SUBJECT_CHECK_ITEM) ?? null),
        candidateIds: checker.check(toDuplicateInput(session, row), candidates).candidateIds,
      };
    });
    return { items, accepted };
  }

  private groupChecks(rows: readonly CheckRow[]): Map<string, CheckRow[]> {
    const grouped = new Map<string, CheckRow[]>();
    for (const row of rows) {
      const list = grouped.get(row.submissionId) ?? [];
      list.push(row);
      grouped.set(row.submissionId, list);
    }
    return grouped;
  }

  private notFound(): Response {
    return this.responder.json({ code: 'not_found', message: API_ERROR_MESSAGES.not_found }, 404);
  }

  private invalidState(): Response {
    return this.responder.json({ code: 'invalid_state', message: API_ERROR_MESSAGES.invalid_state }, 409);
  }

  /** 想定の失敗は応答に変える。それ以外の例外は握りつぶさず、基盤の 500 に任せる。 */
  private failure(error: unknown): Response {
    if (error instanceof InvalidBodyError) {
      return this.responder.json({ code: 'invalid_request', message: API_ERROR_MESSAGES.invalid_request }, 400);
    }
    if (error instanceof BodyTooLargeError) {
      return this.responder.json({ code: 'payload_too_large', message: REVIEW_ERROR_MESSAGES.body_too_large }, 413);
    }
    if (error instanceof ReviewError) {
      if (error.code === 'invalid_transition') {
        return this.invalidState();
      }
      if (error.code === 'over_quota_confirmation_required') {
        return this.responder.json({ code: error.code, message: REVIEW_ERROR_MESSAGES.over_quota_confirmation_required }, 409);
      }
      return this.responder.json({ code: 'invalid_request', message: REVIEW_ERROR_MESSAGES[error.code] }, 400);
    }
    throw error;
  }
}

/**
 * 最終確認と投稿の参照の経路（C5）。
 * 投稿の一覧（submissionsMine）と画像（submissionImage）も、この関数で登録する（C1 の 501 を上書きする）。
 * 注意：submission の経路を C3 が実装したら、この 2 件は submissions.ts へ移す（二重の登録を残さない）。
 */
export function reviewHandlers(responder: ApiResponder): Partial<Record<ApiEndpointName, RouteHandler>> {
  const routes = new ReviewRoutes(responder);
  return {
    reviewQueue: (context) => routes.queue(context),
    reviewAccept: (context) => routes.accept(context),
    reviewReturn: (context) => routes.returnSubmission(context),
    reviewRevoke: (context) => routes.revoke(context),
    submissionsMine: (context) => routes.mine(context),
    submissionImage: (context) => routes.image(context),
  };
}

