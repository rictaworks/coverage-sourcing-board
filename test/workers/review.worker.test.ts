/// <reference types="vite/client" />
// 注意：Edit scope の test/workers/review.test.ts は、workers プロジェクトの対象（*.worker.test.ts）に合わせて改名しました（C2 と同じ理由です）。
import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import templateRaw from '../../data/templates/shikoku-landscape.json?raw';
import { API_ERROR_MESSAGES } from '../../src/config/strings/apiErrors';
import { REVIEW_ERROR_MESSAGES } from '../../src/config/strings/review';
import { LIMITS } from '../../src/config/limits';
import { TemplateSeedBuilder, type TemplateDefinition } from '../../src/worker/db/templateSeed';
import { sha256Hex } from '../../src/worker/security/sha256';
import { DEVELOPMENT_WEB_ORIGIN, FOREIGN_ORIGIN, TEST_BASE_URL, WORKER_TEST_TIMEOUT_MS, testIp } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';

interface Session {
  readonly cookie: string;
  readonly hash: string;
}

interface CellView {
  cellId: string;
  areaId: string;
  periodId: string;
  required: number;
}

/** テストの投稿の 1 件分（行を直接入れる）。 */
interface SeedSubmission {
  readonly status: 'pending_review' | 'accepted' | 'returned' | 'checking';
  readonly cellId?: string;
  readonly spotName?: string;
  readonly phash?: string;
  readonly image?: Uint8Array;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

async function call(method: string, path: string, session: Session | null, body?: unknown, origin = DEVELOPMENT_WEB_ORIGIN): Promise<Response> {
  const headers: Record<string, string> = { 'cf-connecting-ip': uniqueIp() };
  if (session !== null) {
    headers.cookie = session.cookie;
  }
  if (method !== 'GET') {
    headers.origin = origin;
    headers['content-type'] = 'application/json';
  }
  return SELF.fetch(`${TEST_BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** テンプレートを読み込み、必要数を全マス 1 にする（超過採用の確認を確かめるため）。 */
async function setUpCampaign(session: Session, requiredValue: number): Promise<CellView[]> {
  const created = await call('POST', '/api/campaign/template', session, { templateId: 'shikoku-landscape' });
  expect(created.status).toBe(201);
  const campaign = (await created.json()) as { name: string; acceptRule: unknown };
  const updated = await call('PUT', '/api/campaign', session, {
    name: campaign.name,
    requiredPerCell: { mode: 'uniform', value: requiredValue },
    acceptRule: campaign.acceptRule,
  });
  expect(updated.status).toBe(200);
  const body = (await updated.json()) as { cells: CellView[] };
  return body.cells;
}

const ZERO_HASH = '0000000000000000';
const FULL_HASH = 'ffffffffffffffff';
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0xff, 0xd9]);

/** テスト用の投稿の行を直接入れる。画像の中身は JPEG 風の固定の値。 */
async function insertSubmission(session: Session, seed: SeedSubmission): Promise<string> {
  const id = crypto.randomUUID();
  const cellId = seed.cellId ?? (await firstCellId(session));
  await env.DB.prepare(
    `INSERT INTO submission (id, session_id, cell_id, shot_month, spot_name, caption, image, phash, status, declared_original, consent)
     VALUES (?, ?, ?, 5, ?, '', ?, ?, ?, 1, 1)`,
  )
    .bind(id, session.hash, cellId, seed.spotName ?? '', seed.image ?? JPEG_BYTES, seed.phash ?? ZERO_HASH, seed.status)
    .run();
  return id;
}

async function firstCellId(session: Session): Promise<string> {
  const response = await call('GET', '/api/campaign', session);
  const body = (await response.json()) as { cells: CellView[] };
  return body.cells[0].cellId;
}

async function insertSubjectRow(session: Session, submissionId: string, kind: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO check_result (id, session_id, submission_id, item, verdict, reason, confidence, model)
     VALUES (?, ?, ?, 'subject_kind', 'info', ?, 0.8, 'clef-flash')`,
  )
    .bind(crypto.randomUUID(), session.hash, submissionId, kind)
    .run();
}

async function insertReviewCheck(session: Session, submissionId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO check_result (id, session_id, submission_id, item, verdict, reason, confidence, model)
     VALUES (?, ?, ?, 'focus', 'review', 'focus_borderline', NULL, NULL)`,
  )
    .bind(crypto.randomUUID(), session.hash, submissionId)
    .run();
}

async function statusOf(id: string): Promise<{ status: string; over_quota: number } | null> {
  return env.DB.prepare('SELECT status, over_quota FROM submission WHERE id = ?')
    .bind(id)
    .first<{ status: string; over_quota: number }>();
}

async function coverageOf(session: Session, cellId: string): Promise<{ accepted: number; closed: boolean; pendingReview: number }> {
  const response = await call('GET', '/api/coverage', session);
  const body = (await response.json()) as { cells: { cellId: string; accepted: number; closed: boolean; pendingReview: number }[] };
  const cell = body.cells.find((candidate) => candidate.cellId === cellId);
  if (cell === undefined) {
    throw new Error('cell not found in coverage.');
  }
  return cell;
}

describe('最終確認の API（C5）', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  describe('確認キュー（GET /api/review/queue）', () => {
    it('確認待ちの投稿を、要確認の項目・被写体の推定・候補とともに返し、画像は含めません', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const cellId = await firstCellId(session);
      const first = await insertSubmission(session, { status: 'pending_review', cellId, spotName: 'spot', phash: ZERO_HASH });
      const second = await insertSubmission(session, { status: 'pending_review', cellId, spotName: 'spot', phash: FULL_HASH });
      await insertReviewCheck(session, first);
      await insertSubjectRow(session, first, 'closeup');

      const response = await call('GET', '/api/review/queue', session);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain('"image"');
      const body = JSON.parse(text) as { items: Array<Record<string, unknown>>; accepted: unknown[] };
      const byId = new Map(body.items.map((item) => [item.id as string, item]));
      const firstItem = byId.get(first) as Record<string, unknown>;
      expect(firstItem.checks).toEqual([{ item: 'focus', verdict: 'review', reasonCode: 'focus_borderline' }]);
      expect(firstItem.subject).toEqual({ status: 'estimated', kind: 'closeup', confidence: 0.8, model: 'clef-flash' });
      const secondItem = byId.get(second) as Record<string, unknown>;
      expect(secondItem.subject).toEqual({ status: 'none' });
      expect(body.accepted).toEqual([]);
    });

    it('同じマス・同じ地点名の既存の投稿を、候補の ID として返します', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const cellId = await firstCellId(session);
      const first = await insertSubmission(session, { status: 'pending_review', cellId, spotName: 'spot', phash: ZERO_HASH });
      const second = await insertSubmission(session, { status: 'pending_review', cellId, spotName: 'spot', phash: FULL_HASH });

      const body = (await (await call('GET', '/api/review/queue', session)).json()) as {
        items: Array<{ id: string; candidateIds: string[] }>;
      };
      expect(body.items.find((item) => item.id === first)?.candidateIds).toEqual([second]);
    });

    it('採用済みの投稿は、取り消しのための一覧（accepted）に返します', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const accepted = await insertSubmission(session, { status: 'accepted' });
      const body = (await (await call('GET', '/api/review/queue', session)).json()) as { items: unknown[]; accepted: Array<{ id: string }> };
      expect(body.items).toEqual([]);
      expect(body.accepted.map((item) => item.id)).toEqual([accepted]);
    });
  });

  describe('採用（POST /api/review/:id/accept）', () => {
    it('枠内なら採用し、超過採用の記録は立てません', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const cellId = await firstCellId(session);
      const id = await insertSubmission(session, { status: 'pending_review', cellId });

      const response = await call('POST', `/api/review/${id}/accept`, session, {});
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ id, status: 'accepted', overQuota: false });
      expect((await statusOf(id))?.status).toBe('accepted');
      expect((await coverageOf(session, cellId)).accepted).toBe(1);
    });

    it('必要数 1 のマスで 1 件採用した後、2 件目は 409 になり、確認の印で超過採用できます', async () => {
      const session = await newSession();
      await setUpCampaign(session, 1);
      const cellId = await firstCellId(session);
      const first = await insertSubmission(session, { status: 'pending_review', cellId });
      const second = await insertSubmission(session, { status: 'pending_review', cellId, phash: FULL_HASH });

      expect((await call('POST', `/api/review/${first}/accept`, session, {})).status).toBe(200);

      const blocked = await call('POST', `/api/review/${second}/accept`, session, {});
      expect(blocked.status).toBe(409);
      expect(await blocked.json()).toEqual({ code: 'over_quota_confirmation_required', message: REVIEW_ERROR_MESSAGES.over_quota_confirmation_required });
      expect((await statusOf(second))?.status).toBe('pending_review');

      const confirmed = await call('POST', `/api/review/${second}/accept`, session, { confirmOverQuota: true });
      expect(confirmed.status).toBe(200);
      expect(await confirmed.json()).toEqual({ id: second, status: 'accepted', overQuota: true });
      expect(await statusOf(second)).toEqual({ status: 'accepted', over_quota: 1 });
    });

    it('pending_review 以外の投稿は 409（invalid_state）になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'accepted' });
      const response = await call('POST', `/api/review/${id}/accept`, session, {});
      expect(response.status).toBe(409);
      expect(((await response.json()) as { code: string }).code).toBe('invalid_state');
    });

    it('確認の印が真偽値でなければ 400 になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });
      const response = await call('POST', `/api/review/${id}/accept`, session, { confirmOverQuota: 'yes' });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: 'invalid_request', message: API_ERROR_MESSAGES.invalid_request });
    });

    it('形式の正しくない ID は 404 になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const response = await call('POST', '/api/review/not-a-uuid/accept', session, {});
      expect(response.status).toBe(404);
      expect(((await response.json()) as { code: string }).code).toBe('not_found');
    });
  });

  describe('差し戻し（POST /api/review/:id/return）', () => {
    it('理由と自由記述と再投稿の可否を保存し、返します', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });

      const response = await call('POST', `/api/review/${id}/return`, session, {
        reasonCode: 'resolution',
        freeText: 'short side is small',
        resubmittable: true,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id,
        status: 'returned',
        overQuota: false,
        returnInfo: { reasonCode: 'resolution', freeText: 'short side is small', resubmittable: true },
      });
      expect((await statusOf(id))?.status).toBe('returned');
      const review = await env.DB.prepare('SELECT decision, resubmittable FROM review WHERE submission_id = ?')
        .bind(id)
        .first<{ decision: string; resubmittable: number }>();
      expect(review).toEqual({ decision: 'return', resubmittable: 1 });
    });

    it('理由のコードが一覧に無いと 400 になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });
      const response = await call('POST', `/api/review/${id}/return`, session, { reasonCode: 'unknown', freeText: '', resubmittable: false });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: 'invalid_request', message: REVIEW_ERROR_MESSAGES.reason_code_invalid });
    });

    it('自由記述が上限を超えると 400 になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });
      const response = await call('POST', `/api/review/${id}/return`, session, {
        reasonCode: 'other',
        freeText: 'a'.repeat(LIMITS.returnReasonMaxChars + 1),
        resubmittable: false,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: 'invalid_request', message: REVIEW_ERROR_MESSAGES.free_text_too_long });
      expect((await statusOf(id))?.status).toBe('pending_review');
    });

    it('採用済みの投稿は差し戻せません（409）', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'accepted' });
      const response = await call('POST', `/api/review/${id}/return`, session, { reasonCode: 'subject', freeText: '', resubmittable: false });
      expect(response.status).toBe(409);
    });
  });

  describe('採用の取り消し（POST /api/review/:id/revoke）', () => {
    it('採用を差し戻し扱いにし、マスが再び募集中になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 1);
      const cellId = await firstCellId(session);
      const id = await insertSubmission(session, { status: 'pending_review', cellId });
      await call('POST', `/api/review/${id}/accept`, session, {});
      expect((await coverageOf(session, cellId)).closed).toBe(true);

      const response = await call('POST', `/api/review/${id}/revoke`, session, {
        reasonCode: 'shoot_declaration',
        freeText: '',
        resubmittable: true,
      });
      expect(response.status).toBe(200);
      expect(((await response.json()) as { status: string }).status).toBe('returned');
      const coverage = await coverageOf(session, cellId);
      expect(coverage.accepted).toBe(0);
      expect(coverage.closed).toBe(false);
    });

    it('採用されていない投稿は取り消せません（409）', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });
      const response = await call('POST', `/api/review/${id}/revoke`, session, { reasonCode: 'other', freeText: 'x', resubmittable: false });
      expect(response.status).toBe(409);
    });
  });

  describe('他のセッションの隔離（OWASP A01）', () => {
    it('他のセッションの投稿は、採用・差し戻し・取り消し・画像の取得が 404 になり、データは変わりません', async () => {
      const owner = await newSession();
      const other = await newSession();
      await setUpCampaign(owner, 2);
      await setUpCampaign(other, 2);
      const id = await insertSubmission(owner, { status: 'pending_review' });

      expect((await call('POST', `/api/review/${id}/accept`, other, {})).status).toBe(404);
      expect((await call('POST', `/api/review/${id}/return`, other, { reasonCode: 'other', freeText: 'x', resubmittable: false })).status).toBe(404);
      expect((await call('POST', `/api/review/${id}/revoke`, other, { reasonCode: 'other', freeText: 'x', resubmittable: false })).status).toBe(404);
      expect((await call('GET', `/api/submissions/${id}/image`, other)).status).toBe(404);
      expect((await statusOf(id))?.status).toBe('pending_review');
    });

    it('他のセッションの確認キューと一覧には、投稿が出ません', async () => {
      const owner = await newSession();
      const other = await newSession();
      await setUpCampaign(owner, 2);
      await setUpCampaign(other, 2);
      const id = await insertSubmission(owner, { status: 'pending_review' });
      const body = (await (await call('GET', '/api/review/queue', other)).json()) as { items: Array<{ id: string }> };
      expect(body.items.map((item) => item.id)).not.toContain(id);
    });
  });

  describe('画像の配信（GET /api/submissions/:id/image）', () => {
    it('自分の投稿の JPEG を、仕様のヘッダーで返します', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });

      const response = await call('GET', `/api/submissions/${id}/image`, session);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/jpeg');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('content-disposition')).toBe('inline');
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG_BYTES);
    });

    it('共通の応答の処理は、ハンドラーが付けた Cache-Control を残します（private, no-store）', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });
      const response = await call('GET', `/api/submissions/${id}/image`, session);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    });

    it('差し戻しの自由記述に制御文字があると 400 になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });
      const response = await call('POST', `/api/review/${id}/return`, session, { reasonCode: 'other', freeText: 'a\u202Eb', resubmittable: true });
      expect(response.status).toBe(400);
      expect((await statusOf(id))?.status).toBe('pending_review');
    });

    it('本文が上限を超えると 413（payload_too_large）になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });
      const response = await call('POST', `/api/review/${id}/return`, session, {
        reasonCode: 'other',
        freeText: 'a',
        resubmittable: true,
        padding: 'x'.repeat(5000),
      });
      expect(response.status).toBe(413);
      expect(((await response.json()) as { code: string }).code).toBe('payload_too_large');
      expect((await statusOf(id))?.status).toBe('pending_review');
    });

    it('存在しない ID と形式の違う ID は 404 になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      expect((await call('GET', `/api/submissions/${crypto.randomUUID()}/image`, session)).status).toBe(404);
      expect((await call('GET', '/api/submissions/bad-id/image', session)).status).toBe(404);
    });
  });

  describe('状態を変える要求の検査（C1 の Origin）', () => {
    it('別のサイトの Origin からの採用は 403 になります', async () => {
      const session = await newSession();
      await setUpCampaign(session, 2);
      const id = await insertSubmission(session, { status: 'pending_review' });
      const response = await call('POST', `/api/review/${id}/accept`, session, {}, FOREIGN_ORIGIN);
      expect(response.status).toBe(403);
      expect((await statusOf(id))?.status).toBe('pending_review');
    });
  });
});
