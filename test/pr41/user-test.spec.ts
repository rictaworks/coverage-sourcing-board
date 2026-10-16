import { randomBytes } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { BROWSER_CHECK_ITEMS } from '../../src/config/submission';
import { CHECK_REASON_TEXT } from '../../src/config/strings/checks';
import { PAGE_TITLES } from '../../src/config/strings/layout';
import { RETURN_REASON_LABELS } from '../../src/config/strings/returnReasons';
import { REVIEW_QUEUE_STRINGS } from '../../src/config/strings/reviewQueue';
import { STATUS_LABELS } from '../../src/config/strings/status';
import { SUBJECT_HINT_STRINGS } from '../../src/config/strings/subjectHint';
import { SUBMISSION_FORM_FIELDS } from '../../src/core/api/contract';
import { REVIEW_INPUTS } from '../fixtures/review-inputs';
import { buildJpeg } from '../helpers/jpegBytes';

/**
 * PR #41（Issue #20、D7 確認キューの画面）のユーザーテスト手順を、開発サーバーで確かめる。
 * 手順は PR 本文の「ユーザーテスト手順」の 1〜5 に対応します（/review の表示、要確認の理由と被写体の推定、
 * 採用（超過採用の 2 段の確認）、差し戻し（理由の必須）、採用の取り消し）。ログインはありません。
 * 対象は http://localhost:3000（画面）と http://localhost:8787（API）だけです。本番の URL には接続しません。
 * 前提（テンプレートの読み込み・キャンペーン・投稿）は、手順の画面操作の前に API で作ります。
 * 画面の文字列は src/config/strings/ から引き、ここには直書きしません。
 */
const FRONT_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8787';
const REVIEW_URL = `${FRONT_URL}/review`;
const ORIGIN_HEADER = { origin: FRONT_URL };
const FOCUS_REVIEW = { item: 'focus', verdict: 'review', reasonCode: 'focus_borderline' };
/** 幅 375 px（スマートフォン相当）で横にはみ出さないことを確かめる。 */
const PHONE_WIDTH = 375;

interface CampaignBody {
  readonly name: string;
  readonly acceptRule: unknown;
  readonly periods: readonly { id: string; months: readonly number[] }[];
}

interface CoverageBody {
  readonly cells: readonly { cellId: string; periodId: string; accepted: number; required: number; closed: boolean }[];
}

interface MineBody {
  readonly items: readonly {
    id: string;
    status: string;
    returnInfo: { reasonCode: string; freeText: string; resubmittable: boolean } | null;
  }[];
}

/** 要求の接続元（レート制限を避けるため、要求ごとに別の値を使う）。 */
const uniqueIp = (): string => Buffer.from(randomBytes(8)).toString('hex');

/** 正しい判定の結果（ブラウザが送る 10 項目）。focus だけは要確認にします（要確認の理由を画面で見るため）。 */
function checksWithReview(): { item: string; verdict: string; reasonCode: string }[] {
  return BROWSER_CHECK_ITEMS.map((item) =>
    item === FOCUS_REVIEW.item ? { ...FOCUS_REVIEW } : { item, verdict: 'pass', reasonCode: 'passed' },
  );
}

async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`${API_URL}${path}`, { headers: ORIGIN_HEADER });
  expect(response.status()).toBe(200);
  return (await response.json()) as T;
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

/** 投稿を 1 件作ります（同じ地点名の投稿は、同じマスの中で重複候補になります）。 */
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

/** 採用を API で行います（手順 5 の前提：採用済みの投稿を作るため）。 */
async function acceptByApi(context: BrowserContext, id: string): Promise<void> {
  const response = await context.request.post(`${API_URL}/api/review/${id}/accept`, {
    headers: { ...ORIGIN_HEADER, 'content-type': 'application/json' },
    data: {},
  });
  expect(response.status()).toBe(200);
}

/** 確認キューの一覧の項目（li）を数えます。 */
function queueItems(page: import('@playwright/test').Page) {
  return page.getByRole('list', { name: REVIEW_QUEUE_STRINGS.queueHeading }).locator(':scope > li');
}

