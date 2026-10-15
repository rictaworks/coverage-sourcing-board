import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';

/**
 * PR #21（Issue #1、A1 環境構築）のユーザーテスト手順を、ブラウザの操作で確かめる。
 * 対象は開発サーバー（3000 番と 8787 番）だけです。本番の URL は使いません。
 */
const FRONT_URL = 'http://localhost:3000/';
const HEALTH_URL = 'http://localhost:8787/api/health';
// package.json は "type": "module" のため __dirname は使えません。Playwright はリポジトリ直下から実行します。
const PAGE_FILE = resolve(process.cwd(), 'src/frontend/app/page.tsx');

test.describe('PR #21 ユーザーテスト手順', () => {
  test('手順 1・2：3000 番のトップを開くと、アプリの題名が表示される（真っ白やエラーではない）', async ({ page }) => {
    const response = await page.goto(FRONT_URL);
    expect(response?.status()).toBe(200);

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText(APP_STRINGS.pageTitle);

    // 開発サーバーのエラー画面（Next.js の Runtime Error など）が出ていないことを確かめる。
    const bodyText = (await page.locator('body').innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(0);
    expect(bodyText).not.toMatch(/Unhandled Runtime Error|Application error|Internal Server Error/);
  });

  test('手順 3・4：新しいタブで 8787 番の /api/health を開くと、ok を含む JSON が表示される', async ({ context }) => {
    const page = await context.newPage();
    const response = await page.goto(HEALTH_URL);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toMatch(/application\/json/);

    // Chrome は JSON を整形して表示するため、画面の文字から ok を確かめる。
    const bodyText = (await page.locator('body').innerText()).trim();
    expect(bodyText).toContain('ok');
    expect(JSON.parse(bodyText)).toEqual({ status: 'ok' });
    await page.close();
  });

  test('手順 5：トップのタブを再読み込み（F5 相当）しても、同じ題名が表示される', async ({ page }) => {
    await page.goto(FRONT_URL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(APP_STRINGS.pageTitle);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(APP_STRINGS.pageTitle);
  });

  test('補助：画面の題名の文字はコードに直書きせず、src/config/strings.ts から読み込んでいる', () => {
    const source = readFileSync(PAGE_FILE, 'utf8');
    expect(source).not.toContain(APP_STRINGS.pageTitle);
    expect(source).not.toContain(APP_STRINGS.devPageNotice);
    expect(source).toContain('APP_STRINGS');
  });
});
