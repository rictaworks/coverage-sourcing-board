import { SELF, env } from 'cloudflare:test';
import purgeSource from '../../src/worker/cron/dailyPurge.ts?raw';
import { beforeAll, describe, expect, it } from 'vitest';
import templateJson from '../../data/templates/shikoku-landscape.json';
import worker from '../../src/worker/index';
import { DailyPurge, PurgePlanBuilder, dailyPurge, type PurgePlan } from '../../src/worker/cron/dailyPurge';
import { DebugTracer } from '../../src/core/trace';
import { PURGE_STRINGS } from '../../src/config/strings/purge';
import { WORKER_CONFIG } from '../../src/config/worker';
import type { TemplateDefinition } from '../../src/worker/db/templateSeed';
import { TEMPLATE_SESSION_ID } from '../../src/worker/db/templateSeed';
import { MALFORMED_COOKIE_VALUE, TEST_BASE_URL } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';

/** 日次の全削除（requirements 3.9・SPEC/daily-purge.md）。テストは実装を呼び、データは固定の値だけを使う。 */

const TEMPLATE = templateJson as TemplateDefinition;
const EXPECTED_QUERY_COUNT = 15;
const TEMPLATE_COUNTS = { campaign: 1, accept_rule: 1, period: 4, area: 21, cell: 84 } as const;
const USER_TABLES = ['check_result', 'review', 'submission', 'cell', 'accept_rule', 'period', 'area', 'campaign'] as const;

let sequence = 0;

/** テストごとに別の ID を使う（D1 の状態が残っても衝突しないようにする）。 */
function nextTag(): string {
  sequence += 1;
  return `t${sequence}`;
}

async function count(sql: string, ...binds: string[]): Promise<number> {
  const row = await env.DB.prepare(sql).bind(...binds).first<{ n: number }>();
  if (row === null) {
    throw new Error('count query returned no row');
  }
  return row.n;
}

