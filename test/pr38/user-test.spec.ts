import { randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { BROWSER_CHECK_ITEMS } from '../../src/config/submission';
import { PAGE_NAMES, PAGE_TITLES } from '../../src/config/strings/layout';
import { MINE_STRINGS, MINE_SUBMIT_LINK } from '../../src/config/strings/mine';
import { RETURN_REASON_LABELS } from '../../src/config/strings/returnReasons';
import { STATUS_LABELS, STATUS_NOTICES } from '../../src/config/strings/status';
import { type CampaignResponse } from '../../src/core/api/contract';
import { buildJpeg } from '../helpers/jpegBytes';

/**
 * PR #38（Issue #18、D5 自分の投稿の画面）のユーザーテスト手順を、開発サーバーに対して検査します。
 * 対象は http://localhost:3000（画面）と、同一オリジンの /api/（開発の Workers）だけです。本番には接続しません。
 * 手順の順番は PR 本文「ユーザーテスト手順」の 1〜5 に従います。
 * 投稿と判定は、テストの前提を作るために API（同一オリジンの /api/）を呼びます。投稿の画面（/submit）の操作は含みません。
 * 文言は src/config から読み、テストの中に直書きしません。
 */
const FRONT_URL = 'http://localhost:3000';
const MINE_URL = `${FRONT_URL}/mine`;
const SUBMIT_URL = `${FRONT_URL}${MINE_SUBMIT_LINK.path}`;
const SCRIPT_TEXT = '<script>alert(1)</script>';

/** 投稿の上限（レート制限）を避けるため、要求ごとに別の接続元の値を使います。状態を変える要求は Origin が必要です。 */
const uniqueIp = (): string => Buffer.from(randomBytes(8)).toString('hex');
const ipHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  origin: FRONT_URL,
  'cf-connecting-ip': uniqueIp(),
  ...extra,
});
/** 重複の判定を避けるため、要求ごとにランダムなハッシュを使います。 */
const randomPhash = (): string => Buffer.from(randomBytes(8)).toString('hex');

/** 新しいセッションを作り、テンプレートを読み込んで、先頭のマスの ID と撮影月を返します。 */
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

/** 投稿を 1 件作り、ID を返します。判定はブラウザが送る項目をすべて合格にします（確認待ちになります）。 */
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

/** 投稿を採用（デモ）にします。 */
async function acceptSubmission(request: APIRequestContext, id: string): Promise<void> {
  const response = await request.post(`${FRONT_URL}/api/review/${id}/accept`, {
    headers: ipHeaders({ 'content-type': 'application/json' }),
    data: { confirmOverQuota: false },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** 投稿を差し戻します。 */
async function returnSubmission(
  request: APIRequestContext,
  id: string,
  options: { readonly reasonCode: string; readonly freeText: string; readonly resubmittable: boolean },
): Promise<void> {
  const response = await request.post(`${FRONT_URL}/api/review/${id}/return`, {
    headers: ipHeaders({ 'content-type': 'application/json' }),
    data: options,
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** ページ全体の横のはみ出し（px）。0 以下なら横のスクロールは起きていません。 */
async function pageOverflowOf(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('PR #38 ユーザーテスト手順（自分の投稿の画面）', () => {
  test('手順 1：http://localhost:3000/mine を開くと、画面が表示される', async ({ page }) => {
    const response = await page.goto(MINE_URL);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(PAGE_TITLES.mine);
    await expect(page.getByRole('heading', { level: 1, name: PAGE_NAMES.mine })).toBeVisible();
  });

  test('手順 2：投稿が無いときは、「投稿はまだありません。」と出る', async ({ page }) => {
    await page.request.get(`${FRONT_URL}/api/session`, { headers: ipHeaders() });
    await page.goto(MINE_URL);
    await expect(page.getByText(MINE_STRINGS.empty, { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: MINE_STRINGS.emptyLinkLabel })).toHaveAttribute(
      'href',
      MINE_SUBMIT_LINK.path,
    );
  });

  test('手順 3：投稿した後に開き直すと、一覧に状態（確認待ち）が文字で出る', async ({ page }) => {
    await createSubmission(page.request, { spotName: 'Pr38 step3 spot', caption: 'Pr38 step3 caption' });
    await page.goto(MINE_URL);
    await page.reload();
    const list = page.getByRole('list', { name: MINE_STRINGS.listLabel });
    await expect(list.getByText(STATUS_LABELS.pending_review, { exact: true })).toBeVisible();
    await expect(list.getByText('Pr38 step3 spot')).toBeVisible();
  });

  test('手順 4：採用（デモ）の項目に「実際の買取や権利の移転は行いません。」と出る', async ({ page }) => {
    const id = await createSubmission(page.request, { spotName: 'Pr38 accepted spot', caption: '' });
    await acceptSubmission(page.request, id);
    await page.goto(MINE_URL);
    await expect(page.getByText(STATUS_LABELS.accepted, { exact: true })).toBeVisible();
    await expect(page.getByText(STATUS_NOTICES.noRealTransaction)).toBeVisible();
  });

  test('手順 5：再投稿できる差し戻しには「再投稿する」が出て、投稿の画面へ移れる', async ({ page }) => {
    const id = await createSubmission(page.request, { spotName: 'Pr38 returned spot', caption: '' });
    await returnSubmission(page.request, id, { reasonCode: 'other', freeText: SCRIPT_TEXT, resubmittable: true });
    await page.goto(MINE_URL);

    await expect(page.getByText(STATUS_LABELS.returned, { exact: true })).toBeVisible();
    await expect(page.getByText(RETURN_REASON_LABELS.other, { exact: true })).toBeVisible();
    await expect(page.getByText(SCRIPT_TEXT, { exact: true })).toBeVisible();

    const link = page.getByRole('link', { name: MINE_STRINGS.resubmitLabel });
    await expect(link).toHaveAttribute('href', `${MINE_SUBMIT_LINK.path}?${MINE_SUBMIT_LINK.resubmitParam}=${id}`);
    await link.click();
    await expect(page).toHaveURL(`${SUBMIT_URL}?${MINE_SUBMIT_LINK.resubmitParam}=${id}`);
  });

  test('手順 5：再投稿できない差し戻しには「再投稿する」が出ず、「この投稿は再投稿できません。」と出る', async ({ page }) => {
    const id = await createSubmission(page.request, { spotName: 'Pr38 no resubmit', caption: '' });
    await returnSubmission(page.request, id, { reasonCode: 'subject', freeText: '', resubmittable: false });
    await page.goto(MINE_URL);

    await expect(page.getByText(RETURN_REASON_LABELS.subject, { exact: true })).toBeVisible();
    await expect(page.getByText(MINE_STRINGS.resubmitUnavailable)).toBeVisible();
    await expect(page.getByRole('link', { name: MINE_STRINGS.resubmitLabel })).toHaveCount(0);
  });

  test('参考：375 px の幅でも、ページ全体の横のスクロールは起きない', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await createSubmission(page.request, { spotName: 'Pr38 width spot', caption: '' });
    await page.goto(MINE_URL);
    await expect(page.getByRole('list', { name: MINE_STRINGS.listLabel })).toBeVisible();
    expect(await pageOverflowOf(page)).toBeLessThanOrEqual(0);
  });
});
