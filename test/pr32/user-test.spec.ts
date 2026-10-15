import { expect, test } from '@playwright/test';
import { SUBJECT_HINT_STRINGS } from '../../src/config/strings/subjectHint';

/**
 * PR #32（Issue #11、C4 被写体の推定）のユーザーテスト手順を確かめる。
 * この PR は画面の変更がないため、確認は「画面（3000 番）の表示が変わらないこと」と、API（8787 番）が応答することです。
 * 文言は src/config/strings/ の定数から読み込み、架空の値を書きません。
 * 対象は開発サーバー（http://localhost:3000 と http://localhost:8787）だけです。本番と外部の AI には接続しません。
 *
 * 確認項目：
 *  - PR 本文の「ユーザーテスト手順」1（前提：開発サーバーが起動していること）
 *  - PR 本文の「ユーザーテスト手順」2（ブラウザで http://localhost:3000 を開き、表示が変わらないこと）
 *  - API の健康確認（開発で Worker が応答すること。AI のバインディングは開発では無い）
 */
const FRONT_ORIGIN = 'http://localhost:3000';
const API_ORIGIN = 'http://localhost:8787';
const HEALTH_URL = `${API_ORIGIN}/api/health`;
const FOREIGN_HOST = 'example.invalid';

test.describe('PR #32 ユーザーテスト手順', () => {
  test('手順 2：http://localhost:3000 を開くと、200 で表示され、表示がこれまでと変わらない', async ({ page }) => {
    const response = await page.goto(`${FRONT_ORIGIN}/`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('amber-banner')).toBeVisible();
    // 被写体の推定は確認画面で使う補助の機能であり、トップの画面に新しい表示は加わらない。
    const text = await page.locator('body').innerText();
    expect(text).not.toContain(SUBJECT_HINT_STRINGS.noneMessage);
  });

  test('手順 2（続き）：画面に横スクロールがなく、エラーの表示もない', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${FRONT_ORIGIN}/`);
    await expect(page.getByTestId('amber-banner')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(pageErrors).toEqual([]);
  });

  test('前提：API（開発）の /api/health が {"status":"ok"} を返す', async ({ request }) => {
    const response = await request.get(HEALTH_URL);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('確認：許可されない Origin からの状態を変える要求は 403 になる（この PR の前と同じ）', async ({ request }) => {
    const response = await request.post(`${API_ORIGIN}/api/campaign`, {
      headers: { origin: `https://${FOREIGN_HOST}`, 'content-type': 'application/json' },
      data: {},
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);
    expect(((await response.json()) as { code: string }).code).toBe('origin_forbidden');
  });
});
