import { expect, test, type Page } from '@playwright/test';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { PAGE_NAMES } from '../../src/config/strings/layout';
import { PREPARE_ERROR_STRINGS, PREPARE_STRINGS } from '../../src/config/strings/prepare';
import { SUBMIT_FORM_ERRORS, SUBMIT_STRINGS } from '../../src/config/strings/submit';

/**
 * PR #39（Issue #17、D4 投稿と判定結果の画面）のユーザーテスト手順を、開発サーバー（http://localhost:3000）で確かめる。
 * 手順は PR 本文の「ユーザーテスト手順」の 1〜6 に対応します。ログインはありません。
 * テンプレートの読み込みだけは、前提（D1 にテンプレートがある状態）を作るために API を直接呼びます。
 * 画像は、テストの中でブラウザの Canvas から作ります（リポジトリに画像ファイルを追加しません）。
 * 対象は開発サーバーだけです。本番の URL には接続しません。
 */
const FRONT_URL = 'http://localhost:3000';
const SUBMIT_URL = `${FRONT_URL}/submit`;
/** 整形（Canvas）と判定・送信（Worker）の完了を待つ時間。 */
const SLOW_TIMEOUT_MS = 20_000;

/** 指定した大きさの JPEG を、ブラウザの Canvas で作ります（自作の模様だけで、人物は写りません）。 */
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

/** テンプレートを読み込み、キャンペーンを作ります（前提の準備。API を直接呼びます）。 */
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

/** 4:3 の写真を選び、枠を確定して、入力欄が出るまで待ちます。 */
async function pickAndConfirmPhoto(page: Page, buffer: Uint8Array): Promise<void> {
  await selectPhoto(page, buffer, 'landscape-4x3.jpg');
  await page.getByRole('button', { name: PREPARE_STRINGS.confirmButton }).click();
  await expect(page.getByLabel(SUBMIT_STRINGS.areaLabel)).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
}

