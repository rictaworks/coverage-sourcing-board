import { randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { BROWSER_CHECK_ITEMS } from '../../src/config/submission';
import { MINE_STRINGS, MINE_SUBMIT_LINK } from '../../src/config/strings/mine';
import { RETURN_REASON_LABELS } from '../../src/config/strings/returnReasons';
import { STATUS_LABELS, STATUS_NOTICES } from '../../src/config/strings/status';
import { SUBMISSION_FORM_FIELDS, type CampaignResponse } from '../../src/core/api/contract';
import { buildJpeg } from '../helpers/jpegBytes';

/**
 * 自分の投稿の画面（D5、Issue #18）のブラウザでの確認。対象は開発サーバー（http://localhost:3000）だけです。
 * 投稿と差し戻しは、開発の API を同一オリジンの /api/ 経由で呼んで作ります（セッションの Cookie を共有）。
 * ログインはありません。各テストは新しいブラウザのコンテキストで、新しいセッションを使います。
 */
const FRONT_URL = 'http://localhost:3000';
const MINE_URL = `${FRONT_URL}/mine`;
const MOBILE_VIEWPORT = { width: 375, height: 812 };
const SCRIPT_TEXT = '<script>alert(1)</script>';

/** 投稿の上限（レート制限）を避けるため、要求ごとに別の接続元の値を使う。状態を変える要求は Origin が必要。 */
const uniqueIp = (): string => Buffer.from(randomBytes(8)).toString('hex');
const ipHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  origin: FRONT_URL,
  'cf-connecting-ip': uniqueIp(),
  ...extra,
});
/** 重複の判定を避けるため、要求ごとにランダムなハッシュを使う。 */
const randomPhash = (): string => Buffer.from(randomBytes(8)).toString('hex');

/** 新しいセッションを作り、テンプレートを読み込んで、先頭のマスの ID と撮影月を返す。 */
async function startSession(request: APIRequestContext): Promise<{ cellId: string; shotMonth: number }> {
  const session = await request.get(`${FRONT_URL}/api/session`, { headers: ipHeaders() });
  expect(session.status()).toBe(200);
  const loaded = await request.post(`${FRONT_URL}/api/campaign/template`, {
    headers: ipHeaders({ 'content-type': 'application/json' }),
    data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
  });
  expect([200, 201]).toContain(loaded.status());
  const campaign = (await loaded.json()) as CampaignResponse & { cells: { cellId: string; periodId: string }[] };
  const cell = campaign.cells[0];
  expect(cell).toBeDefined();
  const period = campaign.periods.find((entry) => entry.id === cell?.periodId);
  return { cellId: cell?.cellId ?? '', shotMonth: period?.months[0] ?? 4 };
}

