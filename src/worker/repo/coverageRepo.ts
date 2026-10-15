/** マスごとの件数（採用・確認待ち）の 1 行。cell_id は DB のマスの ID。 */
export interface SubmissionCountRow {
  readonly cellId: string;
  readonly accepted: number;
  readonly pending: number;
}

/**
 * 充足の集計のための読み取り。件数は 1 回のクエリで、このセッションの投稿だけを数える。
 * 数えるのは採用（accepted）と確認待ち（pending_review）だけです（差し戻し・確認中は数えない）。
 */
export class CoverageRepo {
  constructor(private readonly db: D1Database) {}

  async countByCell(sessionHash: string): Promise<SubmissionCountRow[]> {
    const result = await this.db
      .prepare(
        `SELECT cell_id,
           SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
           SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending
         FROM submission
         WHERE session_id = ? AND status IN ('accepted', 'pending_review')
         GROUP BY cell_id`,
      )
      .bind(sessionHash)
      .all<{ cell_id: string; accepted: number; pending: number }>();
    return result.results.map((row) => ({ cellId: row.cell_id, accepted: row.accepted, pending: row.pending }));
  }
}
