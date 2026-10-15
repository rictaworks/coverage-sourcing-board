import type { SubmissionStatus } from '../../core/types';

/** 投稿の行（審査の操作に使う列だけ）。 */
export interface SubmissionRow {
  readonly id: string;
  readonly cellId: string;
  readonly status: SubmissionStatus;
  readonly overQuota: boolean;
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
}

/** マスの文脈（区分値の表示名・期間の月・必要数）。 */
export interface CellContextRow {
  readonly areaLabel: string;
  readonly months: readonly number[];
  readonly required: number;
}

/** 確認キュー・一覧の元になる投稿の行（候補の比較に使う列を含む）。 */
export interface QueueRow {
  readonly id: string;
  readonly cellId: string;
  readonly status: SubmissionStatus;
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
  readonly overQuota: boolean;
  readonly phash: string;
  readonly areaLabel: string;
  readonly months: readonly number[];
}

/** 判定結果の行（項目ごと）。 */
export interface CheckRow {
  readonly submissionId: string;
  readonly item: string;
  readonly verdict: string;
  readonly reason: string;
  readonly confidence: number | null;
  readonly model: string | null;
}

/** 自分の投稿の行（review を左結合したもの）。 */
export interface MineRow {
  readonly id: string;
  readonly cellId: string;
  readonly status: SubmissionStatus;
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
  readonly overQuota: boolean;
  readonly createdAt: string;
  readonly decision: string | null;
  readonly reason: string | null;
  readonly resubmittable: number | null;
}

/** 審査の操作（採用・差し戻し・取り消し）の 1 回分の書き込み。 */
export interface TransitionWrite {
  readonly reviewId: string;
  readonly submissionId: string;
  readonly from: SubmissionStatus;
  readonly decision: 'accept' | 'return' | 'revoke';
  readonly reason: string | null;
  readonly resubmittable: boolean | null;
  /** 採用のときだけ使う。true なら、必要数を超えても採用する（確認の印つき）。 */
  readonly overQuota: boolean;
}

/** reviewed_at に入れる、JST の現在時刻（テーブルの既定値と同じ式）。 */
const NOW_JST = "strftime('%Y-%m-%dT%H:%M:%S+09:00', 'now', '+9 hours')";

/**
 * 最終確認の行の読み書き（review・submission・check_result）。
 * すべてのクエリは session_id を条件に含みます（他のセッションの投稿は見つからない扱い）。SQL はバインド変数だけで組み立てます。
 * 状態の変更は、review の行と submission の行を 1 回の batch で書きます。条件（from の状態・枠）は、書き込みの SQL の中で確かめます。
 */
export class ReviewRepo {
  constructor(private readonly db: D1Database) {}

  async readSubmission(sessionHash: string, submissionId: string): Promise<SubmissionRow | null> {
    const row = await this.db
      .prepare(
        `SELECT s.id, s.cell_id, s.status, s.over_quota, s.shot_month, s.spot_name, s.caption
         FROM submission s WHERE s.session_id = ? AND s.id = ?`,
      )
      .bind(sessionHash, submissionId)
      .first<{ id: string; cell_id: string; status: SubmissionStatus; over_quota: number; shot_month: number; spot_name: string; caption: string }>();
    if (row === null) {
      return null;
    }
    return {
      id: row.id,
      cellId: row.cell_id,
      status: row.status,
      overQuota: row.over_quota === 1,
      shotMonth: row.shot_month,
      spotName: row.spot_name,
      caption: row.caption,
    };
  }

  /** マスの文脈。マスが無ければ null。 */
  async readCellContext(sessionHash: string, cellId: string): Promise<CellContextRow | null> {
    const row = await this.db
      .prepare(
        `SELECT area.label AS area_label, period.months AS months, cell.required AS required
         FROM cell JOIN area ON area.id = cell.area_id JOIN period ON period.id = cell.period_id
         WHERE cell.session_id = ? AND cell.id = ?`,
      )
      .bind(sessionHash, cellId)
      .first<{ area_label: string; months: string; required: number }>();
    if (row === null) {
      return null;
    }
    return { areaLabel: row.area_label, months: JSON.parse(row.months) as number[], required: row.required };
  }

