import type { CheckItem, CheckResult, SubjectHintResult, Verdict } from '../../core/types';
import { SUBMISSION_CONFIG } from '../../config/submission';
import { SUBMISSION_DEV_MESSAGES } from '../../config/strings/submission';

/** 重複の判定に使う、保存済みの投稿の情報（同じセッションだけを読む）。 */
export interface SavedSubmissionRow {
  readonly id: string;
  readonly cellId: string;
  readonly areaLabel: string;
  readonly shotMonth: number;
  readonly spotName: string;
  readonly phash: string;
}

/** マスの状況（区分値の名前と、必要数・採用数）。マスが無い（他のセッションを含む）ときは null。 */
export interface CellContext {
  readonly areaLabel: string;
  readonly required: number;
  readonly accepted: number;
  /** マスの期間の月（1〜12）。撮影月がここに含まれなければ、季節が合わない。 */
  readonly periodMonths: readonly number[];
}

/** 新しい投稿の保存内容（画像は検査済みのバイト列）。位置情報と機種情報は含めない。 */
export interface NewSubmissionRecord {
  readonly id: string;
  readonly sessionHash: string;
  readonly cellId: string;
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
  readonly image: Uint8Array;
  readonly phash: string;
  readonly declaredOriginal: boolean;
  readonly consent: boolean;
  readonly resubmittedFrom: string | null;
}

/** 保存する判定結果の 1 行（check_result）。被写体の推定は verdict が info。 */
export interface StoredCheck {
  readonly item: CheckItem;
  readonly verdict: Verdict;
  readonly reason: string;
  readonly confidence: number | null;
  readonly model: string | null;
}

/** 保存中の投稿の総数（全セッション。総数の確認だけは全体を数える）。 */
const COUNT_ALL_SQL = 'SELECT COUNT(*) AS n FROM submission';

/** このセッションの、指定の時刻以降の件数（1 日の上限の数え方）。 */
const COUNT_SESSION_SINCE_SQL = 'SELECT COUNT(*) AS n FROM submission WHERE session_id = ? AND created_at >= ?';

/** 重複の比較の対象（保存済みで、確認待ち・採用・差し戻しの投稿。確認中は保存しない）。 */
const SAVED_FOR_DUPLICATE_SQL = `
  SELECT s.id, s.cell_id, a.label AS area_label, s.shot_month, s.spot_name, s.phash
  FROM submission s
  JOIN cell c ON c.id = s.cell_id
  JOIN area a ON a.id = c.area_id
  WHERE s.session_id = ? AND s.status IN ('pending_review', 'accepted', 'returned') AND s.id <> ?
  ORDER BY s.rowid`;

/**
 * 投稿の行（submission・check_result）の読み書き。すべての利用者のクエリは session_id で絞る（総数の確認を除く）。
 * SQL はバインド変数だけで組み立てる（OWASP A03）。
 */
export class SubmissionRepo {
  constructor(private readonly db: D1Database) {}

  /** 保存中の投稿の総数（全セッション）。 */
  async countAll(): Promise<number> {
    const row = await this.db.prepare(COUNT_ALL_SQL).first<{ n: number }>();
    if (row === null) {
      throw new Error(SUBMISSION_DEV_MESSAGES.errorCountMissing);
    }
    return row.n;
  }

  /** このセッションで、指定の時刻（JST の文字列）以降に保存した投稿の件数。 */
  async countSessionSince(sessionHash: string, sinceJst: string): Promise<number> {
    const row = await this.db.prepare(COUNT_SESSION_SINCE_SQL).bind(sessionHash, sinceJst).first<{ n: number }>();
    if (row === null) {
      throw new Error(SUBMISSION_DEV_MESSAGES.errorCountMissing);
    }
    return row.n;
  }

  /** マス（このセッションの行だけ）と、区分値の名前、採用数。 */
  async findCellContext(sessionHash: string, cellId: string): Promise<CellContext | null> {
    const row = await this.db
      .prepare(
        `SELECT a.label AS area_label, c.required AS required, p.months AS months,
           (SELECT COUNT(*) FROM submission s WHERE s.session_id = c.session_id AND s.cell_id = c.id AND s.status = 'accepted') AS accepted
         FROM cell c JOIN area a ON a.id = c.area_id JOIN period p ON p.id = c.period_id
         WHERE c.session_id = ? AND c.id = ?`,
      )
      .bind(sessionHash, cellId)
      .first<{ area_label: string; required: number; accepted: number; months: string }>();
    return row === null
      ? null
      : { areaLabel: row.area_label, required: row.required, accepted: row.accepted, periodMonths: JSON.parse(row.months) as number[] };
  }