test.describe('PR #41 ユーザーテスト手順（確認キューの画面 /review）', () => {
  test('手順 1・2：/review に確認待ちの投稿が一覧で出て、要確認の理由と被写体の推定（開発では「被写体の推定はありません」）が見えます', async ({ context, page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    const { cellId, shotMonth } = await prepareCampaign(context);
    await submit(context, cellId, shotMonth, 1600);

    await page.setViewportSize({ width: PHONE_WIDTH, height: 800 });
    await page.goto(REVIEW_URL);
    await expect(page).toHaveTitle(PAGE_TITLES.review);
    await expect(queueItems(page).first()).toBeVisible();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.checksHeading).first()).toBeVisible();
    await expect(page.getByText(CHECK_REASON_TEXT.focus_borderline.message).first()).toBeVisible();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.subjectHeading).first()).toBeVisible();
    await expect(page.getByText(SUBJECT_HINT_STRINGS.noneMessage).first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(dialogs).toEqual([]);
  });

  test('手順 1・2：重複の候補がある投稿は、重複候補の欄に並べて表示されます', async ({ context, page }) => {
    const { cellId, shotMonth } = await prepareCampaign(context);
    await submit(context, cellId, shotMonth, 1600);
    await submit(context, cellId, shotMonth, 1200);

    await page.goto(REVIEW_URL);
    await expect(queueItems(page)).toHaveCount(2);
    await expect(page.getByRole('list', { name: REVIEW_QUEUE_STRINGS.duplicateCompareLabel }).first()).toBeVisible();
  });

  test('手順 3：採用すると「採用しました。」と出ます。必要数を超えると、画面内の 2 段の確認が出ます', async ({ context, page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    const { cellId, shotMonth } = await prepareCampaign(context);
    await submit(context, cellId, shotMonth, 1600);
    await submit(context, cellId, shotMonth, 1200);

    await page.goto(REVIEW_URL);
    await expect(queueItems(page)).toHaveCount(2);
    const accept = page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.acceptButton, exact: true });

    await accept.first().click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.accepted, { exact: true })).toBeVisible();
    await expect(queueItems(page)).toHaveCount(1);

    await accept.first().click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.overQuotaBody)).toBeVisible();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.overQuotaCancelButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.overQuotaBody)).toBeHidden();
    await expect(queueItems(page)).toHaveCount(1);

    await accept.first().click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.overQuotaBody)).toBeVisible();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.overQuotaConfirmButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.queueEmpty)).toBeVisible();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.acceptedBadgeText(true)).first()).toBeVisible();

    const coverage = await getJson<CoverageBody>(context.request, '/api/coverage');
    expect(coverage.cells.find((cell) => cell.cellId === cellId)?.closed).toBe(true);
    expect(dialogs).toEqual([]);
  });

  test('手順 4：差し戻しは、理由を選ばないと送れません。送ると「差し戻しました。」と出ます', async ({ context, page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    const { cellId, shotMonth } = await prepareCampaign(context);
    await submit(context, cellId, shotMonth, 1600);

    await page.goto(REVIEW_URL);
    await expect(queueItems(page)).toHaveCount(1);
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.returnButton, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.returnSubmitButton, exact: true }).click();
    await expect(dialog.getByText(REVIEW_QUEUE_STRINGS.reasonMissing)).toBeVisible();
    await expect(dialog).toBeVisible();

    await page.getByLabel(RETURN_REASON_LABELS.ratio, { exact: true }).check();
    await page.getByLabel(REVIEW_QUEUE_STRINGS.returnResubmittableYes, { exact: true }).check();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.returnSubmitButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.returned, { exact: true })).toBeVisible();
    await expect(queueItems(page)).toHaveCount(0);

    const mine = await getJson<MineBody>(context.request, '/api/submissions/mine');
    expect(mine.items[0]?.status).toBe('returned');
    expect(mine.items[0]?.returnInfo).toEqual({ reasonCode: 'ratio', freeText: '', resubmittable: true });
    expect(dialogs).toEqual([]);
  });

  test('手順 4：差し戻しの入力は、Esc で閉じられ、閉じると次に開いたときに入力が空になっています', async ({ context, page }) => {
    const { cellId, shotMonth } = await prepareCampaign(context);
    await submit(context, cellId, shotMonth, 1600);

    await page.goto(REVIEW_URL);
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.returnButton, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.getByLabel(RETURN_REASON_LABELS.ratio, { exact: true }).check();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.returnButton, exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel(RETURN_REASON_LABELS.ratio, { exact: true })).not.toBeChecked();
  });

  test('手順 5：採用済みの投稿の「取り消し」は、確認の後に理由を入力するダイアログが開き、送ると差し戻しに戻ります', async ({ context, page }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => dialogs.push(dialog.message()));
    const { cellId, shotMonth } = await prepareCampaign(context);
    const id = await submit(context, cellId, shotMonth, 1600);
    await acceptByApi(context, id);

    await page.goto(REVIEW_URL);
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.acceptedBadgeText(false)).first()).toBeVisible();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.revokeButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.revokeConfirmMessage)).toBeVisible();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.revokeConfirmLabel, exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.getByLabel(RETURN_REASON_LABELS.other, { exact: true }).check();
    await page.getByLabel(REVIEW_QUEUE_STRINGS.returnResubmittableNo, { exact: true }).check();
    await page.getByLabel(REVIEW_QUEUE_STRINGS.returnFreeTextLabel, { exact: true }).fill(REVIEW_INPUTS.revokeFreeText);
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.revokeSubmitButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.revoked, { exact: true })).toBeVisible();
    await expect(page.getByText(STATUS_LABELS.accepted, { exact: true })).toHaveCount(0);

    const mine = await getJson<MineBody>(context.request, '/api/submissions/mine');
    expect(mine.items[0]?.status).toBe('returned');
    expect(mine.items[0]?.returnInfo).toEqual({ reasonCode: 'other', freeText: REVIEW_INPUTS.revokeFreeText, resubmittable: false });
    expect(dialogs).toEqual([]);
  });

  test('手順 5：取り消しの確認で「やめる」を選ぶと、採用のまま変わりません', async ({ context, page }) => {
    const { cellId, shotMonth } = await prepareCampaign(context);
    const id = await submit(context, cellId, shotMonth, 1600);
    await acceptByApi(context, id);

    await page.goto(REVIEW_URL);
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.revokeButton, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.revokeConfirmMessage)).toBeVisible();
    await page.getByRole('button', { name: REVIEW_QUEUE_STRINGS.revokeConfirmDismissLabel, exact: true }).click();
    await expect(page.getByText(REVIEW_QUEUE_STRINGS.revokeConfirmMessage)).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const coverage = await getJson<CoverageBody>(context.request, '/api/coverage');
    expect(coverage.cells.find((cell) => cell.cellId === cellId)?.closed).toBe(true);
  });
});
