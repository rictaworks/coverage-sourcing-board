import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type APIResponse } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { BROWSER_CHECK_ITEMS } from '../../src/config/submission';
import { SUBMISSION_FORM_FIELDS } from '../../src/core/api/contract';
import { buildJpeg } from '../helpers/jpegBytes';

/**
 * PR #37（Issue #10、C3 投稿の受け取りと検証の API）のユーザーテストを実行する。
 * 画面の変更はないため、ブラウザでは http://localhost:3000 の表示が変わらないことを確かめ、
 * API の経路（POST /api/submissions）は開発の Workers（http://localhost:8787）に対して request API で確かめる。
 * 対象は開発サーバーだけです。本番の URL には接続しません。
 */
const FRONT_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8787';
/** 状態を変える要求は Origin が必要（開発では http://localhost:3000 を許可）。 */
const ORIGIN_HEADER = { origin: FRONT_URL };
const SVG_URL = new URL('../fixtures/images/sample.svg', import.meta.url);
/** 投稿の上限（レート制限）を避けるため、要求ごとに別の接続元の値を使う。 */
const uniqueIp = (): string => randomBytes(8).toString('hex');

interface CellInfo {
  readonly cellId: string;
  readonly periodId: string;
}

interface CampaignBody {
  readonly periods: readonly { id: string; months: readonly number[] }[];
  readonly cells: readonly CellInfo[];
}

interface SubmissionBody {
  readonly id: string;
  readonly status: string;
  readonly checks: readonly { item: string; verdict: string; reasonCode: string }[];
  readonly subject: { status: string };
}

interface ErrorBody {
  readonly code: string;
  readonly message: string;
}

/** セッションの Cookie（csid）を、最初の応答の Set-Cookie から取り出す。Cookie の値はログに出さない。 */
function sessionCookieFrom(response: APIResponse): string {
  const setCookie = response.headers()['set-cookie'] ?? '';
  const match = /csid=([^;]+)/.exec(setCookie);
  expect(match, 'Set-Cookie must contain csid').not.toBeNull();
  return `csid=${match?.[1] ?? ''}`;
}

/** 新しいセッションを作り、テンプレートを読み込んで、キャンペーンを返す。 */
async function openCampaign(request: import('@playwright/test').APIRequestContext): Promise<{ cookie: string; campaign: CampaignBody }> {
  const session = await request.get(`${API_URL}/api/session`, { headers: ORIGIN_HEADER });
  expect(session.status()).toBe(200);
  const cookie = sessionCookieFrom(session);
  const loaded = await request.post(`${API_URL}/api/campaign/template`, {
    headers: { ...ORIGIN_HEADER, cookie, 'content-type': 'application/json' },
    data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
  });
  expect([200, 201]).toContain(loaded.status());
  const campaign = (await loaded.json()) as CampaignBody;
  return { cookie, campaign };
}

/** 正しい投稿の判定（ブラウザが送る 10 項目すべての合格）。 */
function passingChecks(): { item: string; verdict: string; reasonCode: string }[] {
  return BROWSER_CHECK_ITEMS.map((item) => ({ item, verdict: 'pass', reasonCode: 'passed' }));
}

/** 16 文字の 16 進のハッシュ（既存の投稿と近くならないよう、要求ごとにランダムにする）。 */
function randomPhash(): string {
  return randomBytes(8).toString('hex');
}

test.describe('PR #37 ユーザーテスト手順（投稿の受け取りと検証の API）', () => {
  test('手順 1：http://localhost:3000 の表示が変わらない（トップのタイトルと本文）', async ({ page }) => {
    const response = await page.goto(`${FRONT_URL}/`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(APP_STRINGS.pageTitle);
    await expect(page.locator('body')).toBeVisible();
  });

  test('手順 2：開発の API が起動している（GET /api/health が 200）', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/health`);
    expect(response.status()).toBe(200);
  });

  test('手順 3：ハニーポット欄に値があると、投稿は 400（invalid_request）で拒否される', async ({ request }) => {
    const { cookie, campaign } = await openCampaign(request);
    const cellId = campaign.cells[0]?.cellId ?? '';
    expect(cellId.length).toBeGreaterThan(0);

    const response = await request.post(`${API_URL}/api/submissions`, {
      headers: { ...ORIGIN_HEADER, cookie, 'cf-connecting-ip': uniqueIp() },
      multipart: {
        image: { name: 'image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buildJpeg({ width: 1600, height: 1200 })) },
        thumb: { name: 'thumb.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buildJpeg({ width: 512, height: 384 })) },
        meta: JSON.stringify({ cellId, shotMonth: 4, spotName: '', caption: '', declaredOriginal: true, consent: true, phash: randomPhash(), checks: passingChecks() }),
        [SUBMISSION_FORM_FIELDS.honeypot]: 'spam',
      },
    });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe('invalid_request');
  });

  test('手順 4：JPEG でないもの（SVG）を画像にすると、投稿は 400 で拒否される', async ({ request }) => {
    const { cookie, campaign } = await openCampaign(request);
    const cellId = campaign.cells[0]?.cellId ?? '';

    const response = await request.post(`${API_URL}/api/submissions`, {
      headers: { ...ORIGIN_HEADER, cookie, 'cf-connecting-ip': uniqueIp() },
      multipart: {
        image: { name: 'image.svg', mimeType: 'image/svg+xml', buffer: readFileSync(SVG_URL) },
        thumb: { name: 'thumb.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buildJpeg({ width: 512, height: 384 })) },
        meta: JSON.stringify({ cellId, shotMonth: 4, spotName: '', caption: '', declaredOriginal: true, consent: true, phash: randomPhash(), checks: passingChecks() }),
      },
    });
    expect(response.status()).toBe(400);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe('unsupported_image');
  });

  test('手順 5：正しい JPEG と判定 10 項目がそろった投稿は 201 で、pending_review として保存される', async ({ request }) => {
    const { cookie, campaign } = await openCampaign(request);
    const cell = campaign.cells[0];
    expect(cell).toBeDefined();
    const period = campaign.periods.find((entry) => entry.id === cell?.periodId);
    const shotMonth = period?.months[0] ?? 4;

    const response = await request.post(`${API_URL}/api/submissions`, {
      headers: { ...ORIGIN_HEADER, cookie, 'cf-connecting-ip': uniqueIp() },
      multipart: {
        image: { name: 'image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buildJpeg({ width: 1600, height: 1200 })) },
        thumb: { name: 'thumb.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buildJpeg({ width: 512, height: 384 })) },
        meta: JSON.stringify({
          cellId: cell?.cellId,
          shotMonth,
          spotName: '',
          caption: '',
          declaredOriginal: true,
          consent: true,
          phash: randomPhash(),
          checks: passingChecks(),
        }),
      },
    });
    expect(response.status()).toBe(201);
    const body = (await response.json()) as SubmissionBody;
    expect(body.status).toBe('pending_review');
    expect(body.id.length).toBeGreaterThan(0);
    expect(body.checks.map((check) => check.item)).toEqual(expect.arrayContaining([...BROWSER_CHECK_ITEMS]));
  });
});