  /** 確認待ち（pending_review）の投稿。作成の順。 */
  async listPending(sessionHash: string): Promise<SubmissionRow[]> {
    const result = await this.db
      .prepare(
        `SELECT id, cell_id, status, over_quota, shot_month, spot_name, caption FROM submission
         WHERE session_id = ? AND status = 'pending_review' ORDER BY created_at, id`,
      )
      .bind(sessionHash)
      .all<{ id: string; cell_id: string; status: SubmissionStatus; over_quota: number; shot_month: number; spot_name: string; caption: string }>();
    return result.results.map((row) => ({
      id: row.id,
      cellId: row.cell_id,
      status: row.status,
      overQuota: row.over_quota === 1,
      shotMonth: row.shot_month,
      spotName: row.spot_name,
      caption: row.caption,
    }));
  }

  /** 採用済みの投稿（取り消しの一覧）。作成の順。 */
  async listAccepted(sessionHash: string): Promise<SubmissionRow[]> {
    const result = await this.db
      .prepare(
        `SELECT id, cell_id, status, over_quota, shot_month, spot_name, caption FROM submission
         WHERE session_id = ? AND status = 'accepted' ORDER BY created_at, id`,
      )
      .bind(sessionHash)
      .all<{ id: string; cell_id: string; status: SubmissionStatus; over_quota: number; shot_month: number; spot_name: string; caption: string }>();
    return result.results.map((row) => ({
      id: row.id,
      cellId: row.cell_id,
      status: row.status,
      overQuota: row.over_quota === 1,
      shotMonth: row.shot_month,
      spotName: row.spot_name,
      caption: row.caption,
    }));
  }

  /** 候補の比較に使う投稿（確認待ちと採用済み。区分値と期間の月を含む）。 */
  async listCandidateRows(sessionHash: string): Promise<QueueRow[]> {
    const result = await this.db
      .prepare(
        `SELECT s.id, s.cell_id, s.status, s.over_quota, s.shot_month, s.spot_name, s.caption, s.phash,
                area.label AS area_label, period.months AS months
         FROM submission s
         JOIN cell c ON c.id = s.cell_id AND c.session_id = s.session_id
         JOIN area ON area.id = c.area_id
         JOIN period ON period.id = c.period_id
         WHERE s.session_id = ? AND s.status IN ('pending_review', 'accepted')
         ORDER BY s.created_at, s.id`,
      )
      .bind(sessionHash)
      .all<{
        id: string;
        cell_id: string;
        status: SubmissionStatus;
        over_quota: number;
        shot_month: number;
        spot_name: string;
        caption: string;
        phash: string;
        area_label: string;
        months: string;
      }>();
    return result.results.map((row) => ({
      id: row.id,
      cellId: row.cell_id,
      status: row.status,
      shotMonth: row.shot_month,
      spotName: row.spot_name,
      caption: row.caption,
      overQuota: row.over_quota === 1,
      phash: row.phash,
      areaLabel: row.area_label,
      months: JSON.parse(row.months) as number[],
    }));
  }

  /** 判定結果の行（このセッションの投稿だけ）。 */
  async listCheckRows(sessionHash: string): Promise<CheckRow[]> {
    const result = await this.db
      .prepare(
        `SELECT submission_id, item, verdict, reason, confidence, model FROM check_result
         WHERE session_id = ? ORDER BY rowid`,
      )
      .bind(sessionHash)
      .all<{ submission_id: string; item: string; verdict: string; reason: string; confidence: number | null; model: string | null }>();
    return result.results.map((row) => ({
      submissionId: row.submission_id,
      item: row.item,
      verdict: row.verdict,
      reason: row.reason,
      confidence: row.confidence,
      model: row.model,
    }));
  }

