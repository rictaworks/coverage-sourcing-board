import { expect, test, type Page } from '@playwright/test';
import { PREPARE_ERROR_STRINGS, PREPARE_STRINGS } from '../../src/config/strings/prepare';
import { PREPARE_DEFAULTS, RULE_DEFAULTS } from '../../src/config/defaults';
import { PAGE_NAMES } from '../../src/config/strings/layout';

/**
 * PR #30（Issue #16、D3 画像の整形）のユーザーテスト手順を、ブラウザの操作で 1 手順ずつ確かめる。
 * 文言は src/config/strings/prepare.ts と既定値は src/config/defaults.ts から読み込み、画面の値と照合する。
 * 入力の画像は、テストの中でブラウザの Canvas から作る（大きなバイナリをリポジトリに追加しない）。
 * 対象は開発サーバー（http://localhost:3000）だけです。本番の URL には接続しません。
 */
const SUBMIT_URL = 'http://localhost:3000/submit';
const MEGABYTE = 1024 * 1024;
const LONG_SIDE_MAX = 1600;
const TIMEOUT_MS = 20_000;

/** 指定した大きさの JPEG を、ブラウザの Canvas で作る。 */
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

/** 入力欄に画像を選ぶ（accept の制限は Playwright が通すので、形式の判定は画面側の検査で確かめる）。 */
async function selectFile(page: Page, buffer: Uint8Array, name: string, mimeType: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer: Buffer.from(buffer) });
}

/** 画面の「整形後の画像」の見出しに続く寸法の表示（例：1600 × 1200 px）を読む。 */
async function readPreviewSize(page: Page): Promise<{ width: number; height: number }> {
  const text = await page.locator('section[aria-labelledby="preview-heading"]').innerText();
  const match = /(\d+) × (\d+) px/.exec(text);
  expect(match, `preview size text was not found: ${text}`).not.toBeNull();
  return { width: Number(match?.[1]), height: Number(match?.[2]) };
}

