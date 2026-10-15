/// <reference types="vite/client" />
// 注意：Edit scope の test/workers/mine.test.ts は、workers プロジェクトの対象（*.worker.test.ts）に合わせて改名しました（C2 と同じ理由です）。
import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import templateRaw from '../../data/templates/shikoku-landscape.json?raw';
import { TemplateSeedBuilder, type TemplateDefinition } from '../../src/worker/db/templateSeed';
import { sha256Hex } from '../../src/worker/security/sha256';
import { DEVELOPMENT_WEB_ORIGIN, TEST_BASE_URL, WORKER_TEST_TIMEOUT_MS } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';

interface Session {
  readonly cookie: string;
  readonly hash: string;
}

interface MineItem {
  id: string;
  cellId: string;
  status: string;
  shotMonth: number;
  spotName: string;
  caption: string;
  overQuota: boolean;
  createdAt: string;
  returnInfo: { reasonCode: string; freeText: string; resubmittable: boolean } | null;
}

const ZERO_HASH = '0000000000000000';

async function seedTemplate(): Promise<void> {
  const template = JSON.parse(templateRaw) as TemplateDefinition;
  const statements = new TemplateSeedBuilder(template).buildStatements();
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement.sql).bind(...statement.binds)));
}

async function newSession(): Promise<Session> {
  const response = await SELF.fetch(`${TEST_BASE_URL}/api/session`, { headers: { 'cf-connecting-ip': crypto.randomUUID() } });
  const token = response.headers.get('set-cookie')?.match(/^csid=([^;]+)/)?.[1];
  if (token === undefined) {
    throw new Error('csid was not issued.');
  }
  return { cookie: `csid=${token}`, hash: await sha256Hex(token) };
}

async function call(method: string, path: string, session: Session | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'cf-connecting-ip': crypto.randomUUID() };
  if (session !== null) {
    headers.cookie = session.cookie;
  }
  if (method !== 'GET') {
    headers.origin = DEVELOPMENT_WEB_ORIGIN;
    headers['content-type'] = 'application/json';
  }
  return SELF.fetch(`${TEST_BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function firstCellId(session: Session): Promise<string> {
  await call('POST', '/api/campaign/template', session, { templateId: 'shikoku-landscape' });
  const body = (await (await call('GET', '/api/campaign', session)).json()) as { cells: { cellId: string }[] };
  return body.cells[0].cellId;
}

async function insertSubmission(session: Session, cellId: string, status: string, spotName = '', caption = ''): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO submission (id, session_id, cell_id, shot_month, spot_name, caption, image, phash, status, over_quota, declared_original, consent)
     VALUES (?, ?, ?, 7, ?, ?, X'FFD8FFD9', ?, ?, 0, 1, 1)`,
  )
    .bind(id, session.hash, cellId, spotName, caption, ZERO_HASH, status)
    .run();
  return id;
}

async function listMine(session: Session): Promise<MineItem[]> {
  const response = await call('GET', '/api/submissions/mine', session);
  expect(response.status).toBe(200);
  return ((await response.json()) as { items: MineItem[] }).items;
}

describe('自分の投稿の一覧（GET /api/submissions/mine）', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('自分の投稿の状態・マス・撮影月・地点名・説明文・超過採用の有無を返します（確認中の行は含めません）', async () => {
    const session = await newSession();
    const cellId = await firstCellId(session);
    const pending = await insertSubmission(session, cellId, 'pending_review', 'spot', 'caption');
    await insertSubmission(session, cellId, 'checking');

    const items = await listMine(session);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: pending,
      cellId,
      status: 'pending_review',
      shotMonth: 7,
      spotName: 'spot',
      caption: 'caption',
      overQuota: false,
      returnInfo: null,
    });
    expect(typeof items[0].createdAt).toBe('string');
  });

  it('差し戻しの投稿には、理由・自由記述・再投稿の可否を返します', async () => {
    const session = await newSession();
    const cellId = await firstCellId(session);
    const id = await insertSubmission(session, cellId, 'returned');
    await env.DB.prepare(
      `INSERT INTO review (id, session_id, submission_id, decision, reason, resubmittable)
       VALUES (?, ?, ?, 'return', ?, 1)`,
    )
      .bind(crypto.randomUUID(), session.hash, id, JSON.stringify({ reasonCode: 'subject', freeText: 'note' }))
      .run();

    const items = await listMine(session);
    expect(items[0].id).toBe(id);
    expect(items[0].returnInfo).toEqual({ reasonCode: 'subject', freeText: 'note', resubmittable: true });
  });

  it('超過採用の投稿は overQuota が true になります', async () => {
    const session = await newSession();
    const cellId = await firstCellId(session);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO submission (id, session_id, cell_id, shot_month, spot_name, caption, image, phash, status, over_quota, declared_original, consent)
       VALUES (?, ?, ?, 7, '', '', X'FFD8FFD9', ?, 'accepted', 1, 1, 1)`,
    )
      .bind(id, session.hash, cellId, ZERO_HASH)
      .run();
    expect((await listMine(session))[0]).toMatchObject({ id, status: 'accepted', overQuota: true });
  });

  it('他のセッションの投稿は含めません', async () => {
    const owner = await newSession();
    const other = await newSession();
    const cellId = await firstCellId(owner);
    await insertSubmission(owner, cellId, 'pending_review');
    expect(await listMine(other)).toEqual([]);
  });
});
