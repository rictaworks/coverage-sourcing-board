import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';

/**
 * PR #25（Issue #3、A3 D1 のスキーマ・テンプレート・API 契約）のユーザーテスト手順を、ブラウザの操作で確かめる。
 * この PR は画面の変更がない。確認は「3000 番のトップの表示が変わっていないこと」（前提の確認）だけです。
 * 対象は開発サーバー（3000 番と 8787 番）だけです。本番の URL は使いません。
 * マス 84 などの件数は、test/unit/data/template.test.ts が実装（テンプレートの JSON）を読んで確かめます。
 */
const FRONT_URL = 'http://localhost:3000/';
const HEALTH_URL = 'http://localhost:8787/api/health';
// package.json は "type": "module" のため __dirname は使えません。Playwright はリポジトリ直下から実行します。
const PAGE_FILE = resolve(process.cwd(), 'src/frontend/app/page.tsx');

test.describe('PR #25 ユーザーテスト手順', () => {
  test('手順 1：ブラウザで http://localhost:3000 を開くと、題名と案内の文が表示される', async ({ page }) => {
    const response = await page.goto(FRONT_URL);
    expect(response?.status()).toBe(200);

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText(APP_STRINGS.pageTitle);
    await expect(page.getByText(APP_STRINGS.devPageNotice)).toBeVisible();
  });

  test('手順 2：表示が変わっていない（開発サーバーのエラー画面が出ていない）', async ({ page }) => {
    await page.goto(FRONT_URL);

    const bodyText = (await page.locator('body').innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(0);
    expect(bodyText).not.toMatch(/Unhandled Runtime Error|Application error|Internal Server Error|Failed to compile/);
  });

  test('前提：8787 番の /api/health が {"status":"ok"} を返す（API の土台が起動している）', async ({ request }) => {
    const response = await request.get(HEALTH_URL);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('補助：トップの画面は文言を src/config/strings.ts から読み込み、題名を直書きしていない', () => {
    const source = readFileSync(PAGE_FILE, 'utf8');
    expect(source).not.toContain(APP_STRINGS.pageTitle);
    expect(source).not.toContain(APP_STRINGS.devPageNotice);
    expect(source).toContain('APP_STRINGS');
  });
});
