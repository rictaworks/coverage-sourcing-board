/// <reference types="vite/client" />
// 注意：Edit scope の test/workers/submissions.test.ts は、workers プロジェクトの対象（*.worker.test.ts）に合わせて改名しました。
import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import templateRaw from '../../data/templates/shikoku-landscape.json?raw';
import svgRaw from '../fixtures/images/sample.svg?raw';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { RULE_DEFAULTS } from '../../src/config/defaults';
import { LIMITS } from '../../src/config/limits';
import { CHECK_ITEM_LABELS } from '../../src/config/strings/checks';
import { BROWSER_CHECK_ITEMS, SUBMISSION_CONFIG } from '../../src/config/submission';
import { SUBMISSION_FORM_FIELDS } from '../../src/core/api/contract';
import { TemplateSeedBuilder, type TemplateDefinition } from '../../src/worker/db/templateSeed';
import { sha256Hex } from '../../src/worker/security/sha256';
import { DEVELOPMENT_WEB_ORIGIN, TEST_BASE_URL, WORKER_TEST_TIMEOUT_MS, testIp } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';
import { app1Exif, app2Icc, buildJpeg, largeScan } from '../helpers/jpegBytes';

interface Session {
  readonly cookie: string;
  readonly hash: string;
}

interface CellInfo {
  readonly cellId: string;
  readonly areaId: string;
  readonly periodId: string;
  readonly required: number;
}

interface CampaignBody {
  readonly id: string;
  readonly areas: { id: string; prefecture: string; label: string }[];
  readonly periods: { id: string; label: string; months: number[] }[];
  readonly cells: CellInfo[];
}

interface SubmissionBody {
  readonly id: string;
  readonly status: string;
  readonly checks: { item: string; verdict: string; reasonCode: string }[];
  readonly subject: { status: string; kind?: string };
}

interface ErrorBody {
  readonly code: string;
  readonly message: string;
  readonly reasons?: { item: string; reasonCode: string }[];
}

/** 投稿の各部品。省略したものは、正しい既定の値を使う。 */
interface SubmissionParts {
  readonly image?: Uint8Array;
  readonly thumb?: Uint8Array;
  readonly meta?: Record<string, unknown> | string;
  readonly honeypot?: string;
}

/** 重複の判定の距離の基準にする、ハッシュの値（16 文字の 16 進）。 */
const HASH_ZERO = '0000000000000000';
/** HASH_ZERO と、ハミング距離 6 の値。 */
const HASH_DISTANCE_6 = '000000000000003f';
/** HASH_ZERO と、ハミング距離 4 の値。 */
const HASH_DISTANCE_4 = '000000000000000f';

const SAVED_LIMIT_BYTES = RULE_DEFAULTS.savedMaxBytes;

function uniqueIp(): string {
  return crypto.randomUUID();
}

