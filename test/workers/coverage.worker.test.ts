/// <reference types="vite/client" />
// 注意：Edit scope の test/workers/coverage.test.ts は、workers プロジェクトの対象（*.worker.test.ts）に合わせて改名しました。
import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import templateRaw from '../../data/templates/shikoku-landscape.json?raw';
import { API_ERROR_MESSAGES } from '../../src/config/strings/apiErrors';
import { CAMPAIGN_API_ERROR_MESSAGES } from '../../src/config/strings/campaignApi';
import { TemplateSeedBuilder, type TemplateDefinition } from '../../src/worker/db/templateSeed';
import { sha256Hex } from '../../src/worker/security/sha256';
import { DEVELOPMENT_WEB_ORIGIN, TEST_BASE_URL, WORKER_TEST_TIMEOUT_MS } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';

interface Session {
  readonly cookie: string;
  readonly hash: string;
}

interface CoverageBody {
  cells: {
    cellId: string;
    areaId: string;
    periodId: string;
    accepted: number;
    pendingReview: number;
    required: number;
    closed: boolean;
  }[];
  priority: string[];
}

type SubmissionStatus = 'checking' | 'pending_review' | 'accepted' | 'returned';

function uniqueIp(): string {
  return crypto.randomUUID();
}

async function seedTemplate(): Promise<void> {
  const template = JSON.parse(templateRaw) as TemplateDefinition;
  const statements = new TemplateSeedBuilder(template).buildStatements();
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement.sql).bind(...statement.binds)));
}

async function newSession(): Promise<Session> {
  const response = await SELF.fetch(`${TEST_BASE_URL}/api/session`, { headers: { 'cf-connecting-ip': uniqueIp() } });
  const token = response.headers.get('set-cookie')?.match(/^csid=([^;]+)/)?.[1];
  if (token === undefined) {
    throw new Error('csid was not issued.');
  }
  return { cookie: `csid=${token}`, hash: await sha256Hex(token) };
}

async function call(method: string, path: string, session: Session | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'cf-connecting-ip': uniqueIp() };
  if (session !== null) {
    headers.cookie = session.cookie;
  }
  if (method !== 'GET') {
    headers.origin = DEVELOPMENT_WEB_ORIGIN;
    headers['content-type'] = 'application/json';
  }
  return SELF.fetch(`${TEST_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** テスト用の投稿の行を直接入れる（画像は空の BLOB。判定の結果は見ない）。 */
async function insertSubmission(session: Session, cellId: string, status: SubmissionStatus): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO submission (id, session_id, cell_id, shot_month, spot_name, caption, image, phash, status, declared_original, consent)
     VALUES (?, ?, ?, 5, '', '', X'00', 'test-phash', ?, 1, 1)`,
  )
    .bind(crypto.randomUUID(), session.hash, cellId, status)
    .run();
}

async function loadCoverage(session: Session): Promise<CoverageBody> {
  const response = await call('GET', '/api/coverage', session);
  expect(response.status).toBe(200);
  return (await response.json()) as CoverageBody;
}

/** テンプレートを読み込み、マスの ID の一覧を返す。 */
async function loadTemplate(session: Session): Promise<CoverageBody> {
  const response = await call('POST', '/api/campaign/template', session, { templateId: 'shikoku-landscape' });
  expect([200, 201]).toContain(response.status);
  return loadCoverage(session);
}

describe('充足マップ（GET /api/coverage）の基本', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('キャンペーンが無ければ 404 と campaign_not_found を返します', async () => {
    const session = await newSession();
    const response = await call('GET', '/api/coverage', session);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('campaign_not_found');
    expect(body.message).toBe(CAMPAIGN_API_ERROR_MESSAGES.campaign_not_found);
  });

  it('読み込み直後は、マス 84 件すべてが採用 0・確認待ち 0・必要数 2・募集中で、priority は全マスを含みます', async () => {
    const session = await newSession();
    const coverage = await loadTemplate(session);
    expect(coverage.cells).toHaveLength(84);
    expect(coverage.cells.every((cell) => cell.accepted === 0 && cell.pendingReview === 0)).toBe(true);
    expect(coverage.cells.every((cell) => cell.required === 2 && cell.closed === false)).toBe(true);
    expect(coverage.priority).toHaveLength(84);
  });

  it('priority は、充足率が同じなら、マスの並び順（cells の順）になります', async () => {
    const session = await newSession();
    const coverage = await loadTemplate(session);
    expect(coverage.priority).toEqual(coverage.cells.map((cell) => cell.cellId));
  });
});

