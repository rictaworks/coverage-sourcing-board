import { expect, test } from '@playwright/test';
import { WORKER_STRINGS } from '../../src/config/strings/worker';

/**
 * PR #29（Issue #8、C1 Worker の基盤）のユーザーテスト手順を確かめる。
 * 文言は src/config/strings/worker.ts の定数から読み込み、応答の値と照合する（架空の値を書かない）。
 * 対象は開発サーバー（http://localhost:8787 の API と http://localhost:3000 の画面）だけです。本番には接続しません。
 *
 * 確認項目：
 *  - PR 本文の「ユーザーテスト手順」1・2（ブラウザで開く）
 *  - PR 本文の「確かめたこと」にある 400（不正な %）、および「変更内容」の Origin の 403（状態を変える要求）
 *  - 画面（3000 番）が、この PR の前と同じく応答すること（画面の変更はない）
 */
const API_ORIGIN = 'http://localhost:8787';
const FRONT_ORIGIN = 'http://localhost:3000';
const HEALTH_URL = `${API_ORIGIN}/api/health`;
const CAMPAIGN_URL = `${API_ORIGIN}/api/campaign`;
// PR 本文の例（確かめたこと）。:id の位置に不正な % の並びを置く。/api/%ZZ のように経路に一致しない場合は 404 になる（経路の振り分けの仕様）。
const BAD_PERCENT_URL = `${API_ORIGIN}/api/submissions/%E0%A4%A/image`;
const FOREIGN_ORIGIN = 'https://example.invalid';

test.describe('PR #29 ユーザーテスト手順', () => {
  test('手順 1：/api/health を開くと、{"status":"ok"} が表示される', async ({ page }) => {
    const response = await page.goto(HEALTH_URL);
    expect(response?.status()).toBe(200);
    const body = await page.locator('body').innerText();
    expect(JSON.parse(body)).toEqual({ status: 'ok' });
  });

  test('手順 2：/api/campaign を開くと、501 と not_implemented、未実装の文言が表示される', async ({ page }) => {
    const response = await page.goto(CAMPAIGN_URL);
    expect(response?.status()).toBe(501);
    const body = JSON.parse(await page.locator('body').innerText()) as { code: string; message: string };
    expect(body.code).toBe('not_implemented');
    expect(body.message).toBe(WORKER_STRINGS.errorMessages.not_implemented);
  });

  test('確認 3：不正な % の並び（/api/submissions/%E0%A4%A/image）は 400 と invalid_request を返す', async ({ request }) => {
    const response = await request.get(BAD_PERCENT_URL);
    expect(response.status()).toBe(400);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('invalid_request');
  });

  test('確認 4：状態を変える要求で、許可されない Origin は 403 になる', async ({ request }) => {
    const response = await request.post(CAMPAIGN_URL, {
      headers: { origin: FOREIGN_ORIGIN, 'content-type': 'application/json' },
      data: {},
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('origin_forbidden');
    expect(body.message).toBe(WORKER_STRINGS.errorMessages.origin_forbidden);
  });

  test('確認 5：画面（http://localhost:3000）は、この PR の前と同じく 200 で表示される', async ({ page }) => {
    const response = await page.goto(`${FRONT_ORIGIN}/`);
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('amber-banner')).toBeVisible();
  });
});