test.describe('PR #30 ユーザーテスト手順（画像の整形）', () => {
  test('手順 1：/submit を開くと、写真を選ぶ案内が表示される', async ({ page }) => {
    const response = await page.goto(SUBMIT_URL);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { level: 1, name: PAGE_NAMES.submit })).toBeVisible();
    await expect(page.getByText(PREPARE_STRINGS.intro)).toBeVisible();
    for (const step of PREPARE_STRINGS.steps) {
      await expect(page.getByText(step, { exact: true })).toBeVisible();
    }
    // 選ぶ入力欄とそのボタンの文言
    await expect(page.getByText(PREPARE_STRINGS.pickLabel, { exact: true })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
  });

  test('手順 2：JPEG を選ぶと、画像を確かめた後に結果（枠または案内）が出る', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    const jpeg = await makeJpegInBrowser(page, 1200, 800);
    await selectFile(page, jpeg, 'landscape-3x2.jpg', 'image/jpeg');

    // 判定は短時間で終わるため、「確かめています」の文は確認せず、結果の見出しが出ることを確かめる。
    await expect(page.getByRole('heading', { name: PREPARE_STRINGS.cropHeading })).toBeVisible({ timeout: TIMEOUT_MS });
    await expect(page.getByText(PREPARE_STRINGS.confirmButton, { exact: true })).toBeVisible();
  });

  test('手順 3：横向きで 4:3 ではない写真を選ぶと、4:3 のトリミング枠が出る', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    // 3:2 の横向き。4:3 ではないので枠の調整が必要。
    const jpeg = await makeJpegInBrowser(page, 1200, 800);
    await selectFile(page, jpeg, 'landscape-3x2.jpg', 'image/jpeg');

    const frame = page.getByRole('img', { name: PREPARE_STRINGS.cropFrameLabel });
    await expect(frame).toBeVisible({ timeout: TIMEOUT_MS });
    await expect(page.getByText(PREPARE_STRINGS.cropNotNeeded)).toHaveCount(0);
    await expect(page.getByRole('slider', { name: PREPARE_STRINGS.cropRangeLabel })).toBeVisible();
    await expect(page.getByText(PREPARE_STRINGS.cropHelp)).toBeVisible();

    // 枠（黒い領域の上に重なる四角）が、画像の中に描かれていること。
    const frameBox = await page.locator('[class*="cropFrame"]').first().boundingBox();
    const imageBox = await frame.boundingBox();
    expect(frameBox).not.toBeNull();
    expect(imageBox).not.toBeNull();
    const ratio = (frameBox?.width ?? 0) / (frameBox?.height ?? 1);
    expect(ratio).toBeGreaterThan(4 / 3 - 0.02);
    expect(ratio).toBeLessThan(4 / 3 + 0.02);
  });

  test('手順 4：枠をドラッグし、スライダーを矢印キーで動かすと、枠の位置が動く', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    const jpeg = await makeJpegInBrowser(page, 1200, 800);
    await selectFile(page, jpeg, 'landscape-3x2.jpg', 'image/jpeg');

    const slider = page.getByRole('slider', { name: PREPARE_STRINGS.cropRangeLabel });
    await expect(slider).toBeVisible({ timeout: TIMEOUT_MS });

    // 矢印キーで動かす（既定の刻みは PREPARE_DEFAULTS.cropStepPercent）
    await slider.focus();
    const before = Number(await slider.inputValue());
    await page.keyboard.press('ArrowLeft');
    const afterLeft = Number(await slider.inputValue());
    expect(afterLeft).toBeLessThan(before);
    expect(before - afterLeft).toBe(PREPARE_DEFAULTS.cropStepPercent);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const afterRight = Number(await slider.inputValue());
    expect(afterRight).toBeGreaterThan(afterLeft);

    // 枠をドラッグする
    const frame = page.locator('[class*="cropFrame"]').first();
    const box = await frame.boundingBox();
    expect(box).not.toBeNull();
    const startX = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const startY = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    const valueBeforeDrag = Number(await slider.inputValue());
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 60, startY, { steps: 6 });
    await page.mouse.up();
    const valueAfterDrag = Number(await slider.inputValue());
    expect(valueAfterDrag).not.toBe(valueBeforeDrag);
  });

  test('手順 5：「枠を確定する」を押すと、整形後の画像と大きさ（長辺 1,600 px 以下）が表示される', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    const jpeg = await makeJpegInBrowser(page, 1200, 800);
    await selectFile(page, jpeg, 'landscape-3x2.jpg', 'image/jpeg');

    await expect(page.getByRole('slider', { name: PREPARE_STRINGS.cropRangeLabel })).toBeVisible({
      timeout: TIMEOUT_MS,
    });
    await page.getByRole('button', { name: PREPARE_STRINGS.confirmButton }).click();

    const heading = page.getByRole('heading', { name: PREPARE_STRINGS.previewHeading });
    await expect(heading).toBeVisible({ timeout: TIMEOUT_MS });
    await expect(page.getByText(PREPARE_STRINGS.previewLongSide)).toBeVisible();

    const size = await readPreviewSize(page);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(LONG_SIDE_MAX);
    // 4:3 に切り出されていること（誤差は丸めの 1 px まで）
    expect(Math.abs(size.width / size.height - 4 / 3)).toBeLessThan(0.01);

    // 整形後の画像が、ブラウザで読める画像として表示されていること
    const previewImage = page.locator('section[aria-labelledby="preview-heading"] img');
    await expect(previewImage).toBeVisible();
    const naturalWidth = await previewImage.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth);
    expect(naturalWidth).toBe(size.width);
  });

  test('手順 6：縦向きの写真を選ぶと、「縦向きは不可です」の案内が出る', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    const portrait = await makeJpegInBrowser(page, 800, 1200);
    await selectFile(page, portrait, 'portrait-2x3.jpg', 'image/jpeg');

    await expect(page.getByText(PREPARE_ERROR_STRINGS.portrait)).toBeVisible({ timeout: TIMEOUT_MS });
  });

  test('手順 7：5 MB を超える画像を選ぶと、「5 MB 以下にしてください」の理由が出る', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    // 形式の判定より前に大きさを確かめるため、中身は JPEG の先頭だけでよい（5 MB を 1 バイト超える）。
    const oversized = new Uint8Array(5 * MEGABYTE + 1);
    oversized.set([0xff, 0xd8, 0xff, 0xe0], 0);
    await selectFile(page, oversized, 'too-large.jpg', 'image/jpeg');

    const expected = PREPARE_ERROR_STRINGS.too_large(RULE_DEFAULTS.maxInputBytes / MEGABYTE);
    await expect(page.getByText(expected, { exact: true })).toBeVisible({ timeout: TIMEOUT_MS });
    // 拒否の後は、結果の見出しが出ないこと
    await expect(page.getByRole('heading', { name: PREPARE_STRINGS.cropHeading })).toHaveCount(0);
  });

  test('手順 8：SVG の画像を選ぶと、「JPEG または PNG の画像を選んでください」の理由が出る', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      'utf8',
    );
    await selectFile(page, new Uint8Array(svg), 'vector.svg', 'image/svg+xml');

    await expect(page.getByText(PREPARE_ERROR_STRINGS.unsupported_format, { exact: true })).toBeVisible({
      timeout: TIMEOUT_MS,
    });
    await expect(page.getByRole('heading', { name: PREPARE_STRINGS.cropHeading })).toHaveCount(0);
  });
});
