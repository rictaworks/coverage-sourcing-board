import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';

/**
 * PR #23（Issue #7、B4 Worker 用の JPEG 検査）のユーザーテスト手順を、ブラウザの操作で確かめる。
 * この PR は画面を変えないため、確認するのは「トップの表示が変わらないこと」だけです。
 * JPEG 検査の許可と拒否は、単体テスト（test/unit/core/jpeg/）で実装を呼んで確かめています。
 * 対象は開発サーバー（3000 番）だけです。本番の URL は使いません。
 */
const FRONT_URL = 'http://localhost:3000/';
// package.json は "type": "module" のため __dirname は使えません。Playwright はリポジトリ直下から実行します。
const PAGE_FILE = resolve(process.cwd(), 'src/frontend/app/page.tsx');

test.describe('PR #23 ユーザーテスト手順', () => {
  test('手順 1・2：http://localhost:3000 を開くと、題名と案内の文章が表示される（真っ白やエラーではない）', async ({ page }) => {
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

  test('手順 3：再読み込みしても、同じ題名と案内の文章が表示される', async ({ page }) => {
    await page.goto(FRONT_URL);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(APP_STRINGS.pageTitle);

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(APP_STRINGS.pageTitle);
    await expect(page.getByText(APP_STRINGS.devPageNotice)).toBeVisible();
  });

  test('補助：画面の文字はコードに直書きせず、src/config/strings.ts から読み込んでいる', () => {
    const source = readFileSync(PAGE_FILE, 'utf8');
    expect(source).not.toContain(APP_STRINGS.pageTitle);
    expect(source).not.toContain(APP_STRINGS.devPageNotice);
    expect(source).toContain('APP_STRINGS');
  });
});
