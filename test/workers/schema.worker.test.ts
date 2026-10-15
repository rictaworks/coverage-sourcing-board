/// <reference types="vite/client" />
// 注意：Edit scope の test/workers/schema.test.ts は、workers プロジェクトの対象（*.worker.test.ts）に合わせて改名しました。
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migrationSql from '../../migrations/0001_init.sql?raw';
import templateRaw from '../../data/templates/shikoku-landscape.json?raw';
import {
  TEMPLATE_SESSION_ID,
  TemplateSeedBuilder,
  type TemplateDefinition,
} from '../../src/worker/db/templateSeed';

/** SQL をセミコロンで分ける。D1 の exec は改行で分けるため、prepare と batch で 1 文ずつ実行する。 */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*\n/)
    .map((statement) => statement.trim().replace(/;$/, '').trim())
    .filter((statement) => statement.length > 0);
}

/** D1 の状態はテストの間で残るため、テーブルが無いときだけ適用する（二重の適用を防ぐ）。 */
async function applyMigrations(): Promise<void> {
  const existing = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'session'").first<{ n: number }>();
  if (existing?.n === 1) {
    return;
  }
  // DDL は batch に入れず、1 文ずつ実行する（D1 の batch は DDL の順序に依存するため）。
  for (const statement of splitStatements(migrationSql)) {
    await env.DB.prepare(statement).run();
  }
}

async function countRows(table: string, sessionId: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`).bind(sessionId).first<{ n: number }>();
  return row?.n ?? -1;
}

const TEMPLATE = JSON.parse(templateRaw) as TemplateDefinition;

describe('D1 のスキーマ（migrations/0001_init.sql）', () => {
  beforeEach(async () => {
    await applyMigrations();
  });

  it('マイグレーション適用後に 10 テーブル（requirements 6 章）があります', async () => {
    const rows = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    ).all<{ name: string }>();
    expect(rows.results.map((row) => row.name)).toEqual([
      'accept_rule',
      'area',
      'campaign',
      'cell',
      'check_result',
      'daily_counter',
      'period',
      'review',
      'session',
      'submission',
    ]);
  });

  it('submission に位置情報（緯度・経度）と機種情報の列がありません。image は BLOB です', async () => {
    const rows = await env.DB.prepare("SELECT name, type FROM pragma_table_info('submission')").all<{ name: string; type: string }>();
    const names = rows.results.map((row) => row.name);
    expect(names.filter((name) => /lat|lng|lon|gps|device|make|model|exif/i.test(name))).toEqual([]);
    expect(rows.results.find((row) => row.name === 'image')?.type).toBe('BLOB');
  });

  it('daily_counter 以外のテーブルは session_id を持ち、session_id を先頭にした索引があります', async () => {
    const tables = ['campaign', 'area', 'period', 'cell', 'accept_rule', 'submission', 'check_result', 'review'];
    for (const table of tables) {
      const columns = await env.DB.prepare(`SELECT name FROM pragma_table_info('${table}')`).all<{ name: string }>();
      expect(columns.results.map((row) => row.name), table).toContain('session_id');
      const indexes = await env.DB.prepare(`SELECT name FROM pragma_index_list('${table}')`).all<{ name: string }>();
      const leadingColumns: string[] = [];
      for (const index of indexes.results) {
        const first = await env.DB.prepare('SELECT name FROM pragma_index_info(?) WHERE seqno = 0').bind(index.name).first<{ name: string }>();
        leadingColumns.push(first?.name ?? '');
      }
      expect(leadingColumns, table).toContain('session_id');
    }
    const counterColumns = await env.DB.prepare("SELECT name FROM pragma_table_info('daily_counter')").all<{ name: string }>();
    expect(counterColumns.results.map((row) => row.name)).not.toContain('session_id');
  });

  it('review は submission_id に一意の制約があり、submission ごとに 1 行までです', async () => {
    const indexes = await env.DB.prepare("SELECT name FROM pragma_index_list('review') WHERE \"unique\" = 1").all<{ name: string }>();
    const uniqueColumns: string[][] = [];
    for (const index of indexes.results) {
      const columns = await env.DB.prepare('SELECT name FROM pragma_index_info(?)').bind(index.name).all<{ name: string }>();
      uniqueColumns.push(columns.results.map((row) => row.name));
    }
    expect(uniqueColumns).toContainEqual(['submission_id']);
  });

  it('daily_counter の主キーは (date_utc, kind) です', async () => {
    const rows = await env.DB.prepare("SELECT name, pk FROM pragma_table_info('daily_counter') WHERE pk > 0 ORDER BY pk").all<{ name: string; pk: number }>();
    expect(rows.results.map((row) => row.name)).toEqual(['date_utc', 'kind']);
  });

  it('session の主キーは id_hash です（Cookie の値そのものは持ちません）', async () => {
    const rows = await env.DB.prepare("SELECT name FROM pragma_table_info('session') WHERE pk > 0").all<{ name: string }>();
    expect(rows.results.map((row) => row.name)).toEqual(['id_hash']);
  });
});

describe('テンプレートの投入（src/worker/db/templateSeed.ts）', () => {
  beforeEach(async () => {
    await applyMigrations();
  });

  it('システム用 ID は空でなく、16 進の文字列（Cookie のハッシュ）と衝突しない形です', () => {
    expect(TEMPLATE_SESSION_ID.length).toBeGreaterThan(0);
    expect(TEMPLATE_SESSION_ID).not.toMatch(/^[0-9a-f]+$/);
  });

  it('文は 6 件以下で、各文のバインド変数は 100 以下です', () => {
    const statements = new TemplateSeedBuilder(TEMPLATE).buildStatements();
    expect(statements.length).toBeLessThanOrEqual(6);
    for (const statement of statements) {
      const placeholders = (statement.sql.match(/\?/g) ?? []).length;
      expect(placeholders).toBeLessThanOrEqual(100);
      expect(statement.binds).toHaveLength(placeholders);
    }
  });

  it('投入すると、システム用 ID の行が 1・21・4・84・1 件になります', async () => {
    const statements = new TemplateSeedBuilder(TEMPLATE).buildStatements();
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement.sql).bind(...statement.binds)));
    expect(await countRows('campaign', TEMPLATE_SESSION_ID)).toBe(1);
    expect(await countRows('area', TEMPLATE_SESSION_ID)).toBe(21);
    expect(await countRows('period', TEMPLATE_SESSION_ID)).toBe(4);
    expect(await countRows('cell', TEMPLATE_SESSION_ID)).toBe(84);
    expect(await countRows('accept_rule', TEMPLATE_SESSION_ID)).toBe(1);
  });

  it('2 回実行しても行が重複しません', async () => {
    const statements = new TemplateSeedBuilder(TEMPLATE).buildStatements();
    for (let run = 0; run < 2; run += 1) {
      await env.DB.batch(statements.map((statement) => env.DB.prepare(statement.sql).bind(...statement.binds)));
    }
    expect(await countRows('area', TEMPLATE_SESSION_ID)).toBe(21);
    expect(await countRows('cell', TEMPLATE_SESSION_ID)).toBe(84);
    const counted = await env.DB.prepare('SELECT COUNT(*) AS n FROM cell WHERE session_id = ? AND required = ?')
      .bind(TEMPLATE_SESSION_ID, TEMPLATE.requiredPerCell)
      .first<{ n: number }>();
    expect(counted?.n).toBe(84);
  });
});