/** 16 文字の 16 進のランダムなハッシュ（既存の投稿との距離が近くならないよう、テストごとに別の値にする）。 */
function randomHash(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** テンプレートを D1 に投入する（システム用 ID の行）。何度実行しても行は重複しない。 */
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

/** テンプレートを読み込み、自分のキャンペーンを作る（マスは 84 件）。 */
async function loadCampaign(session: Session): Promise<CampaignBody> {
  const response = await SELF.fetch(`${TEST_BASE_URL}/api/campaign/template`, {
    method: 'POST',
    headers: { cookie: session.cookie, origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': uniqueIp(), 'content-type': 'application/json' },
    body: JSON.stringify({ templateId: CAMPAIGN_API_CONFIG.defaultTemplateId }),
  });
  expect([200, 201]).toContain(response.status);
  return (await response.json()) as CampaignBody;
}

async function countRows(table: 'submission' | 'check_result', sessionHash: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`).bind(sessionHash).first<{ n: number }>();
  return row?.n ?? -1;
}

/** File に渡せる型（ArrayBuffer を持つ配列）にコピーする。 */
function blobPart(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(bytes);
}

/** 通常の JPEG（4:3・1600 × 1200。APP1 なし）。 */
function defaultImage(): Uint8Array {
  return buildJpeg({ width: 1600, height: 1200 });
}

/** 一覧用の縮小 JPEG（512 × 384）。 */
function defaultThumb(): Uint8Array {
  return buildJpeg({ width: 512, height: 384 });
}

/** 申告のすべてが合格の判定結果（ブラウザが送る形）。 */
function passingChecks(): { item: string; verdict: string; reasonCode: string }[] {
  return BROWSER_CHECK_ITEMS.map((item) => ({ item, verdict: 'pass', reasonCode: 'passed' }));
}

function metaFor(cellId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cellId,
    shotMonth: 4,
    spotName: '',
    caption: '',
    declaredOriginal: true,
    consent: true,
    phash: randomHash(),
    checks: passingChecks(),
    ...overrides,
  };
}

/** 投稿（multipart/form-data）を送る。 */
async function postSubmission(session: Session, parts: SubmissionParts, ip: string = uniqueIp()): Promise<Response> {
  const form = new FormData();
  form.set('image', new File([blobPart(parts.image ?? defaultImage())], 'image.jpg', { type: 'image/jpeg' }));
  form.set('thumb', new File([blobPart(parts.thumb ?? defaultThumb())], 'thumb.jpg', { type: 'image/jpeg' }));
  const meta = parts.meta ?? {};
  form.set('meta', typeof meta === 'string' ? meta : JSON.stringify(meta));
  if (parts.honeypot !== undefined) {
    form.set(SUBMISSION_FORM_FIELDS.honeypot, parts.honeypot);
  }
  return SELF.fetch(`${TEST_BASE_URL}/api/submissions`, {
    method: 'POST',
    headers: { cookie: session.cookie, origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': ip },
    body: form,
  });
}

async function postValid(session: Session, cellId: string, overrides: Record<string, unknown> = {}): Promise<Response> {
  return postSubmission(session, { meta: metaFor(cellId, overrides) });
}

/** 同じセッションのマスの 1 つ（期間の既定の順）。 */
function firstCell(campaign: CampaignBody): CellInfo {
  const cell = campaign.cells[0];
  if (cell === undefined) {
    throw new Error('no cell in the template.');
  }
  return cell;
}

async function errorOf(response: Response): Promise<ErrorBody> {
  return (await response.json()) as ErrorBody;
}

describe('投稿の受け取り（POST /api/submissions）：受け入れ条件の順に検証する', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('正しい投稿は 201 で、pending_review の投稿と、判定結果・被写体の推定（補助）を返します', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const response = await postValid(session, firstCell(campaign).cellId);
    expect(response.status).toBe(201);
    const body = (await response.json()) as SubmissionBody;
    expect(body.status).toBe('pending_review');
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.checks.map((check) => check.item)).toEqual(expect.arrayContaining([...BROWSER_CHECK_ITEMS]));
    expect(body.subject.status).toBe('none');
    expect(await countRows('submission', session.hash)).toBe(1);
  });

  it('保存する画像は、送ったバイト列と同じです（再エンコードせず、APP1 を含みません）', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const image = defaultImage();
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    const body = (await response.json()) as SubmissionBody;
    const row = await env.DB.prepare('SELECT image, status, resubmitted_from FROM submission WHERE id = ?')
      .bind(body.id)
      .first<{ image: ArrayBuffer; status: string; resubmitted_from: string | null }>();
    expect(row).not.toBeNull();
    const stored = new Uint8Array(row!.image);
    expect(Array.from(stored)).toEqual(Array.from(image));
    expect(row!.resubmitted_from).toBeNull();
  });

  it('位置情報と機種情報の列は保存しません（submission の列を確かめる）', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    await postValid(session, firstCell(campaign).cellId);
    const columns = await env.DB.prepare("SELECT name FROM pragma_table_info('submission')").all<{ name: string }>();
    const names = columns.results.map((column) => column.name);
    expect(names.some((name) => /lat|lng|gps|device|model|make/i.test(name))).toBe(false);
  });

  it('APP1（EXIF）を含む JPEG は 400（metadata_not_allowed）で、行を増やしません', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const image = buildJpeg({ width: 1600, height: 1200, extraSegments: [app1Exif()] });
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('metadata_not_allowed');
    expect(await countRows('submission', session.hash)).toBe(0);
    expect(await countRows('check_result', session.hash)).toBe(0);
  });

  it('APP2（ICC）を含む JPEG は 400（metadata_not_allowed）で、行を増やしません（許可リスト方式）', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const image = buildJpeg({ width: 1600, height: 1200, extraSegments: [app2Icc()] });
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('metadata_not_allowed');
    expect(await countRows('submission', session.hash)).toBe(0);
    expect(await countRows('check_result', session.hash)).toBe(0);
  });

  it('EOI の後ろに余分なバイトがある JPEG は 400（trailing_bytes）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const image = buildJpeg({ width: 1600, height: 1200, trailing: [0x00] });
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('trailing_bytes');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('SVG を送ると 400（unsupported_image）で、行を増やしません', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const image = new TextEncoder().encode(svgRaw);
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('unsupported_image');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('縦向きの画像は 400（submission_rejected）で、理由の orientation_portrait を返します', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const image = buildJpeg({ width: 1200, height: 1600 });
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    const body = await errorOf(response);
    expect(body.code).toBe('submission_rejected');
    expect(body.reasons).toEqual(expect.arrayContaining([{ item: 'orientation_ratio', reasonCode: 'orientation_portrait' }]));
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('比率が 4:3 から外れた画像（1.40）は 400（submission_rejected）で、理由の ratio_out_of_range を返します', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const image = buildJpeg({ width: 1400, height: 1000 });
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    const body = await errorOf(response);
    expect(body.code).toBe('submission_rejected');
    expect(body.reasons).toEqual(expect.arrayContaining([{ item: 'orientation_ratio', reasonCode: 'ratio_out_of_range' }]));
  });

  it('短辺が受入条件の最小短辺（800 px）未満の画像は 400（submission_rejected）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const image = buildJpeg({ width: 640, height: 480 });
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    const body = await errorOf(response);
    expect(body.code).toBe('submission_rejected');
    expect(body.reasons).toEqual(expect.arrayContaining([{ item: 'resolution', reasonCode: 'short_side_too_small' }]));
  });

  it('長辺が 1,600 px を超える画像（1,601 px）は 400（invalid_request）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const image = buildJpeg({ width: 1601, height: 1201 });
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('invalid_request');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('保存用の JPEG が 1,900,000 バイトを超えると 400（invalid_request）です（1,900,001 バイト）', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const base = buildJpeg({ width: 1600, height: 1200, scan: [] }).length;
    const image = buildJpeg({ width: 1600, height: 1200, scan: largeScan(SAVED_LIMIT_BYTES + 1 - base) });
    expect(image.length).toBe(SAVED_LIMIT_BYTES + 1);
    const response = await postSubmission(session, { image, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('invalid_request');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('縮小 JPEG（分類用）が長辺 512 px を超えると 400（invalid_request）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const thumb = buildJpeg({ width: 1024, height: 768 });
    const response = await postSubmission(session, { thumb, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('invalid_request');
  });

  it('縮小 JPEG が分類用の上限（150,000 バイト）を超えると 400（invalid_request）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const base = buildJpeg({ width: 512, height: 384, scan: [] }).length;
    const thumb = buildJpeg({ width: 512, height: 384, scan: largeScan(LIMITS.classifyImageMaxBytes + 1 - base) });
    const response = await postSubmission(session, { thumb, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('invalid_request');
  });

  it('要求の本文が上限（bodyMaxBytes）を超えると 413（payload_too_large）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const thumb = new Uint8Array(SUBMISSION_CONFIG.bodyMaxBytes);
    const response = await postSubmission(session, { thumb, meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(413);
    expect((await errorOf(response)).code).toBe('payload_too_large');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('multipart/form-data 以外の本文は 400（invalid_request）です', async () => {
    const session = await newSession();
    const response = await SELF.fetch(`${TEST_BASE_URL}/api/submissions`, {
      method: 'POST',
      headers: { cookie: session.cookie, origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': uniqueIp(), 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('invalid_request');
  });

  it('ハニーポット欄に値があれば 400（invalid_request）で、理由は返しません', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const response = await postSubmission(session, { honeypot: 'spam', meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(400);
    const body = await errorOf(response);
    expect(body.code).toBe('invalid_request');
    expect(body.reasons).toBeUndefined();
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('ハニーポット欄が空の値なら、通常どおり受け付けます', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const response = await postSubmission(session, { honeypot: '', meta: metaFor(firstCell(campaign).cellId) });
    expect(response.status).toBe(201);
  });

  it('申告（オリジナル・同意）が false なら 400（declaration_required）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const response = await postValid(session, firstCell(campaign).cellId, { declaredOriginal: false });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('declaration_required');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('撮影月が 1〜12 の範囲外、または地点名が 20 字を超えると 400（invalid_request）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = firstCell(campaign).cellId;
    const badMonth = await postValid(session, cellId, { shotMonth: 13 });
    expect(badMonth.status).toBe(400);
    expect((await errorOf(badMonth)).code).toBe('invalid_request');
    const longSpot = await postValid(session, cellId, { spotName: 'a'.repeat(LIMITS.spotNameMaxChars + 1) });
    expect(longSpot.status).toBe(400);
    expect((await errorOf(longSpot)).code).toBe('invalid_request');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('説明文が 60 字を超えると 400（invalid_request）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const response = await postValid(session, firstCell(campaign).cellId, { caption: 'a'.repeat(LIMITS.captionMaxChars + 1) });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('invalid_request');
  });

  it('他のセッションのマスの ID を指定すると 400（invalid_request）で、保存しません', async () => {
    const owner = await newSession();
    const other = await newSession();
    const ownerCampaign = await loadCampaign(owner);
    await loadCampaign(other);
    const response = await postValid(other, firstCell(ownerCampaign).cellId);
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('invalid_request');
    expect(await countRows('submission', other.hash)).toBe(0);
  });

  it('募集が終わったマス（採用数が必要数以上）への投稿は 409（cell_closed）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = firstCell(campaign).cellId;
    await env.DB.prepare('UPDATE cell SET required = 0 WHERE id = ? AND session_id = ?').bind(cellId, session.hash).run();
    const response = await postValid(session, cellId);
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe('cell_closed');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('ブラウザの判定結果に不合格が 1 つでもあれば 400（submission_rejected）で、保存しません', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const checks = passingChecks().map((check) =>
      check.item === 'focus' ? { item: 'focus', verdict: 'fail', reasonCode: 'focus_low' } : check,
    );
    const response = await postValid(session, firstCell(campaign).cellId, { checks });
    expect(response.status).toBe(400);
    const body = await errorOf(response);
    expect(body.code).toBe('submission_rejected');
    expect(body.reasons).toEqual([{ item: 'focus', reasonCode: 'focus_low' }]);
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('ブラウザの判定結果に、知らない項目や Worker だけの項目があれば 400（invalid_request）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = firstCell(campaign).cellId;
    const unknownItem = await postValid(session, cellId, { checks: [{ item: 'no_such_item', verdict: 'pass', reasonCode: 'passed' }] });
    expect(unknownItem.status).toBe(400);
    expect((await errorOf(unknownItem)).code).toBe('invalid_request');
    const serverItem = await postValid(session, cellId, { checks: [{ item: 'duplicate_image', verdict: 'pass', reasonCode: 'passed' }] });
    expect(serverItem.status).toBe(400);
    expect((await errorOf(serverItem)).code).toBe('invalid_request');
  });

  it('同じ画像（距離 0）の 2 回目は 400（submission_rejected）で、理由の duplicate_image_reject を返します', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = firstCell(campaign).cellId;
    const first = await postValid(session, cellId, { phash: HASH_ZERO });
    expect(first.status).toBe(201);
    const second = await postValid(session, cellId, { phash: HASH_ZERO });
    expect(second.status).toBe(400);
    const body = await errorOf(second);
    expect(body.code).toBe('submission_rejected');
    expect(body.reasons).toEqual([{ item: 'duplicate_image', reasonCode: 'duplicate_image_reject' }]);
    expect(await countRows('submission', session.hash)).toBe(1);
  });

  it('距離 4 の同一画像は不合格です（4 以下は不合格）', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = firstCell(campaign).cellId;
    await postValid(session, cellId, { phash: HASH_ZERO });
    const response = await postValid(session, cellId, { phash: HASH_DISTANCE_4 });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('submission_rejected');
  });

  it('距離 6 の投稿は要確認として保存され、判定結果に duplicate_image_review が入ります', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = firstCell(campaign).cellId;
    await postValid(session, cellId, { phash: HASH_ZERO });
    const response = await postValid(session, cellId, { phash: HASH_DISTANCE_6 });
    expect(response.status).toBe(201);
    const body = (await response.json()) as SubmissionBody;
    expect(body.checks).toEqual(expect.arrayContaining([{ item: 'duplicate_image', verdict: 'review', reasonCode: 'duplicate_image_review' }]));
    expect(await countRows('submission', session.hash)).toBe(2);
  });

  it('同じマス・同じ地点名の投稿は要確認（duplicate_spot）として保存されます', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = firstCell(campaign).cellId;
    await postValid(session, cellId, { spotName: 'sample spot' });
    const response = await postValid(session, cellId, { spotName: 'sample spot' });
    expect(response.status).toBe(201);
    const body = (await response.json()) as SubmissionBody;
    expect(body.checks).toEqual(expect.arrayContaining([{ item: 'duplicate_spot', verdict: 'review', reasonCode: 'duplicate_spot_review' }]));
  });

  it('同じ地点名でも季節（期間）が違えば、同一地点としては扱いません', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const first = firstCell(campaign);
    const otherPeriod = campaign.cells.find((cell) => cell.areaId === first.areaId && cell.periodId !== first.periodId);
    expect(otherPeriod).toBeDefined();
    await postValid(session, first.cellId, { spotName: 'sample spot' });
    const response = await postValid(session, otherPeriod!.cellId, { spotName: 'sample spot', shotMonth: 1 });
    expect(response.status).toBe(201);
    const body = (await response.json()) as SubmissionBody;
    expect(body.checks).toEqual(expect.arrayContaining([{ item: 'duplicate_spot', verdict: 'pass', reasonCode: 'passed' }]));
  });

  it('地点名が空欄なら、同一地点の判定を行いません（duplicate_spot の行はありません）', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = firstCell(campaign).cellId;
    await postValid(session, cellId, { spotName: '' });
    const response = await postValid(session, cellId, { spotName: '' });
    const body = (await response.json()) as SubmissionBody;
    expect(body.checks.some((check) => check.item === 'duplicate_spot')).toBe(false);
  });

  it('同じ画像でも、別のセッションの投稿とは比べません（セッションの隔離）', async () => {
    const owner = await newSession();
    const other = await newSession();
    const ownerCampaign = await loadCampaign(owner);
    const otherCampaign = await loadCampaign(other);
    await postValid(owner, firstCell(ownerCampaign).cellId, { phash: HASH_ZERO });
    const response = await postValid(other, firstCell(otherCampaign).cellId, { phash: HASH_ZERO });
    expect(response.status).toBe(201);
  });

  it('AI のバインディングが無い環境でも保存されます。被写体の推定は「推定なし」で、check_result に info の行が残ります', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const response = await postValid(session, firstCell(campaign).cellId);
    expect(response.status).toBe(201);
    const body = (await response.json()) as SubmissionBody;
    expect(body.subject.status).toBe('none');
    const row = await env.DB.prepare(
      "SELECT verdict, reason FROM check_result WHERE submission_id = ? AND item = 'subject_kind'",
    )
      .bind(body.id)
      .first<{ verdict: string; reason: string }>();
    expect(row).toEqual({ verdict: 'info', reason: 'none' });
  });

  it('判定結果の行（ブラウザの判定・重複・被写体）は、投稿と同じ 1 回の保存で入ります', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const response = await postValid(session, firstCell(campaign).cellId, { spotName: 'sample spot' });
    const body = (await response.json()) as SubmissionBody;
    const rows = await env.DB.prepare('SELECT item, verdict FROM check_result WHERE submission_id = ?')
      .bind(body.id)
      .all<{ item: string; verdict: string }>();
    const items = rows.results.map((row) => row.item);
    for (const item of BROWSER_CHECK_ITEMS) {
      expect(items).toContain(item);
    }
    expect(items).toEqual(expect.arrayContaining(['duplicate_image', 'duplicate_spot', 'subject_kind']));
    expect(rows.results.find((row) => row.item === 'subject_kind')?.verdict).toBe('info');
  });

  it('返された投稿を再投稿できます（returned・再投稿可能なら 201 で、元の ID を resubmitted_from に残します）', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const cellId = firstCell(campaign).cellId;
    const original = (await (await postValid(session, cellId)).json()) as SubmissionBody;
    await env.DB.prepare("UPDATE submission SET status = 'returned' WHERE id = ?").bind(original.id).run();
    await env.DB.prepare(
      "INSERT INTO review (id, session_id, submission_id, decision, reason, resubmittable) VALUES (?, ?, ?, 'return', 'other', 1)",
    )
      .bind(crypto.randomUUID(), session.hash, original.id)
      .run();
    const response = await postValid(session, cellId, { resubmittedFrom: original.id });
    expect(response.status).toBe(201);
    const body = (await response.json()) as SubmissionBody;
    const row = await env.DB.prepare('SELECT resubmitted_from FROM submission WHERE id = ?').bind(body.id).first<{ resubmitted_from: string }>();
    expect(row?.resubmitted_from).toBe(original.id);
  });

  it('再投稿できない投稿、または他のセッションの投稿を元にすると 409（invalid_state）です', async () => {
    const session = await newSession();
    const other = await newSession();
    const campaign = await loadCampaign(session);
    const otherCampaign = await loadCampaign(other);
    const cellId = firstCell(campaign).cellId;
    const original = (await (await postValid(session, cellId)).json()) as SubmissionBody;
    const pending = await postValid(session, cellId, { resubmittedFrom: original.id });
    expect(pending.status).toBe(409);
    expect((await errorOf(pending)).code).toBe('invalid_state');
    const foreign = (await (await postValid(other, firstCell(otherCampaign).cellId)).json()) as SubmissionBody;
    await env.DB.prepare("UPDATE submission SET status = 'returned' WHERE id = ?").bind(foreign.id).run();
    const crossSession = await postValid(session, cellId, { resubmittedFrom: foreign.id });
    expect(crossSession.status).toBe(409);
    expect((await errorOf(crossSession)).code).toBe('invalid_state');
  });

  it('CHECK_ITEM_LABELS の項目は、ブラウザの項目と Worker の項目（重複・被写体）に分かれて、すべて含まれます', () => {
    const serverItems = ['duplicate_image', 'duplicate_spot', 'subject_kind'];
    const all = Object.keys(CHECK_ITEM_LABELS).sort();
    expect([...BROWSER_CHECK_ITEMS, ...serverItems].sort()).toEqual(all);
  });
});

describe('投稿の受け取り：判定項目の確認と、季節と撮影月の整合', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('ブラウザの判定項目が 1 つでも欠けていれば 400（invalid_request）で、保存しません', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const checks = passingChecks().filter((check) => check.item !== 'declaration');
    const response = await postValid(session, firstCell(campaign).cellId, { checks });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('invalid_request');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('同じ判定項目が重複していても、400（invalid_request）です', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const checks = [...passingChecks(), { item: 'focus', verdict: 'pass', reasonCode: 'passed' }];
    const response = await postValid(session, firstCell(campaign).cellId, { checks });
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('invalid_request');
    expect(await countRows('submission', session.hash)).toBe(0);
  });

  it('撮影月から導出した季節がマスの季節と違うときは、不合格ではなく要確認（shoot_month_season）で保存します', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const spring = campaign.periods.find((period) => period.months.includes(4));
    const cell = campaign.cells.find((entry) => entry.periodId === spring?.id);
    expect(cell).toBeDefined();
    const response = await postValid(session, cell!.cellId, { shotMonth: 8 });
    expect(response.status).toBe(201);
    const body = (await response.json()) as SubmissionBody;
    expect(body.checks.filter((check) => check.item === 'shoot_month_season')).toEqual([
      { item: 'shoot_month_season', verdict: 'review', reasonCode: 'shoot_month_mismatch' },
    ]);
    const stored = await env.DB.prepare("SELECT verdict, reason FROM check_result WHERE submission_id = ? AND item = 'shoot_month_season'")
      .bind(body.id)
      .all<{ verdict: string; reason: string }>();
    expect(stored.results).toEqual([{ verdict: 'review', reason: 'shoot_month_mismatch' }]);
  });

  it('撮影月がマスの季節に含まれるときは、判定を変えません（pass のまま）', async () => {
    const session = await newSession();
    const campaign = await loadCampaign(session);
    const spring = campaign.periods.find((period) => period.months.includes(4));
    const cell = campaign.cells.find((entry) => entry.periodId === spring?.id);
    const response = await postValid(session, cell!.cellId, { shotMonth: 4 });
    expect(response.status).toBe(201);
    const body = (await response.json()) as SubmissionBody;
    expect(body.checks.find((check) => check.item === 'shoot_month_season')?.verdict).toBe('pass');
  });
});
