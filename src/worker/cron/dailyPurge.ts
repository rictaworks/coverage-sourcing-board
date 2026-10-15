import { WORKER_STRINGS } from '../../config/strings/worker';

/**
 * 日次の全削除（requirements 3.9）。C6 が実装を置き換える。
 * 現在は未実装のため、実行すると例外を投げる（黙って何もしない代用はしない）。
 */
export class DailyPurge {
  constructor(private readonly db: D1Database) {}

  async run(): Promise<void> {
    throw new Error(WORKER_STRINGS.errorDailyPurgeNotImplemented);
  }
}
