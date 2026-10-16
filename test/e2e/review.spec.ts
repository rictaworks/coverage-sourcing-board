import { randomBytes } from 'node:crypto';
import { expect, test, type BrowserContext, type APIRequestContext } from '@playwright/test';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { BROWSER_CHECK_ITEMS } from '../../src/config/submission';
import { CHECK_REASON_TEXT } from '../../src/config/strings/checks';
import { PAGE_TITLES } from '../../src/config/strings/layout';
import { REVIEW_QUEUE_STRINGS } from '../../src/config/strings/reviewQueue';
import { RETURN_REASON_LABELS } from '../../src/config/strings/returnReasons';
import { SUBJECT_HINT_STRINGS } from '../../src/config/strings/subjectHint';
import { STATUS_LABELS } from '../../src/config/strings/status';
import { SUBMISSION_FORM_FIELDS } from '../../src/core/api/contract';
import { REVIEW_INPUTS } from '../fixtures/review-inputs';
import { buildJpeg } from '../helpers/jpegBytes';

/**
 * 確認キューの画面（D7、Issue #20）の確認。対象は開発サーバー（http://localhost:3000 と 8787）だけです。
 * 投稿は API（開発の Workers）で作り、画面の操作は画面（3000 番）で行います。
 * テストごとに新しいブラウザのコンテキストを使うため、セッション（Cookie）も毎回新しくなります。
 */
const FRONT_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8787';
const REVIEW_URL = `${FRONT_URL}/review`;
const ORIGIN_HEADER = { origin: FRONT_URL };
const FOCUS_REVIEW = { item: 'focus', verdict: 'review', reasonCode: 'focus_borderline' };

interface CampaignBody {
  readonly name: string;
  readonly acceptRule: unknown;
  readonly periods: readonly { id: string; months: readonly number[] }[];
}

interface CoverageBody {
  readonly cells: readonly { cellId: string; periodId: string; accepted: number; required: number; closed: boolean }[];
}

interface QueueBody {
  readonly items: readonly { id: string }[];
  readonly accepted: readonly { id: string; overQuota: boolean }[];
}

interface MineBody {
  readonly items: readonly { id: string; status: string; returnInfo: { reasonCode: string; resubmittable: boolean } | null }[];
}

/** 要求の uniqueIp（レート制限を避けるため、要求ごとに別の接続元の値を使う）。 */
const uniqueIp = (): string => Buffer.from(randomBytes(8)).toString('hex');

/** 正しい判定の結果（ブラウザが送る 10 項目）。focus だけは要確認にします。 */
function checksWithReview(): { item: string; verdict: string; reasonCode: string }[] {
  return BROWSER_CHECK_ITEMS.map((item) =>
    item === FOCUS_REVIEW.item ? { ...FOCUS_REVIEW } : { item, verdict: 'pass', reasonCode: 'passed' },
  );
}

/** 新しいセッションでキャンペーン（テンプレート・必要数 1）を作り、最初のマスと撮影月を返します。 */
async function prepareCampaign(context: BrowserContext): Promise<{ cellId: string; shotMonth: number }> {
  const request = context.request;
  const session = await request.get(`${API_URL}/api/session`, { headers: ORIGIN_HEADER });
  expect(session.status()).toBe(200);
  const json = { ...ORIGIN_HEADER, 'content-type': 'application/json' };
  const loaded = await request.post(`${API_URL}/api/campaign/template`, {
    headers: json,
    data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
  });
  expect([200, 201]).toContain(loaded.status());
  const campaign = (await loaded.json()) as CampaignBody;
  const updated = await request.put(`${API_URL}/api/campaign`, {
    headers: json,
    data: { name: campaign.name, requiredPerCell: { mode: 'uniform', value: 1 }, acceptRule: campaign.acceptRule },
  });
  expect(updated.status()).toBe(200);
  const coverage = await getJson<CoverageBody>(request, '/api/coverage');
  const cell = coverage.cells[0];
  expect(cell).toBeDefined();
  const period = campaign.periods.find((entry) => entry.id === cell?.periodId);
  expect(period).toBeDefined();
  return { cellId: cell?.cellId ?? '', shotMonth: period?.months[0] ?? 0 };
}

async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`${API_URL}${path}`, { headers: ORIGIN_HEADER });
  expect(response.status()).toBe(200);
  return (await response.json()) as T;
}

