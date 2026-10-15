/// <reference types="vite/client" />
// 並行の要求の上限のテスト。行が残るため、件数を正確に作れるよう、別のファイル（別の D1）に分けています。
import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import templateRaw from '../../data/templates/shikoku-landscape.json?raw';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { LIMITS } from '../../src/config/limits';
import { BROWSER_CHECK_ITEMS } from '../../src/config/submission';
import { TemplateSeedBuilder, type TemplateDefinition } from '../../src/worker/db/templateSeed';
import { sha256Hex } from '../../src/worker/security/sha256';
import { DEVELOPMENT_WEB_ORIGIN, TEST_BASE_URL, WORKER_TEST_TIMEOUT_MS } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';
import { buildJpeg } from '../helpers/jpegBytes';

interface Session {
  readonly cookie: string;
  readonly hash: string;
}

interface CampaignBody {
  readonly cells: { cellId: string }[];
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const INSERT_CHUNK = 50;

function uniqueIp(): string {
  return crypto.randomUUID();
}

/** 16 文字の 16 進のハッシュ（行ごとに別の値）。 */
function randomHash(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** UTC の時刻（ミリ秒）を、JST の文字列（+09:00）にする。テストの行の時刻を作るため。 */
function jstString(utcMs: number): string {
  const jst = new Date(utcMs + JST_OFFSET_MS);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}+09:00`;
}

/** 今日の UTC 0 時（ミリ秒）。 */
function todayUtcStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
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

async function loadCampaign(session: Session): Promise<CampaignBody> {
  const response = await SELF.fetch(`${TEST_BASE_URL}/api/campaign/template`, {
    method: 'POST',
    headers: { cookie: session.cookie, origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': uniqueIp(), 'content-type': 'application/json' },
    body: JSON.stringify({ templateId: CAMPAIGN_API_CONFIG.defaultTemplateId }),
  });
  return (await response.json()) as CampaignBody;
}

/** 投稿を、行として直接入れる（件数の上限のテストの準備。API の上限に当たらないよう、直接入れる）。 */
async function insertSubmissionRows(count: number, sessionHash: string, cellId: string, createdAt: string): Promise<void> {
  const image = new Uint8Array([0xff, 0xd8]);
  for (let start = 0; start < count; start += INSERT_CHUNK) {
    const size = Math.min(INSERT_CHUNK, count - start);
    const statements = Array.from({ length: size }, () =>
      env.DB.prepare(
        `INSERT INTO submission (id, session_id, cell_id, shot_month, spot_name, caption, image, phash, status, declared_original, consent, created_at)
         VALUES (?, ?, ?, 4, '', '', ?, ?, 'pending_review', 1, 1, ?)`,
      ).bind(crypto.randomUUID(), sessionHash, cellId, image, randomHash(), createdAt),
    );
    await env.DB.batch(statements);
  }
}

async function countSubmissions(sessionHash: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM submission WHERE session_id = ?').bind(sessionHash).first<{ n: number }>();
  return row?.n ?? -1;
}

async function countAllSubmissions(): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM submission').first<{ n: number }>();
  return row?.n ?? -1;
}

/** File に渡せる型（ArrayBuffer を持つ配列）にコピーする。 */
function blobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes);
}

/** 正しい投稿を 1 件送る（上限に当たらない、既定の値）。 */
async function postOne(session: Session, cellId: string): Promise<Response> {
  const form = new FormData();
  form.set('image', new File([blobPart(buildJpeg({ width: 1600, height: 1200 }))], 'image.jpg', { type: 'image/jpeg' }));
  form.set('thumb', new File([blobPart(buildJpeg({ width: 512, height: 384 }))], 'thumb.jpg', { type: 'image/jpeg' }));
  form.set(
    'meta',
    JSON.stringify({
      cellId,
      shotMonth: 4,
      spotName: '',
      caption: '',
      declaredOriginal: true,
      consent: true,
      phash: randomHash(),
      checks: BROWSER_CHECK_ITEMS.map((item) => ({ item, verdict: 'pass', reasonCode: 'passed' })),
    }),
  );
  return SELF.fetch(`${TEST_BASE_URL}/api/submissions`, {
    method: 'POST',
    headers: { cookie: session.cookie, origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': uniqueIp() },
    body: form,
  });
}

describe('並行の要求でも上限を超えない（上限の判定と挿入を 1 つの SQL 文で行う）', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('並行の要求でも、セッションの 1 日の上限（20 件）を超えて保存しません', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = campaign.cells[0].cellId;
    await insertSubmissionRows(LIMITS.dailySubmissionsPerSession - 2, session.hash, cellId, jstString(Date.now()));
    const responses = await Promise.all(Array.from({ length: 6 }, () => postOne(session, cellId)));
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(2);
    expect(statuses.filter((status) => status === 429)).toHaveLength(4);
    expect(await countSubmissions(session.hash)).toBe(LIMITS.dailySubmissionsPerSession);
  });

  it('並行の要求でも、保存中の総数の上限（200 件）を超えて保存しません', async () => {
    const owner = await newSession();
    const ownerCampaign = await loadCampaign(owner);
    const current = await countAllSubmissions();
    await insertSubmissionRows(LIMITS.maxSavedSubmissions - 2 - current, owner.hash, ownerCampaign.cells[0].cellId, jstString(Date.now() - 1000 * 60 * 60 * 48));
    expect(await countAllSubmissions()).toBe(LIMITS.maxSavedSubmissions - 2);
    const sessions = await Promise.all(Array.from({ length: 6 }, () => newSession()));
    const targets = await Promise.all(sessions.map(async (session) => ({ session, cellId: (await loadCampaign(session)).cells[0].cellId })));
    const responses = await Promise.all(targets.map((target) => postOne(target.session, target.cellId)));
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(2);
    expect(statuses.filter((status) => status === 503)).toHaveLength(4);
    expect(await countAllSubmissions()).toBe(LIMITS.maxSavedSubmissions);
  });
});
