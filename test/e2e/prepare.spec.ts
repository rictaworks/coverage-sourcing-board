import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect, firefox, test, webkit, type Browser, type Page } from '@playwright/test';
import { PREPARE_ERROR_STRINGS, PREPARE_STRINGS } from '../../src/config/strings/prepare';
import { inspectJpeg } from '../../src/core/jpeg/jpegInspector';
import { buildExifApp1, insertAfterApp0 } from '../helpers/exifFixture';

/**
 * 画像の整形（D3、Issue #16）のブラウザでの確認。対象は開発サーバー（http://localhost:3000）だけです。
 * 入力の画像は、テストの中でブラウザの Canvas から作ります（自作の画像だけを使い、人物は写りません）。
 * EXIF（撮影日時・時差・機種・GPS）は、架空の値を test/helpers/exifFixture.ts で差し込みます。
 */
const SUBMIT_URL = 'http://localhost:3000/submit';
const FOUR_THIRDS = 4 / 3;
const SAVED_LONG_SIDE_MAX = 1600;
/** 整形（Canvas の再エンコード）の完了を待つ時間。開発サーバーと、ブラウザの起動の負荷を見込みます。 */
const PREPARE_TIMEOUT_MS = 20_000;

/** 指定した大きさの JPEG を、ブラウザの Canvas で作ります（ブラウザごとの出力を使います）。 */
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

/** 架空の EXIF（撮影日時・時差・機種・GPS）を差し込んだ JPEG を作ります。 */
function withExif(jpeg: Uint8Array): Uint8Array {
  return insertAfterApp0(
    jpeg,
    buildExifApp1({
      dateTimeOriginal: '2026:07:15 10:30:00',
      offsetTimeOriginal: '+09:00',
      make: 'TestMakerQ',
      model: 'TestModelX9000',
      gps: { latitude: 34.123456, longitude: 134.654321 },
    }),
  );
}

/** ファイルを、画面の入力欄に選びます。 */
async function selectFile(page: Page, buffer: Uint8Array, name: string, mimeType: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer: Buffer.from(buffer) });
}

/** 整形後の画像（blob の URL）の中身を読みます。 */
async function readPreviewBytes(page: Page): Promise<Uint8Array> {
  const src = await page.getByRole('img', { name: PREPARE_STRINGS.previewHeading }).getAttribute('src');
  if (src === null) {
    throw new Error('preview image src was not found');
  }
  const values = await page.evaluate(async (url: string) => {
    const response = await fetch(url);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  }, src);
  return Uint8Array.from(values);
}

/** 画面の ASCII の文字列（EXIF の識別子 "Exif" など）が含まれるかを確かめます。 */
function containsAscii(bytes: Uint8Array, text: string): boolean {
  const needle = Array.from(text, (ch) => ch.charCodeAt(0));
  for (let index = 0; index + needle.length <= bytes.length; index += 1) {
    if (needle.every((value, offset) => bytes[index + offset] === value)) {
      return true;
    }
  }
  return false;
}

/** セグメントの並びから、APP2（FF E2）があるかを調べます（圧縮データの前まで）。 */
function hasApp2(bytes: Uint8Array): boolean {
  let pos = 2;
  while (pos + 3 < bytes.length && bytes[pos] === 0xff) {
    const code = bytes[pos + 1];
    if (code === 0xe2) {
      return true;
    }
    if (code === 0xda) {
      return false;
    }
    pos += 2 + ((bytes[pos + 2] << 8) | bytes[pos + 3]);
  }
  return false;
}

/**
 * 保存される JPEG（プレビューの blob のバイト列。投稿で送るものと同じ）を、B4 の検査（inspectJpeg）に当てます。
 * ブラウザが付ける ICC の APP2 は、製品の出力の段階で取り除かれているため、そのまま合格します。
 */
async function inspectSaved(page: Page, bytes: Uint8Array): Promise<{ passed: boolean; width?: number; height?: number }> {
  expect(hasApp2(bytes)).toBe(false);
  const readable = await page.evaluate(async (values: number[]) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(values)], { type: 'image/jpeg' }));
    return bitmap.width > 0 && bitmap.height > 0;
  }, Array.from(bytes));
  expect(readable).toBe(true);
  const inspection = inspectJpeg(bytes);
  return inspection.ok ? { passed: true, width: inspection.width, height: inspection.height } : { passed: false };
}