test.describe('PR #39 ユーザーテスト手順（投稿と判定結果の画面）', () => {
  test('手順 1：/submit を開くと「投稿」の画面が出て、写真を選ぶ欄があります', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await expect(page.getByRole('heading', { level: 1, name: PAGE_NAMES.submit })).toBeVisible();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.photoHeading })).toBeVisible();
    await expect(page.getByText(PREPARE_STRINGS.pickLabel)).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
  });

  test('手順 2：JPEG の写真を選ぶと、写真の確認（トリミング枠の欄）が出ます', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await selectPhoto(page, await makeJpegInBrowser(page, 1600, 1200), 'landscape-4x3.jpg');
    await expect(page.getByRole('heading', { name: PREPARE_STRINGS.cropHeading })).toBeVisible();
    await expect(page.getByRole('button', { name: PREPARE_STRINGS.confirmButton })).toBeVisible();
  });

  test('手順 2 の続き：枠を確定すると、写真のプレビュー（整形後の画像）が出ます', async ({ page }) => {
    // PR 本文は「選ぶと写真のプレビューが出ます」と書いています。実装では、プレビューは「枠を確定する」の後に出ます。
    // ここでは確定の後のプレビューを確かめます。選んだ直後の画像の表示は、下の判定で別に確かめます。
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await selectPhoto(page, await makeJpegInBrowser(page, 1600, 1200), 'landscape-4x3.jpg');
    await page.getByRole('button', { name: PREPARE_STRINGS.confirmButton }).click();
    await expect(page.getByRole('heading', { name: PREPARE_STRINGS.previewHeading })).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
  });

  test('手順 2（PR 本文の文言どおり）：写真を選んだ直後に、写真のプレビュー画像が出ます', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await selectPhoto(page, await makeJpegInBrowser(page, 1600, 1200), 'landscape-4x3.jpg');
    await expect(page.getByRole('heading', { name: PREPARE_STRINGS.cropHeading })).toBeVisible();
    await expect(page.getByRole('img', { name: PREPARE_STRINGS.previewHeading })).toBeVisible();
  });

  test('手順 3：市町村と撮影月を選ぶと、選んだ内容が入力欄に表示されます', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await pickAndConfirmPhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    const area = page.getByLabel(SUBMIT_STRINGS.areaLabel);
    await area.selectOption({ index: 1 });
    const selectedArea = await area.inputValue();
    expect(selectedArea).not.toBe('');
    await page.getByLabel(SUBMIT_STRINGS.monthLabel).selectOption('7');
    await expect(page.getByLabel(SUBMIT_STRINGS.monthLabel)).toHaveValue('7');
    await expect(area).toHaveValue(selectedArea);
  });

  test('手順 4：申告と同意にチェックを入れないまま判定すると、送信できず、チェックが必要な旨が出ます', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await pickAndConfirmPhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await page.getByLabel(SUBMIT_STRINGS.areaLabel).selectOption({ index: 1 });
    await page.getByLabel(SUBMIT_STRINGS.monthLabel).selectOption('7');
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await expect(page.getByText(SUBMIT_FORM_ERRORS.declaration)).toBeVisible();
    await expect(page.getByText(SUBMIT_FORM_ERRORS.consent)).toBeVisible();
    await expect(page.getByRole('button', { name: SUBMIT_STRINGS.sendButton })).toHaveCount(0);
  });

  test('手順 5：必要な項目を入れて一次判定すると、判定の結果が同じ画面に出ます', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await pickAndConfirmPhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await page.getByLabel(SUBMIT_STRINGS.areaLabel).selectOption({ index: 1 });
    await page.getByLabel(SUBMIT_STRINGS.monthLabel).selectOption('7');
    await page.getByLabel(SUBMIT_STRINGS.declaredNotAiLabel).check();
    await page.getByLabel(SUBMIT_STRINGS.declaredNotReusedLabel).check();
    await page.getByLabel(SUBMIT_STRINGS.consentLabel).check();
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.resultHeading })).toBeVisible();
    const verdicts = [SUBMIT_STRINGS.verdictPass, SUBMIT_STRINGS.verdictReview, SUBMIT_STRINGS.verdictFail];
    await expect(page.getByText(new RegExp(verdicts.join('|'))).first()).toBeVisible();
  });

  test('手順 5 の続き：送信すると「確認待ち」の旨が出ます', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await pickAndConfirmPhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await page.getByLabel(SUBMIT_STRINGS.areaLabel).selectOption({ index: 1 });
    await page.getByLabel(SUBMIT_STRINGS.monthLabel).selectOption('7');
    await page.getByLabel(SUBMIT_STRINGS.declaredNotAiLabel).check();
    await page.getByLabel(SUBMIT_STRINGS.declaredNotReusedLabel).check();
    await page.getByLabel(SUBMIT_STRINGS.consentLabel).check();
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await page.getByRole('button', { name: SUBMIT_STRINGS.sendButton }).click();
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.acceptedHeading })).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
    await expect(page.getByText(SUBMIT_STRINGS.acceptedBody)).toBeVisible();
  });

  test('手順 5（PR 本文の文言どおり）：送信の後も、同じ画面に判定の結果（合格・要確認・不合格）が出ます', async ({ page }) => {
    // PR 本文は「送信すると、判定の結果と『確認待ち』の旨が同じ画面に出ます」と書いています。
    // 実装では、受け付けた後は「投稿を受け付けました」の表示に切り替わり、判定の結果は表示されません。
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await pickAndConfirmPhoto(page, await makeJpegInBrowser(page, 1600, 1200));
    await page.getByLabel(SUBMIT_STRINGS.areaLabel).selectOption({ index: 1 });
    await page.getByLabel(SUBMIT_STRINGS.monthLabel).selectOption('7');
    await page.getByLabel(SUBMIT_STRINGS.declaredNotAiLabel).check();
    await page.getByLabel(SUBMIT_STRINGS.declaredNotReusedLabel).check();
    await page.getByLabel(SUBMIT_STRINGS.consentLabel).check();
    await page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton }).click();
    await page.getByRole('button', { name: SUBMIT_STRINGS.sendButton }).click();
    await expect(page.getByText(SUBMIT_STRINGS.acceptedBody)).toBeVisible({ timeout: SLOW_TIMEOUT_MS });
    await expect(page.getByRole('heading', { name: SUBMIT_STRINGS.resultHeading })).toBeVisible();
    const verdicts = [SUBMIT_STRINGS.verdictPass, SUBMIT_STRINGS.verdictReview, SUBMIT_STRINGS.verdictFail];
    await expect(page.getByText(new RegExp(verdicts.join('|'))).first()).toBeVisible();
  });

  test('手順 6：縦向きの写真は送信できず、理由と修正方法（横向きの写真を選ぶこと）が出ます', async ({ page }) => {
    await loadTemplate(page);
    await page.goto(SUBMIT_URL);
    await selectPhoto(page, await makeJpegInBrowser(page, 900, 1200), 'portrait.jpg');
    await expect(page.getByRole('alert').filter({ hasText: PREPARE_ERROR_STRINGS.portrait })).toBeVisible();
    await expect(page.getByLabel(SUBMIT_STRINGS.areaLabel)).toHaveCount(0);
    await expect(page.getByRole('button', { name: SUBMIT_STRINGS.judgeButton })).toHaveCount(0);
    await expect(page.getByRole('button', { name: SUBMIT_STRINGS.sendButton })).toHaveCount(0);
  });
});