  /** 再投稿の元が、このセッションの「返された」投稿で、再投稿可能なら true。 */
  async isResubmittable(sessionHash: string, submissionId: string): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT s.status AS status, r.resubmittable AS resubmittable
         FROM submission s LEFT JOIN review r ON r.submission_id = s.id
         WHERE s.session_id = ? AND s.id = ?`,
      )
      .bind(sessionHash, submissionId)
      .first<{ status: string; resubmittable: number | null }>();
    return row !== null && row.status === 'returned' && row.resubmittable === 1;
  }

  /** 重複の比較の対象（このセッションの保存済みの投稿。除外する ID を 1 件指定できる）。 */
  async listForDuplicate(sessionHash: string, excludeId: string | null): Promise<SavedSubmissionRow[]> {
    const result = await this.db
      .prepare(SAVED_FOR_DUPLICATE_SQL)
      .bind(sessionHash, excludeId ?? '')
      .all<{ id: string; cell_id: string; area_label: string; shot_month: number; spot_name: string; phash: string }>();
    return result.results.map((row) => ({
      id: row.id,
      cellId: row.cell_id,
      areaLabel: row.area_label,
      shotMonth: row.shot_month,
      spotName: row.spot_name,
      phash: row.phash,
    }));
  }

  /**
   * 上限の判定と投稿の挿入を、1 つの SQL 文で行う（並行の要求で上限を超えないため）。
   * 保存中の総数と、このセッションの 1 日の件数が、どちらも上限未満のときだけ挿入する。
   * 判定結果の行は、同じ batch の中で、投稿が挿入されたときだけ挿入する。
   * 挿入されたら true、上限に当たって挿入されなかったら false を返す。
   */
  async reserveSubmission(
    record: NewSubmissionRecord,
    checks: readonly StoredCheck[],
    limits: { readonly sinceJst: string; readonly maxTotal: number; readonly maxPerSession: number },
  ): Promise<boolean> {
    const insert = this.db
      .prepare(
        `INSERT INTO submission (id, session_id, cell_id, shot_month, spot_name, caption, image, phash, status,
           over_quota, declared_original, consent, resubmitted_from)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', 0, ?, ?, ?
         WHERE (SELECT COUNT(*) FROM submission) < ?
           AND (SELECT COUNT(*) FROM submission WHERE session_id = ? AND created_at >= ?) < ?`,
      )
      .bind(
        record.id,
        record.sessionHash,
        record.cellId,
        record.shotMonth,
        record.spotName,
        record.caption,
        record.image,
        record.phash,
        record.declaredOriginal ? 1 : 0,
        record.consent ? 1 : 0,
        record.resubmittedFrom,
        limits.maxTotal,
        record.sessionHash,
        limits.sinceJst,
        limits.maxPerSession,
      );
    const rows = checks.map((check) => this.checkStatement(record.id, record.sessionHash, check, true));
    const results = await this.db.batch([insert, ...rows]);
    return (results[0]?.meta.changes ?? 0) > 0;
  }

  /** 保存済みの投稿に、判定結果を 1 行足す（被写体の推定は、挿入の後に呼ぶため、ここで足す）。 */
  async addCheck(sessionHash: string, submissionId: string, check: StoredCheck): Promise<void> {
    // 03:00 の全削除と重なると、投稿の行が無く外部キーで失敗する。存在を保証したうえで挿入し、無ければ明示的な内部エラーにする。
    const result = await this.checkStatement(submissionId, sessionHash, check, true).run();
    if ((result.meta.changes ?? 0) === 0) {
      throw new Error(SUBMISSION_DEV_MESSAGES.errorSubmissionMissing);
    }
  }

  private checkStatement(submissionId: string, sessionHash: string, check: StoredCheck, onlyIfSubmissionExists: boolean): D1PreparedStatement {
    const guard = onlyIfSubmissionExists ? ' WHERE EXISTS (SELECT 1 FROM submission WHERE id = ? AND session_id = ?)' : '';
    const binds: unknown[] = [crypto.randomUUID(), sessionHash, submissionId, check.item, check.verdict, check.reason, check.confidence, check.model];
    if (onlyIfSubmissionExists) {
      binds.push(submissionId, sessionHash);
    }
    return this.db
      .prepare(`INSERT INTO check_result (id, session_id, submission_id, item, verdict, reason, confidence, model) SELECT ?, ?, ?, ?, ?, ?, ?, ?${guard}`)
      .bind(...binds);
  }
}

/** 判定結果（ブラウザと Worker の重複）を、保存する行の形に変える。 */
export function toStoredCheck(check: CheckResult): StoredCheck {
  return { item: check.item, verdict: check.verdict, reason: check.reasonCode, confidence: check.confidence ?? null, model: check.model ?? null };
}

/** 被写体の推定の結果を、保存する行の形に変える（推定なしは reason に none を残す）。 */
export function subjectToStoredCheck(result: SubjectHintResult): StoredCheck {
  if (result.status === 'estimated') {
    return { item: 'subject_kind', verdict: 'info', reason: result.kind, confidence: result.confidence, model: result.model };
  }
  return { item: 'subject_kind', verdict: 'info', reason: SUBMISSION_CONFIG.subjectNoneReason, confidence: null, model: null };
}