/** 投稿を 1 件作り、ID を返す。判定は、ブラウザが送る項目をすべて合格にする（pending_review になる）。 */
async function createSubmission(
  request: APIRequestContext,
  options: { readonly spotName: string; readonly caption: string },
): Promise<string> {
  const { cellId, shotMonth } = await startSession(request);
  const response = await request.post(`${FRONT_URL}/api/submissions`, {
    headers: ipHeaders(),
    multipart: {
      image: { name: 'image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buildJpeg({ width: 1600, height: 1200 })) },
      thumb: { name: 'thumb.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buildJpeg({ width: 512, height: 384 })) },
      meta: JSON.stringify({
        cellId,
        shotMonth,
        spotName: options.spotName,
        caption: options.caption,
        declaredOriginal: true,
        consent: true,
        phash: randomPhash(),
        checks: BROWSER_CHECK_ITEMS.map((item) => ({ item, verdict: 'pass', reasonCode: 'passed' })),
      }),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { id: string };
  return body.id;
}

/** 投稿を差し戻します（同じセッションの投稿に対して）。 */
async function returnSubmission(
  request: APIRequestContext,
  id: string,
  options: { readonly reasonCode: string; readonly freeText: string; readonly resubmittable: boolean },
): Promise<void> {
  const response = await request.post(`${FRONT_URL}/api/review/${id}/return`, {
    headers: ipHeaders({ 'content-type': 'application/json' }),
    data: options,
  });
  expect(response.status()).toBe(200);
}

test('投稿が無いときは、投稿の画面への案内を表示します', async ({ page }) => {
  await page.request.get(`${FRONT_URL}/api/session`, { headers: ipHeaders() });
  await page.goto(MINE_URL);
  await expect(page.getByText(MINE_STRINGS.empty)).toBeVisible();
  await expect(page.getByRole('link', { name: MINE_STRINGS.emptyLinkLabel })).toHaveAttribute(
    'href',
    MINE_SUBMIT_LINK.path,
  );
});

test('確認待ちの投稿は、状態の文字と地点名・説明文が表示され、再投稿の導線は出ません', async ({ page }) => {
  await createSubmission(page.request, { spotName: 'Naruto coast', caption: 'Morning coast caption' });
  await page.goto(MINE_URL);
  const list = page.getByRole('list', { name: MINE_STRINGS.listLabel });
  await expect(list.getByText(STATUS_LABELS.pending_review, { exact: true })).toBeVisible();
  await expect(list.getByText('Naruto coast')).toBeVisible();
  await expect(list.getByText('Morning coast caption')).toBeVisible();
  await expect(page.getByRole('link', { name: MINE_STRINGS.resubmitLabel })).toHaveCount(0);
});

test('採用（デモ）の投稿には、実際の買取や権利の移転は行わない旨を表示します', async ({ page }) => {
  const id = await createSubmission(page.request, { spotName: 'Accepted spot', caption: '' });
  const accepted = await page.request.post(`${FRONT_URL}/api/review/${id}/accept`, {
    headers: ipHeaders({ 'content-type': 'application/json' }),
    data: { confirmOverQuota: false },
  });
  expect(accepted.status()).toBe(200);
  await page.goto(MINE_URL);
  await expect(page.getByText(STATUS_LABELS.accepted, { exact: true })).toBeVisible();
  await expect(page.getByText(STATUS_NOTICES.noRealTransaction)).toBeVisible();
});

test('再投稿できる差し戻しは、理由と自由記述を表示し、再投稿のリンクを出します', async ({ page }) => {
  const id = await createSubmission(page.request, { spotName: 'Returned spot', caption: '' });
  await returnSubmission(page.request, id, { reasonCode: 'other', freeText: SCRIPT_TEXT, resubmittable: true });
  await page.goto(MINE_URL);

  await expect(page.getByText(STATUS_LABELS.returned, { exact: true })).toBeVisible();
  await expect(page.getByText(RETURN_REASON_LABELS.other, { exact: true })).toBeVisible();
  // 自由記述は文字として描画されます（スクリプトは動かず、そのまま見えます）。
  await expect(page.getByText(SCRIPT_TEXT, { exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: MINE_STRINGS.resubmitLabel });
  await expect(link).toHaveAttribute('href', `${MINE_SUBMIT_LINK.path}?${MINE_SUBMIT_LINK.resubmitParam}=${id}`);
});

test('再投稿できない差し戻しは、リンクを出さず、その旨を文字で示します', async ({ page }) => {
  const id = await createSubmission(page.request, { spotName: 'Not resubmittable', caption: '' });
  await returnSubmission(page.request, id, { reasonCode: 'subject', freeText: '', resubmittable: false });
  await page.goto(MINE_URL);

  await expect(page.getByText(RETURN_REASON_LABELS.subject, { exact: true })).toBeVisible();
  await expect(page.getByText(MINE_STRINGS.resubmitUnavailable)).toBeVisible();
  await expect(page.getByRole('link', { name: MINE_STRINGS.resubmitLabel })).toHaveCount(0);
});

test('説明文に含まれる script は、文字のまま表示されます', async ({ page }) => {
  await createSubmission(page.request, { spotName: 'Spot', caption: SCRIPT_TEXT });
  await page.goto(MINE_URL);
  await expect(page.getByText(SCRIPT_TEXT, { exact: true })).toBeVisible();
});

test('375 px の幅でも、ページ全体の横のスクロールは起きません', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await createSubmission(page.request, { spotName: 'Width check', caption: '' });
  await page.goto(MINE_URL);
  await expect(page.getByRole('list', { name: MINE_STRINGS.listLabel })).toBeVisible();
  const pageOverflow = await pageOverflowOf(page);
  expect(pageOverflow).toBeLessThanOrEqual(0);
});

/** ページ全体の横のはみ出し（px）。0 以下なら横のスクロールは起きていません。 */
async function pageOverflowOf(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