/** 利用者のセッション 1 件分の投稿・判定・レビュー・キャンペーンを入れる。 */
async function insertUserSession(sessionHash: string, tag: string): Promise<void> {
  const campaignId = `${tag}-campaign`;
  const statements = [
    env.DB.prepare('INSERT INTO session (id_hash) VALUES (?)').bind(sessionHash),
    env.DB.prepare('INSERT INTO campaign (id, session_id, name) VALUES (?, ?, ?)').bind(campaignId, sessionHash, 'test-campaign-name'),
    env.DB
      .prepare(
        `INSERT INTO accept_rule (id, session_id, campaign_id, ratio, tolerance, orientation, formats, min_short_px, blur_min, dup_distance, daytime_required, max_input_bytes, max_pixels)
         VALUES (?, ?, ?, 1.3333, 0.01, 'landscape', '["jpeg"]', 800, 30, 4, 1, 5242880, 40000000)`,
      )
      .bind(`${tag}-rule`, sessionHash, campaignId),
    env.DB
      .prepare('INSERT INTO area (id, session_id, campaign_id, prefecture, label, normalized) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`${tag}-area`, sessionHash, campaignId, 'test-prefecture', 'test-area', 'test-area'),
    env.DB
      .prepare('INSERT INTO period (id, session_id, campaign_id, label, months) VALUES (?, ?, ?, ?, ?)')
      .bind(`${tag}-period`, sessionHash, campaignId, 'test-period', '[3,4,5]'),
    env.DB
      .prepare('INSERT INTO cell (id, session_id, area_id, period_id, required) VALUES (?, ?, ?, ?, 2)')
      .bind(`${tag}-cell`, sessionHash, `${tag}-area`, `${tag}-period`),
    env.DB
      .prepare(
        `INSERT INTO submission (id, session_id, cell_id, shot_month, image, phash, status, declared_original, consent)
         VALUES (?, ?, ?, 4, ?, 'abcd', 'pending_review', 1, 1)`,
      )
      .bind(`${tag}-submission`, sessionHash, `${tag}-cell`, new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
    env.DB
      .prepare("INSERT INTO check_result (id, session_id, submission_id, item, verdict, reason) VALUES (?, ?, ?, 'format', 'pass', 'ok')")
      .bind(`${tag}-check`, sessionHash, `${tag}-submission`),
    env.DB
      .prepare("INSERT INTO review (id, session_id, submission_id, decision) VALUES (?, ?, ?, 'accept')")
      .bind(`${tag}-review`, sessionHash, `${tag}-submission`),
  ];
  await env.DB.batch(statements);
}

async function insertDailyCounter(): Promise<void> {
  await env.DB
    .prepare("INSERT OR REPLACE INTO daily_counter (date_utc, kind, count, estimated_usd) VALUES ('2026-10-16', 'classifier', 3, 0.001)")
    .run();
}

async function userRowCount(): Promise<number> {
  let total = 0;
  for (const table of USER_TABLES) {
    total += await count(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id != ?`, TEMPLATE_SESSION_ID);
  }
  total += await count('SELECT COUNT(*) AS n FROM session WHERE id_hash != ?', TEMPLATE_SESSION_ID);
  return total;
}

/** 全テーブルの行数（テンプレートの行数の確認用）。 */
async function expectOnlyTemplateRows(): Promise<void> {
  expect(await userRowCount()).toBe(0);
  expect(await count('SELECT COUNT(*) AS n FROM submission')).toBe(0);
  expect(await count('SELECT COUNT(*) AS n FROM review')).toBe(0);
  expect(await count('SELECT COUNT(*) AS n FROM check_result')).toBe(0);
  expect(await count('SELECT COUNT(*) AS n FROM session')).toBe(1);
  expect(await count('SELECT COUNT(*) AS n FROM campaign')).toBe(TEMPLATE_COUNTS.campaign);
  expect(await count('SELECT COUNT(*) AS n FROM accept_rule')).toBe(TEMPLATE_COUNTS.accept_rule);
  expect(await count('SELECT COUNT(*) AS n FROM period')).toBe(TEMPLATE_COUNTS.period);
  expect(await count('SELECT COUNT(*) AS n FROM area')).toBe(TEMPLATE_COUNTS.area);
  expect(await count('SELECT COUNT(*) AS n FROM cell')).toBe(TEMPLATE_COUNTS.cell);
}

function makeTracer(lines: string[]): DebugTracer {
  return new DebugTracer('development', (line) => lines.push(line));
}

describe('日次の全削除（requirements 3.9・SPEC/daily-purge.md）', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('投稿とキャンペーンを入れた後に実行すると、テンプレート以外の行が 0 件になり、テンプレートが再投入されます', async () => {
    const tag = nextTag();
    await insertUserSession(`${tag}-hash-a`, `${tag}a`);
    await insertUserSession(`${tag}-hash-b`, `${tag}b`);
    expect(await userRowCount()).toBeGreaterThan(0);

    await dailyPurge(env);

    await expectOnlyTemplateRows();
  });

  it('daily_counter の行は削除されません', async () => {
    await insertDailyCounter();
    await dailyPurge(env);
    const row = await env.DB
      .prepare("SELECT count, estimated_usd AS usd FROM daily_counter WHERE date_utc = '2026-10-16' AND kind = 'classifier'")
      .first<{ count: number; usd: number }>();
    expect(row).toEqual({ count: 3, usd: 0.001 });
  });

  it('2 回続けて実行しても、テンプレートの行は重複しません', async () => {
    await dailyPurge(env);
    await dailyPurge(env);
    await expectOnlyTemplateRows();
  });

  it('1 回の実行のクエリ数（batch に渡した文の数）は 15 以下です', async () => {
    const lines: string[] = [];
    const result = await new DailyPurge(env.DB, makeTracer(lines), new PurgePlanBuilder(TEMPLATE).build()).run();
    expect(result.queryCount).toBe(EXPECTED_QUERY_COUNT);
    expect(result.queryCount).toBeLessThanOrEqual(15);
  });

  it('実行後、古い Cookie での要求には新しいセッションが発行されます', async () => {
    const first = await SELF.fetch(`${TEST_BASE_URL}/api/session`);
    const oldToken = /^csid=([^;]+)/.exec(first.headers.get('set-cookie') ?? '')?.[1] ?? null;
    expect(oldToken).not.toBeNull();

    await dailyPurge(env);

    const second = await SELF.fetch(`${TEST_BASE_URL}/api/session`, {
      headers: { cookie: `${WORKER_CONFIG.sessionCookieName}=${oldToken}` },
    });
    const newToken = /^csid=([^;]+)/.exec(second.headers.get('set-cookie') ?? '')?.[1] ?? null;
    expect(newToken).not.toBeNull();
    expect(newToken).not.toBe(oldToken);
    expect(MALFORMED_COOKIE_VALUE).not.toBe(newToken);
  });

  it('途中で失敗すると、batch 全体が戻り、投稿の行は残ります（部分的な削除をしません）', async () => {
    const tag = nextTag();
    await insertUserSession(`${tag}-hash`, `${tag}x`);
    const base = new PurgePlanBuilder(TEMPLATE).build();
    // 最後の文は、同じ ID の session を重複して入れるため、必ず失敗する（先の削除の後に失敗させる）。
    const failing: PurgePlan = {
      deletes: base.deletes,
      reseed: [...base.reseed, { sql: 'INSERT INTO session (id_hash) VALUES (?)', binds: [TEMPLATE_SESSION_ID] }],
    };
    const lines: string[] = [];
    await expect(new DailyPurge(env.DB, makeTracer(lines), failing).run()).rejects.toThrow(PURGE_STRINGS.errorPurgeFailed);

    expect(await count("SELECT COUNT(*) AS n FROM submission WHERE id = ?", `${tag}x-submission`)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM campaign WHERE id = ?", `${tag}x-campaign`)).toBe(1);
    const names = lines.map((line) => JSON.parse(line).name);
    expect(names).toContain('cron.reset.failed');
    const failedLine = JSON.parse(lines[names.indexOf('cron.reset.failed')]);
    expect(failedLine.fields.errorKind).toBe(1);
    expect(Object.keys(failedLine.fields)).not.toContain('message');
  });

  it('トレースに、開始・終了、クエリ数、削除の件数、処理時間を出します（個人情報は含みません）', async () => {
    const tag = nextTag();
    await insertUserSession(`${tag}-hash`, `${tag}t`);
    const lines: string[] = [];
    await new DailyPurge(env.DB, makeTracer(lines), new PurgePlanBuilder(TEMPLATE).build()).run();

    const parsed = lines.map((line) => JSON.parse(line));
    expect(parsed.map((line) => line.name)).toEqual(['cron.reset.started', 'cron.reset.finished']);
    const finished = parsed[1];
    expect(finished.fields.queryCount).toBe(EXPECTED_QUERY_COUNT);
    expect(finished.fields.count).toBeGreaterThan(0);
    expect(typeof finished.fields.durationMs).toBe('number');
    expect(lines.join('\n')).not.toContain(`${tag}-hash`);
  });

  it('APP_ENV が development でも、同じ手順で実行されます', async () => {
    const tag = nextTag();
    await insertUserSession(`${tag}-hash`, `${tag}d`);
    const result = await dailyPurge({ ...env, APP_ENV: 'development' });
    expect(result.queryCount).toBe(EXPECTED_QUERY_COUNT);
    await expectOnlyTemplateRows();
  });

  it('APP_ENV が不正な値なら、実行せずに例外を投げます', async () => {
    const tag = nextTag();
    await insertUserSession(`${tag}-hash`, `${tag}i`);
    await expect(dailyPurge({ ...env, APP_ENV: 'staging' })).rejects.toThrow();
    expect(await count('SELECT COUNT(*) AS n FROM submission WHERE id = ?', `${tag}i-submission`)).toBe(1);
  });

  it('Cron の入口（scheduled）から、同じ手順を呼びます', async () => {
    const tag = nextTag();
    await insertUserSession(`${tag}-hash`, `${tag}s`);
    await worker.scheduled({} as ScheduledController, env);
    await expectOnlyTemplateRows();
  });

  it('session を キャンペーン系より先に削除する順序は、外部キーの制約で失敗します（削除の順序の根拠）', async () => {
    const tag = nextTag();
    await insertUserSession(`${tag}-hash`, `${tag}f`);
    const base = new PurgePlanBuilder(TEMPLATE).build();
    const sessionFirst: PurgePlan = {
      deletes: [
        ...base.deletes.slice(0, 3),
        { sql: 'DELETE FROM session', binds: [] },
        ...base.deletes.slice(3, 8),
      ],
      reseed: base.reseed,
    };
    await expect(new DailyPurge(env.DB, makeTracer([]), sessionFirst).run()).rejects.toThrow(PURGE_STRINGS.errorPurgeFailed);
    expect(await count('SELECT COUNT(*) AS n FROM submission WHERE id = ?', `${tag}f-submission`)).toBe(1);
  });

  it('文字列は設定（src/config/strings）に置き、実装に日本語を直書きしません', () => {
    const withoutComments = purgeSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(withoutComments).not.toMatch(/[぀-ヿ㐀-鿿]/);
  });
});
