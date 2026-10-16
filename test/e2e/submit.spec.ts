import { expect, test, type Page, type Request } from '@playwright/test';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { LIMITS } from '../../src/config/limits';
import { API_ERROR_MESSAGES } from '../../src/config/strings/apiErrors';
import { CHECK_ITEM_LABELS, CHECK_REASON_TEXT } from '../../src/config/strings/checks';
import { PREPARE_ERROR_STRINGS, PREPARE_STRINGS } from '../../src/config/strings/prepare';
import { SUBMIT_FORM_ERRORS, SUBMIT_STRINGS } from '../../src/config/strings/submit';

/**
 * 投稿と判定結果の画面（D4、Issue #17）のブラウザでの確認。対象は開発サーバー（http://localhost:3000）だけです。
 * テンプレートの読み込みは開発の API（同一オリジンの /api/ を Workers へ転送）に直接行います。ログインはありません。
 * 画像は、テストの中でブラウザの Canvas から作ります（自作の画像だけを使い、人物は写りません）。
 */
const FRONT_URL = 'http://localhost:3000';
const SUBMIT_URL = `${FRONT_URL}/submit`;
const MOBILE_VIEWPORT = { width: 375, height: 812 };
/** 整形（Canvas の再エンコード）と判定の完了を待つ時間。 */
const SLOW_TIMEOUT_MS = 20_000;

/** 指定した大きさの JPEG を、ブラウザの Canvas で作ります。 */
async function makeJpegInBrowser(page: Page, width: number, height: number): Promise<Uint8Array> {
  const values = await page.evaluate(
    async ({ width, height }) => {
      const doc = (globalThis as unknown as { document: any }).document;
      const canvas = doc.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      for (let y = 0; y < height; y += 40) {
        for (let x = 0; x < width; x += 40) {
          context.fillStyle = `rgb(${(x * 7) % 256}, ${(y * 5) % 256}, ${((x + y) * 3) % 256})`;
          context.fillRect(x, y, 40, 40);
        }
      }
      const blob: Blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    { width, height },
  );
  return Uint8Array.from(values);
}

/** テンプレートを読み込み、このブラウザのセッションにキャンペーンを作ります（API を直接呼びます）。 */
async function loadTemplate(page: Page): Promise<void> {
  const response = await page.request.post(`${FRONT_URL}/api/campaign/template`, {
    headers: { origin: FRONT_URL, 'content-type': 'application/json' },
    data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
  });
  expect([200, 201]).toContain(response.status());
}

/** 写真を選びます（画面の入力欄へ）。 */
async function selectPhoto(page: Page, buffer: Uint8Array, name: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'image/jpeg', buffer: Buffer.from(buffer) });
}

/** 4:3 の写真を選び、枠を確定して、入力欄が出るまで待ちます（4:3 は枠の調整が不要）。 */
async function preparePhoto(page: Page, buffer: Uint8Array): Promise<void> {
  await selectPhoto(page, buffer, 'landscape-4x3.jpg');
  await page.getByRole('button', { name: PREPARE_STRINGS.confirmButton }).click();
  await expect(page.getByLabel(SUBMIT_STRINGS.areaLabel)).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
}

/** 必須の入力（市町村・撮影月・申告・同意）を、すべて入れます。 */
async function fillRequired(page: Page): Promise<void> {
  await page.getByLabel(SUBMIT_STRINGS.areaLabel).selectOption({ index: 1 });
  await page.getByLabel(SUBMIT_STRINGS.monthLabel).selectOption('7');
  await page.getByLabel(SUBMIT_STRINGS.declaredNotAiLabel).check();
  await page.getByLabel(SUBMIT_STRINGS.declaredNotReusedLabel).check();
  await page.getByLabel(SUBMIT_STRINGS.consentLabel).check();
}

