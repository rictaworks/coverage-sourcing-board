import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';

/**
 * PR #24（Issue #2、A2 基盤：共通の型・環境の判定・既定値と上限・文言の仕組み・ハードコード検査）の
 * ユーザーテスト手順を、ブラウザの操作で確かめる。この PR は画面の変更がない。
 * 対象は開発サーバー（3000 番と 8787 番）だけです。本番の URL は使いません。
 */
const FRONT_URL = 'http://localhost:3000/';
const HEALTH_URL = 'http://localhost:8787/api/health';
// package.json は "type": "module" のため __dirname は使えません。Playwright はリポジトリ直下から実行します。
const PAGE_FILE = resolve(process.cwd(), 'src/frontend/app/page.tsx');

test.describe('PR #24 ユーザーテスト手順', () => {
  test('手順 1：8787 番の /api/health を開くと、{"status":"ok"} が表示される', async ({ context }) => {
    const page = await context.newPage();
    const response = await page.goto(HEALTH_URL);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toMatch(/application\/json/);

    // Chrome は JSON を整形して表示するため、画面の文字を JSON として読み直して確かめる。
    const bodyText = (await page.locator('body').innerText()).trim();
    expect(JSON.parse(bodyText)).toEqual({ status: 'ok' });
    await page.close();
  });

  test('手順 2：3000 番のトップを開いても、表示が変わっていない（題名と案内の文が出ており、エラーではない）', async ({ page }) => {
    const response = await page.goto(FRONT_URL);
    expect(response?.status()).toBe(200);

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText(APP_STRINGS.pageTitle);
    await expect(page.getByText(APP_STRINGS.devPageNotice)).toBeVisible();

    // 開発サーバーのエラー画面（Next.js の Runtime Error など）が出ていないことを確かめる。
    const bodyText = (await page.locator('body').innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(0);
    expect(bodyText).not.toMatch(/Unhandled Runtime Error|Application error|Internal Server Error/);
  });

  test('補助：トップの画面は文言を src/config/strings.ts から読み込み、題名を直書きしていない', () => {
    const source = readFileSync(PAGE_FILE, 'utf8');
    expect(source).not.toContain(APP_STRINGS.pageTitle);
    expect(source).not.toContain(APP_STRINGS.devPageNotice);
    expect(source).toContain('APP_STRINGS');
  });
});