/** 4:3 の JPEG（EXIF つき）を選び、確定して、保存用の画像を確かめます。 */
async function prepareFourThirdsAndVerify(page: Page): Promise<void> {
  const original = withExif(await makeJpegInBrowser(page, 1600, 1200));
  await selectFile(page, original, 'landscape-4x3.jpg', 'image/jpeg');
  await expect(page.getByRole('button', { name: PREPARE_STRINGS.confirmButton })).toBeVisible();
  await page.getByRole('button', { name: PREPARE_STRINGS.confirmButton }).click();
  await expect(page.getByRole('img', { name: PREPARE_STRINGS.previewHeading })).toBeVisible({ timeout: PREPARE_TIMEOUT_MS });

  const saved = await readPreviewBytes(page);
  const result = await inspectSaved(page, saved);
  expect(result.passed).toBe(true);
  if (result.width !== undefined && result.height !== undefined) {
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(SAVED_LONG_SIDE_MAX);
    expect(result.width / result.height).toBeCloseTo(FOUR_THIRDS, 2);
  }
  expect(containsAscii(saved, 'Exif')).toBe(false);
  expect(containsAscii(saved, 'TestModelX9000')).toBe(false);
  expect(containsAscii(saved, 'TestMakerQ')).toBe(false);
}

test.describe('画像の整形（D3）', () => {
  test('4:3 の JPEG（EXIF・GPS つき）は、枠を出さず、APP1 の無い長辺 1,600 px 以下の JPEG になります', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await prepareFourThirdsAndVerify(page);
    await expect(page.getByRole('slider', { name: PREPARE_STRINGS.cropRangeLabel })).toHaveCount(0);
    await expect(page.getByText(PREPARE_STRINGS.previewSize(1600, 1200))).toBeVisible();
  });

  test('3:2 の画像では枠が出て、矢印キーで位置を動かせ、確定すると 4:3 になります', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    const landscape = await makeJpegInBrowser(page, 1500, 1000);
    await selectFile(page, landscape, 'landscape-3x2.jpg', 'image/jpeg');

    const slider = page.getByRole('slider', { name: PREPARE_STRINGS.cropRangeLabel });
    await expect(slider).toBeVisible();
    await expect(slider).toHaveValue('50');
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('55');

    await page.getByRole('button', { name: PREPARE_STRINGS.confirmButton }).click();
    await expect(page.getByRole('img', { name: PREPARE_STRINGS.previewHeading })).toBeVisible({ timeout: PREPARE_TIMEOUT_MS });
    const result = await inspectSaved(page, await readPreviewBytes(page));
    expect(result).toMatchObject({ passed: true, width: 1333, height: 1000 });
  });

  test('縦向きの画像は回転せず、「縦向きは不可」を表示します', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    const portrait = await makeJpegInBrowser(page, 900, 1200);
    await selectFile(page, portrait, 'portrait.jpg', 'image/jpeg');
    await expect(page.getByRole('alert').filter({ hasText: PREPARE_ERROR_STRINGS.portrait })).toBeVisible();
    await expect(page.getByRole('button', { name: PREPARE_STRINGS.confirmButton })).toHaveCount(0);
  });

  test('SVG は受け付けず、形式の文言を表示します', async ({ page }) => {
    await page.goto(SUBMIT_URL);
    const svg = readFileSync(join(process.cwd(), 'test', 'fixtures', 'images', 'sample.svg'));
    await selectFile(page, new Uint8Array(svg), 'sample.svg', 'image/svg+xml');
    await expect(page.getByRole('alert').filter({ hasText: PREPARE_ERROR_STRINGS.unsupported_format })).toBeVisible();
  });

  /** 指定したブラウザで、4:3 の JPEG（EXIF つき）を整形し、出力を検査します。 */
  async function verifyWithBrowser(browser: Browser): Promise<void> {
    try {
      const page = await browser.newPage();
      await page.goto(SUBMIT_URL);
      await prepareFourThirdsAndVerify(page);
    } finally {
      await browser.close();
    }
  }

  test('chromium でも、出力の JPEG が B4 の検査（inspectJpeg）に合格します', async () => {
    await verifyWithBrowser(await chromium.launch());
  });

  test('firefox でも、出力の JPEG が B4 の検査（inspectJpeg）に合格します', async () => {
    await verifyWithBrowser(await firefox.launch());
  });

  test('webkit でも、出力の JPEG が B4 の検査（inspectJpeg）に合格します', async () => {
    await verifyWithBrowser(await webkit.launch());
  });
});
