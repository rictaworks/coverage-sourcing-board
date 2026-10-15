import { expect, test } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';
import { TOP_STRINGS } from '../../src/config/strings/top';
import { PURGE_STRINGS } from '../../src/config/strings/purge';

/**
 * PR #31（Issue #13、C6 日次の全削除）のユーザーテスト手順を、ブラウザの操作で確かめる。
 * この PR は画面を変えないため、トップの表示が変わらないことを確かめます。
 * 文言は src/config/ から読み込み、画面の値と照合する（画面の文字列を直書きしない）。
 * 対象は開発サーバー（http://localhost:3000）だけです。本番の URL には接続しません。
 */
const TOP_URL = 'http://localhost:3000/';

test.describe('PR #31 ユーザーテスト手順（日次の全削除：表示が変わらないこと）', () => {
  test('手順 1：http://localhost:3000 を開くと、トップが表示される', async ({ page }) => {
    const response = await page.goto(TOP_URL);
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(APP_STRINGS.pageTitle);
    await expect(page.getByRole('heading', { level: 1, name: APP_STRINGS.pageTitle })).toBeVisible();
  });

  test('手順 2：トップの文章（説明・消去の時刻・役割の案内）が、これまでどおり表示される', async ({ page }) => {
    await page.goto(TOP_URL);

    await expect(page.getByText(TOP_STRINGS.lead, { exact: true })).toBeVisible();
    await expect(page.getByText(TOP_STRINGS.eraseNotice, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: TOP_STRINGS.roleHeading })).toBeVisible();
    await expect(page.getByText(TOP_STRINGS.roleNotice, { exact: true })).toBeVisible();
  });

  test('手順 3：削除の失敗の文言など、開発者向けの文言が画面に出ない', async ({ page }) => {
    await page.goto(TOP_URL);
    await expect(page.getByRole('heading', { name: TOP_STRINGS.roleHeading })).toBeVisible();

    // 削除の失敗の文言は、開発者向けのログ用であり、画面には出ないこと。
    await expect(page.getByText(PURGE_STRINGS.errorPurgeFailed, { exact: false })).toHaveCount(0);
    // 画面の文章が読める状態であること（本文が空ではない）。
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
    expect(bodyText).toContain(APP_STRINGS.pageTitle);
  });
});
