/// <reference types="vite/client" />
import migrationSql from '../../migrations/0001_init.sql?raw';

/** SQL をセミコロンで分ける（D1 の exec は使わず、1 文ずつ prepare して実行する）。 */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((statement) => statement.trim().replace(/;$/, '').trim())
    .filter((statement) => statement.length > 0);
}

/** migrations/0001_init.sql を適用する。テーブルが既にあれば何もしない（テストの間で D1 の状態が残るため）。 */
export async function applyMigrations(db: D1Database): Promise<void> {
  const existing = await db
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'session'")
    .first<{ n: number }>();
  if (existing?.n === 1) {
    return;
  }
  for (const statement of splitStatements(migrationSql)) {
    await db.prepare(statement).run();
  }
}
