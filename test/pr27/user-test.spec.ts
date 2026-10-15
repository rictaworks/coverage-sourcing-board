import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';

/**
 * PR #27（Issue #4、B1 キャンペーンのドメイン：区分値・季節・マス・受入条件・充足計算）の
 * ユーザーテスト手順を、ブラウザの操作で確かめる。この PR は画面の変更がない。
 * ドメインの中身（正規化・季節・マス・充足計算）は test/unit/core/campaign の Vitest が実装を呼び出して確かめる。
 * 対象は開発サーバー（3000 番）だけです。本番の URL は使いません。
 */
const FRONT_URL = 'http://localhost:3000/';
// package.json は "type": "module" のため __dirname は使えません。Playwright はリポジトリ直下から実行します。
const PAGE_FILE = resolve(process.cwd(), 'src/frontend/app/page.tsx');

test.describe('PR #27 ユーザーテスト手順', () => {
  test('手順 2：http://localhost:3000 を開くと、表示が変わらず、題名と案内の文が出ている（エラーではない）', async ({ page }) => {
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