test.describe('投稿と判定結果の画面（D4）', () => {
  test('4:3 の写真を入力して一次判定をし、送信すると「確認待ち」になります', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await fillRequired(page);
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.resultHeading })).toBeVisible();
    await page.getByRole('button', { name: SUBMIT_STRINGS.sendButton }).click();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.acceptedHeading })).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
    await expect(page.getByText(SUBMIT_STRINGS.acceptedBody)).toBeVisible();
  });

  test('申告か同意が未チェックなら、判定も送信もできません', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await page.getByLabel(SUBMIT_STRINGS.areaLabel).selectOption({ index: 1 });
    await page.getByLabel(SUBMIT_STRINGS.monthLabel).selectOption('7');
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await expect(page.getByText(SUBMIT_FORM_ERRORS.declaration)).toBeVisible();
    await expect(page.getByText(SUBMIT_FORM_ERRORS.consent)).toBeVisible();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.resultHeading })).toHaveCount(0);
    await expect(page.getByRole('button', { name: SUBMIT_STRINGS.sendButton })).toHaveCount(0);
  });

  test('地点名が 21 字だと、判定に進まず、字数の誤りを示します', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await fillRequired(page);
    await page.getByLabel(SUBMIT_STRINGS.spotNameLabel).fill('x'.repeat(21));
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await expect(page.getByText(SUBMIT_FORM_ERRORS.spotName(LIMITS.spotNameMaxChars))).toBeVisible();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.resultHeading })).toHaveCount(0);
  });

  test('縦向きの写真は、回転せず、横向きにするよう修正方法を示します', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await selectPhoto(page, await makeJpegInBrowser(page, 900, 1200), 'portrait.jpg');
    await expect(page.getByRole('alert').filter({ hasText: PREPARE_ERROR_STRINGS.portrait })).toBeVisible();
    await expect(page.getByLabel(SUBMIT_STRINGS.areaLabel)).toHaveCount(0);
  });

  test('2 回目に同じ写真を投稿すると、同一画像の不合格と修正方法が出ます', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    const photo = await makeJpegInBrowser(page, 1600, 1200);
    await preparePhoto(page, photo);
    await fillRequired(page);
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await page.getByRole('button', { name: SUBMIT_STRINGS.sendButton }).click();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.acceptedHeading })).toBeVisible({ timeout: SLOW_TIMEOUT_MS });

    await page.getByRole('button', { name: SUBMIT_STRINGS.acceptedAgain }).click();
    await preparePhoto(page, photo);
    await fillRequired(page);
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await page.getByRole('button', { name: SUBMIT_STRINGS.sendButton }).click();
    await expect(page.getByText(CHECK_REASON_TEXT.duplicate_image_reject.message)).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
    await expect(page.getByText(CHECK_REASON_TEXT.duplicate_image_reject.fix, { exact: false })).toBeVisible();
    await expect(page.getByText(API_ERROR_MESSAGES.submission_rejected)).toBeVisible();
  });

  test('送信を二度押しても、送信の要求は 1 回だけ送られます', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await fillRequired(page);
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    const submissions: Request[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/submissions')) {
        submissions.push(request);
      }
    });
    await page.getByRole('button', { name: SUBMIT_STRINGS.sendButton }).dblclick();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.acceptedHeading })).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
    expect(submissions).toHaveLength(1);
  });

  test('ハニーポット欄は、見えず、キーボードの移動と読み上げの対象から外れています', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    const honeypot = page.locator('input[name="website_url"]');
    await expect(honeypot).toHaveCount(1);
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
    await expect(honeypot).toHaveAttribute('autocomplete', 'off');
    await expect(page.locator('div[aria-hidden="true"] input[name="website_url"]')).toHaveCount(1);
    const box = await honeypot.boundingBox();
    expect(box === null || box.x < 0 || box.width <= 1).toBe(true);
  });

  test('再投稿の入口（?resubmit=）で開くと、再投稿として送ることを示し、Worker が元の投稿を確かめます', async ({ page }) => {
    // 存在しない元の投稿の ID を送ると、Worker は再投稿を受け付けず invalid_state（409）を返します。
    // 元の ID が送られていることを、Worker の応答で確かめます（ブラウザは multipart の本文を読めないため）。
    await loadTemplate(page);
    await page.goto(`${SUBMIT_URL}?resubmit=resubmit-origin-1`);
    await expect(page.getByText(SUBMIT_STRINGS.resubmitNotice)).toBeVisible();
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await fillRequired(page);
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await page.getByRole('button', { name: SUBMIT_STRINGS.sendButton }).click();
    await expect(page.getByText(API_ERROR_MESSAGES.invalid_state)).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
  });

  test('スマートフォンの幅でも、横にはみ出さず、入力欄にラベルがあります', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByLabel(SUBMIT_STRINGS.areaLabel)).toBeVisible();
    await expect(page.getByLabel(SUBMIT_STRINGS.monthLabel)).toBeVisible();
    await expect(page.getByLabel(SUBMIT_STRINGS.spotNameLabel)).toBeVisible();
    await expect(page.getByLabel(SUBMIT_STRINGS.captionLabel)).toBeVisible();
  });

  test('確認待ちの画面に、Worker の応答の要確認の項目が出ます', async ({ page }) => {
    await loadTemplate(page);
    await page.route('**/api/submissions', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-submission-1',
          status: 'pending_review',
          checks: [
            { item: 'focus', verdict: 'review', reasonCode: 'focus_borderline' },
            { item: 'format', verdict: 'pass', reasonCode: 'passed' },
          ],
          subject: { status: 'none', resumeNotice: null },
        }),
      });
    });
    await page.goto(SUBMIT_URL);
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await fillRequired(page);
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await page.getByRole('button', { name: SUBMIT_STRINGS.sendButton }).click();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.acceptedHeading })).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.reviewItemsHeading })).toBeVisible();
    await expect(page.getByText(CHECK_ITEM_LABELS.focus, { exact: true })).toBeVisible();
    await expect(page.getByText(CHECK_REASON_TEXT.focus_borderline.message)).toBeVisible();
  });

  test('再投稿では、元の投稿のマスの市町村が初期値になり、撮影月は空のままです', async ({ page }) => {
    await loadTemplate(page);
    const campaign = await (await page.request.get(`${FRONT_URL}/api/campaign`)).json();
    const cell = campaign.cells[0];
    await page.route('**/api/submissions/mine', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            { id: 'origin-1', cellId: cell.cellId, status: 'returned', createdAt: '2026-10-16T00:00:00Z', returnInfo: null },
          ],
        }),
      });
    });
    await page.goto(`${SUBMIT_URL}?resubmit=origin-1`);
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await expect(page.getByLabel(SUBMIT_STRINGS.areaLabel)).toHaveValue(cell.areaId);
    await expect(page.getByLabel(SUBMIT_STRINGS.monthLabel)).toHaveValue('');
  });

  test('ハニーポットに値があれば、ブラウザは送信しません', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await preparePhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await fillRequired(page);
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await page.locator('input[name="website_url"]').evaluate((element) => {
      (element as unknown as { value: string }).value = 'http://spam.example';
    });
    const submissions: Request[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/submissions')) {
        submissions.push(request);
      }
    });
    await page.getByRole('button', { name: SUBMIT_STRINGS.sendButton }).click();
    await expect(page.getByText(SUBMIT_STRINGS.sendFailed)).toBeVisible();
    expect(submissions).toHaveLength(0);
  });
});
