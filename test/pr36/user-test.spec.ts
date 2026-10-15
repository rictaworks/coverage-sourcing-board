import { expect, test, type APIResponse } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';

/**
 * PR #36（Issue #12、C5 最終確認と投稿の参照の API）のユーザーテストを実行する。
 * 画面の変更はないため、ブラウザでは http://localhost:3000 の表示が変わらないことを確かめ、
 * API の経路は開発の Workers（http://localhost:8787）に対して request API で確かめる。
 * 対象は開発サーバーだけです。本番の URL には接続しません。
 */
const FRONT_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8787';
/** 状態を変える要求は Origin が必要。GET でも OriginGuard が働くため、開発の Origin を付ける。 */
const ORIGIN_HEADER = { origin: FRONT_URL };

interface ReviewQueueBody {
  readonly items: readonly unknown[];
  readonly accepted: unknown;
}

interface MineBody {
  readonly items: readonly unknown[];
}

/** セッションの Cookie（csid）を、最初の応答の Set-Cookie から取り出す。Cookie の値はログに出さない。 */
function sessionCookieFrom(response: APIResponse): string {
  const setCookie = response.headers()['set-cookie'] ?? '';
  const match = /csid=([^;]+)/.exec(setCookie);
  expect(match, 'Set-Cookie must contain csid').not.toBeNull();
  return `csid=${match?.[1] ?? ''}`;
}

test.describe('PR #36 ユーザーテスト手順（最終確認と投稿の参照の API）', () => {
  test('手順 1：http://localhost:3000 の表示が変わらない（トップのタイトルと本文）', async ({ page }) => {
    const response = await page.goto(`${FRONT_URL}/`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(APP_STRINGS.pageTitle);
    await expect(page.locator('body')).toBeVisible();
  });

  test('手順 2：確認キュー（GET /api/review/queue）が 200 で、投稿がない状態の items は空、Cache-Control は no-store', async ({ request }) => {
    const session = await request.get(`${API_URL}/api/session`, { headers: ORIGIN_HEADER });
    expect(session.status()).toBe(200);
    const cookie = sessionCookieFrom(session);

    const response = await request.get(`${API_URL}/api/review/queue`, { headers: { ...ORIGIN_HEADER, cookie } });
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    const body = (await response.json()) as ReviewQueueBody;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(0);
  });

  test('手順 3：自分の投稿の一覧（GET /api/submissions/mine）が 200 で、投稿がない状態の items は空', async ({ request }) => {
    const session = await request.get(`${API_URL}/api/session`, { headers: ORIGIN_HEADER });
    expect(session.status()).toBe(200);
    const cookie = sessionCookieFrom(session);

    const response = await request.get(`${API_URL}/api/submissions/mine`, { headers: { ...ORIGIN_HEADER, cookie } });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as MineBody;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(0);
  });
});
