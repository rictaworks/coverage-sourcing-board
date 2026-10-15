import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';

/**
 * PR #22（Issue #5、B2 画像の特徴量の純粋関数）のユーザーテスト手順を、ブラウザの操作で確かめる。
 * この PR は画面を変えないため、トップの表示がこれまでと変わらないことを確かめます。
 * 画像の特徴量の関数そのものは、Vitest の既存テスト（test/unit/core/image/）で確かめます。
 * 対象は開発サーバー（3000 番）だけです。本番の URL は使いません。
 */
const FRONT_URL = 'http://localhost:3000/';
// package.json は "type": "module" のため __dirname は使えません。Playwright はリポジトリ直下から実行します。
const PAGE_FILE = resolve(process.cwd(), 'src/frontend/app/page.tsx');

test.describe('PR #22 ユーザーテスト手順', () => {
  test('手順：http://localhost:3000 を開くと、題名が表示される（真っ白やエラーではない）', async ({ page }) => {
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

  test('手順：開発環境の確認用の文章も、これまでどおり表示される', async ({ page }) => {
    await page.goto(FRONT_URL);
    await expect(page.getByText(APP_STRINGS.devPageNotice)).toBeVisible();
  });

  test('手順：トップのタブを再読み込み（F5 相当）しても、同じ題名が表示される', async ({ page }) => {
    await page.goto(FRONT_URL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(APP_STRINGS.pageTitle);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(APP_STRINGS.pageTitle);
  });

  test('補助：トップの画面は画像の特徴量の部品を読み込んでいない（この PR は画面を変えていない）', () => {
    const source = readFileSync(PAGE_FILE, 'utf8');
    expect(source).not.toContain('core/image');
    expect(source).toContain('APP_STRINGS');
    expect(source).not.toContain(APP_STRINGS.pageTitle);
  });
});