describe('充足の計算（採用・確認待ち・募集終了）', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('採用と確認待ちだけを数え、差し戻しと確認中は数えません', async () => {
    const session = await newSession();
    const before = await loadTemplate(session);
    const target = before.cells[0].cellId;
    await insertSubmission(session, target, 'accepted');
    await insertSubmission(session, target, 'pending_review');
    await insertSubmission(session, target, 'returned');
    await insertSubmission(session, target, 'checking');
    const after = await loadCoverage(session);
    const cell = after.cells.find((candidate) => candidate.cellId === target);
    expect(cell?.accepted).toBe(1);
    expect(cell?.pendingReview).toBe(1);
  });

  it('確認待ちは枠に含まれないため、確認待ちだけのマスは募集中のままです', async () => {
    const session = await newSession();
    const before = await loadTemplate(session);
    const target = before.cells[1].cellId;
    await insertSubmission(session, target, 'pending_review');
    await insertSubmission(session, target, 'pending_review');
    await insertSubmission(session, target, 'pending_review');
    const after = await loadCoverage(session);
    const cell = after.cells.find((candidate) => candidate.cellId === target);
    expect(cell?.pendingReview).toBe(3);
    expect(cell?.accepted).toBe(0);
    expect(cell?.closed).toBe(false);
    expect(after.priority).toContain(target);
  });

  it('採用数が必要数に達したマスは募集終了（closed）になり、priority に含まれません', async () => {
    const session = await newSession();
    const before = await loadTemplate(session);
    const target = before.cells[2].cellId;
    await insertSubmission(session, target, 'accepted');
    await insertSubmission(session, target, 'accepted');
    const after = await loadCoverage(session);
    const cell = after.cells.find((candidate) => candidate.cellId === target);
    expect(cell?.closed).toBe(true);
    expect(after.priority).not.toContain(target);
  });

  it('priority は充足率の低い順です（採用 1 の 2 マスは、採用 0 のマスの後）', async () => {
    const session = await newSession();
    const before = await loadTemplate(session);
    const half = before.cells[5].cellId;
    await insertSubmission(session, half, 'accepted');
    const after = await loadCoverage(session);
    const halfIndex = after.priority.indexOf(half);
    expect(halfIndex).toBeGreaterThan(0);
    for (const cellId of after.priority.slice(0, halfIndex)) {
      const cell = after.cells.find((candidate) => candidate.cellId === cellId);
      expect(cell?.accepted).toBe(0);
    }
  });
});

describe('セッションの隔離（requirements 2.3）', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('別のセッション B の充足マップは、A の採用数・確認待ち数を含みません', async () => {
    const a = await newSession();
    const b = await newSession();
    const coverageA = await loadTemplate(a);
    await loadTemplate(b);
    const target = coverageA.cells[0].cellId;
    await insertSubmission(a, target, 'accepted');
    await insertSubmission(a, target, 'pending_review');
    const coverageB = await loadCoverage(b);
    expect(coverageB.cells.every((cell) => cell.accepted === 0 && cell.pendingReview === 0)).toBe(true);
    expect(coverageB.cells.some((cell) => cell.cellId === target)).toBe(false);
    const rawB = JSON.stringify(coverageB);
    expect(rawB).not.toContain(target);
  });

  it('B に別のキャンペーンが無いときは、A の充足マップを見られません（404）', async () => {
    const a = await newSession();
    const b = await newSession();
    await loadTemplate(a);
    const response = await call('GET', '/api/coverage', b);
    expect(response.status).toBe(404);
  });
});

describe('整合性の崩れ（マスがキャンペーンに無い投稿の行）', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('自分のセッションの投稿が他のキャンペーンのマスを指していても、例外にせず 500（internal_error）を返します', async () => {
    const a = await newSession();
    const b = await newSession();
    await loadTemplate(a);
    const coverageB = await loadTemplate(b);
    await insertSubmission(a, coverageB.cells[0].cellId, 'accepted');
    const response = await call('GET', '/api/coverage', a);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('internal_error');
    expect(body.message).toBe(API_ERROR_MESSAGES.internal_error);
    expect(JSON.stringify(body)).not.toContain(coverageB.cells[0].cellId);
  });
});