/** 投稿を 1 件作ります（同じ地点名の投稿は、同じマスの中で要確認の重複候補になります）。 */
async function submit(context: BrowserContext, cellId: string, shotMonth: number, width: number): Promise<string> {
  const response = await context.request.post(`${API_URL}/api/submissions`, {
    headers: { ...ORIGIN_HEADER, 'cf-connecting-ip': uniqueIp() },
    multipart: {
      image: { name: 'image.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buildJpeg({ width, height: Math.round((width * 3) / 4) })) },
      thumb: { name: 'thumb.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(buildJpeg({ width: 512, height: 384 })) },
      meta: JSON.stringify({
        cellId,
        shotMonth,
        spotName: REVIEW_INPUTS.spotName,
        caption: REVIEW_INPUTS.caption,
        declaredOriginal: true,
        consent: true,
        phash: Buffer.from(randomBytes(8)).toString('hex'),
        checks: checksWithReview(),
      }),
      [SUBMISSION_FORM_FIELDS.honeypot]: '',
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { id: string; status: string };
  expect(body.status).toBe('pending_review');
  return body.id;
}

/** 採用を API で行います（取り消しの確認のための前提）。 */
async function acceptByApi(context: BrowserContext, id: string): Promise<void> {
  const response = await context.request.post(`${API_URL}/api/review/${id}/accept`, {
    headers: { ...ORIGIN_HEADER, 'content-type': 'application/json' },
    data: {},
  });
  expect(response.status()).toBe(200);
}

test.describe('確認キュー（D7）', () => {
  test('一覧に、要確認の理由・被写体の推定（開発では「被写体の推定はありません」）・重複候補が出て、幅 375 px でも横にはみ出しません', async ({ context, page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    const { cellId, shotMonth } = await prepareCampaign(context);
    const first = await submit(context, cellId, shotMonth, 1600);
    await submit(context, cellId, shotMonth, 1200);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(REVIEW_URL);
    await expect(page).toHaveTitle(PAGE_TITLES.review);
    const queue = page.getByRole('list', { name: REVIEW_QUEUE_STRINGS.queueHeading });
    await expect(queue.locator(':scope > li')).toHaveCount(2);
    await expect(page.getByText(CHECK_REASON_TEXT.focus_borderline.message).first()).toBeVisible();
    await expect(page.getByText(SUBJECT_HINT_STRINGS.noneMessage).first()).toBeVisible();
    await expect(page.getByRole('list', { name: REVIEW_QUEUE_STRINGS.duplicateCompareLabel }).first()).toBeVisible();

    const image = await context.request.get(`${API_URL}/api/submissions/${first}/image`, { headers: ORIGIN_HEADER });
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/jpeg');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(dialogs).toEqual([]);
  });

  test('1 件目を採用し、2 件目は超過採用の確認を通してから採用されます（ネイティブのダイアログは出ません）', async ({ context, page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    const { cellId, shotMonth } = await prepareCampaign(context);
    await submit(context, cellId, shotMonth, 1600);
    await submit(context, cellId, shotMonth, 1200);

    await page.goto(REVIEW_URL);
    await expect(page.getByRole('list', { name: REVIEW_QUEUE_STRINGS.queueHeading }).locator(':scope > li')).toHaveCount(2);
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.acceptButton, exact: true }).first().click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.accepted, { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: REVIEW_QUEUE_STRINGS.queueHeading }).locator(':scope > li')).toHaveCount(1);

    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.acceptButton, exact: true }).first().click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.overQuotaBody)).toBeVisible();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.overQuotaConfirmButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.queueEmpty)).toBeVisible();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.acceptedBadgeText(true)).first()).toBeVisible();

    const queue = await getJson<QueueBody>(context.request, '/api/review/queue');
    expect(queue.items).toHaveLength(0);
    expect(queue.accepted).toHaveLength(2);
    expect(queue.accepted.some((entry) => entry.overQuota)).toBe(true);
    expect(dialogs).toEqual([]);
  });

  test('差し戻しは、理由が無いと送れず、Esc で閉じられ、理由と再投稿の可否が API に届きます', async ({ context, page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    const { cellId, shotMonth } = await prepareCampaign(context);
    await submit(context, cellId, shotMonth, 1600);

    await page.goto(REVIEW_URL);
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.returnButton, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.returnButton, exact: true }).click();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.returnSubmitButton, exact: true }).click();
    await expect(dialog.getByText(REVIEW_QUEUE_STRINGS.reasonMissing)).toBeVisible();

    await page.getByLabel(RETURN_REASON_LABELS.ratio, { exact: true }).check();
    await page.getByLabel(REVIEW_QUEUE_STRINGS.returnResubmittableYes, { exact: true }).check();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.returnSubmitButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.returned, { exact: true })).toBeVisible();

    const mine = await getJson<MineBody>(context.request, '/api/submissions/mine');
    expect(mine.items[0]?.status).toBe('returned');
    expect(mine.items[0]?.returnInfo).toEqual({ reasonCode: 'ratio', freeText: '', resubmittable: true });
    expect(dialogs).toEqual([]);
  });

  test('採用の取り消しは、確認の後に理由を送り、マスが募集中に戻ります', async ({ context, page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    const { cellId, shotMonth } = await prepareCampaign(context);
    const id = await submit(context, cellId, shotMonth, 1600);
    await acceptByApi(context, id);
    const before = await getJson<CoverageBody>(context.request, '/api/coverage');
    expect(before.cells.find((cell) => cell.cellId === cellId)?.closed).toBe(true);

    await page.goto(REVIEW_URL);
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.revokeButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.revokeConfirmMessage)).toBeVisible();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.revokeConfirmLabel, exact: true }).click();
    await page.getByLabel(RETURN_REASON_LABELS.other, { exact: true }).check();
    await page.getByLabel(REVIEW_QUEUE_STRINGS.returnResubmittableNo, { exact: true }).check();
    await page.getByLabel(REVIEW_QUEUE_STRINGS.returnFreeTextLabel, { exact: true }).fill(REVIEW_INPUTS.revokeFreeText);
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.revokeSubmitButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.revoked, { exact: true })).toBeVisible();
    await expect(page.getByText(STATUS_LABELS.accepted, { exact: true })).toHaveCount(0);

    const after = await getJson<CoverageBody>(context.request, '/api/coverage');
    expect(after.cells.find((cell) => cell.cellId === cellId)?.closed).toBe(false);
    expect(dialogs).toEqual([]);
  });
});
