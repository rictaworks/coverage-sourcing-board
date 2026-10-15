import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';

/**
 * PR #26（Issue #6、B3 一次判定・重複の判定・日の出と日の入り）のユーザーテスト手順を、
 * ブラウザの操作で確かめる。この PR は画面の変更がないため、トップの表示が変わらないことを確かめる。
 * 判定の中身（Validator・DuplicateChecker・SunCalculator）は test/unit/core/validation/ の
 * Vitest テストが実装を直接呼び出して確かめている。ここでは開発サーバーの表示だけを見る。
 * 対象は開発サーバー（http://localhost:3000）だけです。本番の URL は使いません。
 */
const FRONT_URL = 'http://localhost:3000/';
// Playwright はリポジトリ直下から実行する（package.json は "type": "module" のため __dirname は使えない）。
const PAGE_FILE = resolve(process.cwd(), 'src/frontend/app/page.tsx');

test.describe('PR #26 ユーザーテスト手順', () => {
  test('手順 1：http://localhost:3000 を開くと、ページが表示される（ステータス 200）', async ({ page }) => {
    const response = await page.goto(FRONT_URL);
    expect(response?.status()).toBe(200);
  });

  test('手順 2：表示が変わっていない（題名と案内の文が出ており、エラーの画面ではない）', async ({ page }) => {
    await page.goto(FRONT_URL);

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText(APP_STRINGS.pageTitle);
    await expect(page.getByText(APP_STRINGS.devPageNotice)).toBeVisible();

    // 開発サーバーのエラー画面（Next.js の Runtime Error など）が出ていないことを確かめる。
    const bodyText = (await page.locator('body').innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(0);
    expect(bodyText).not.toMatch(/Unhandled Runtime Error|Application error|Internal Server Error/);
  });

  test('補助：トップの画面は判定の実装（core/validation）を読み込んでいない（画面の変更がないこと）', () => {
    const source = readFileSync(PAGE_FILE, 'utf8');
    expect(source).not.toMatch(/core\/validation/);
    expect(source).not.toMatch(/Validator|DuplicateChecker|SunCalculator/);
    expect(source).toContain('APP_STRINGS');
  });
});
