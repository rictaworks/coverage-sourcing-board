import type { CounterStore, LedgerKind } from '../../core/ledger/callLedger';

/**
 * DAILY_COUNTER（D1）の保存先。予約は 1 文の INSERT ... ON CONFLICT で、件数が上限未満のときだけ増やす。
 * 同時の要求でも上限を超えないよう、読んでから書く方式は使いません。
 * 行は日次の全削除（C6）の対象にしません（requirements 3.9 は投稿の情報の削除）。
 */
export class DailyCounterRepo implements CounterStore {
  constructor(private readonly db: D1Database) {}

  async reserve(dateUtc: string, kind: LedgerKind, limit: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `INSERT INTO daily_counter (date_utc, kind, count, estimated_usd) VALUES (?1, ?2, 1, 0)
         ON CONFLICT (date_utc, kind) DO UPDATE SET count = count + 1 WHERE daily_counter.count < ?3`,
      )
      .bind(dateUtc, kind, limit)
      .run();
    return result.meta.changes === 1;
  }

  async addEstimatedUsd(dateUtc: string, kind: LedgerKind, usd: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO daily_counter (date_utc, kind, count, estimated_usd) VALUES (?1, ?2, 0, ?3)
         ON CONFLICT (date_utc, kind) DO UPDATE SET estimated_usd = estimated_usd + excluded.estimated_usd`,
      )
      .bind(dateUtc, kind, usd)
      .run();
  }
}