  /** 自分の投稿の一覧（確認中の行は含めない）。作成の順。 */
  async listMine(sessionHash: string): Promise<MineRow[]> {
    const result = await this.db
      .prepare(
        `SELECT s.id, s.cell_id, s.status, s.over_quota, s.shot_month, s.spot_name, s.caption, s.created_at,
                r.decision, r.reason, r.resubmittable
         FROM submission s
         LEFT JOIN review r ON r.submission_id = s.id AND r.session_id = s.session_id
         WHERE s.session_id = ? AND s.status <> 'checking'
         ORDER BY s.created_at, s.id`,
      )
      .bind(sessionHash)
      .all<{
        id: string;
        cell_id: string;
        status: SubmissionStatus;
        over_quota: number;
        shot_month: number;
        spot_name: string;
        caption: string;
        created_at: string;
        decision: string | null;
        reason: string | null;
        resubmittable: number | null;
      }>();
    return result.results.map((row) => ({
      id: row.id,
      cellId: row.cell_id,
      status: row.status,
      overQuota: row.over_quota === 1,
      shotMonth: row.shot_month,
      spotName: row.spot_name,
      caption: row.caption,
      createdAt: row.created_at,
      decision: row.decision,
      reason: row.reason,
      resubmittable: row.resubmittable,
    }));
  }

  /** 画像の BLOB（このセッションの投稿だけ）。無ければ null。 */
  async readImage(sessionHash: string, submissionId: string): Promise<Uint8Array | null> {
    const row = await this.db
      .prepare('SELECT image FROM submission WHERE session_id = ? AND id = ?')
      .bind(sessionHash, submissionId)
      .first<{ image: ArrayBuffer | readonly number[] }>();
    return row === null ? null : new Uint8Array(row.image);
  }

  /**
   * 採用の書き込み（review と submission を 1 回の batch で）。
   * 条件：pending_review であること。確認の印が無いときは、採用数が必要数未満であること。どちらも SQL の中で確かめる。
   * 戻り値は submission の更新の件数（1 なら採用した）。
   */
  async accept(sessionHash: string, write: TransitionWrite): Promise<number> {
    const overQuota = write.overQuota ? 1 : 0;
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO review (id, session_id, submission_id, decision, reason, resubmittable)
           SELECT ?, s.session_id, s.id, 'accept', NULL, NULL FROM submission s
           WHERE s.id = ? AND s.session_id = ? AND s.status = 'pending_review'
             AND (? = 1 OR (SELECT COUNT(*) FROM submission a WHERE a.session_id = s.session_id AND a.cell_id = s.cell_id AND a.status = 'accepted')
                  < (SELECT c.required FROM cell c WHERE c.id = s.cell_id AND c.session_id = s.session_id))
           ON CONFLICT(submission_id) DO UPDATE SET decision = 'accept', reason = NULL, resubmittable = NULL, reviewed_at = ${NOW_JST}`,
        )
        .bind(write.reviewId, write.submissionId, sessionHash, overQuota),
      this.db
        .prepare(
          `UPDATE submission SET status = 'accepted', over_quota = ?
           WHERE id = ? AND session_id = ? AND status = 'pending_review'
             AND (? = 1 OR (SELECT COUNT(*) FROM submission a WHERE a.session_id = submission.session_id AND a.cell_id = submission.cell_id AND a.status = 'accepted')
                  < (SELECT c.required FROM cell c WHERE c.id = submission.cell_id AND c.session_id = submission.session_id))`,
        )
        .bind(overQuota, write.submissionId, sessionHash, overQuota),
    ]);
    return results[1]?.meta.changes ?? 0;
  }

  /**
   * 差し戻し・取り消しの書き込み（review と submission を 1 回の batch で）。
   * 条件：submission が from の状態であること（SQL の中で確かめる）。戻り値は submission の更新の件数。
   */
  async transition(sessionHash: string, write: TransitionWrite): Promise<number> {
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO review (id, session_id, submission_id, decision, reason, resubmittable)
           SELECT ?, s.session_id, s.id, ?, ?, ? FROM submission s
           WHERE s.id = ? AND s.session_id = ? AND s.status = ?
           ON CONFLICT(submission_id) DO UPDATE SET decision = excluded.decision, reason = excluded.reason,
             resubmittable = excluded.resubmittable, reviewed_at = ${NOW_JST}`,
        )
        .bind(
          write.reviewId,
          write.decision,
          write.reason,
          write.resubmittable === null ? null : write.resubmittable ? 1 : 0,
          write.submissionId,
          sessionHash,
          write.from,
        ),
      this.db
        .prepare(`UPDATE submission SET status = 'returned' WHERE id = ? AND session_id = ? AND status = ?`)
        .bind(write.submissionId, sessionHash, write.from),
    ]);
    return results[1]?.meta.changes ?? 0;
  }
}
