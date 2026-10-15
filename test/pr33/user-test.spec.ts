import { readFileSync } from 'node:fs';
import { expect, test, type APIResponse } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';

/**
 * PR #33（Issue #9、C2 キャンペーンと充足マップの API）のユーザーテストを実行する。
 * 画面の変更はないため、ブラウザでは http://localhost:3000 の表示が変わらないことを確かめ、
 * API の経路は開発の Workers（http://localhost:8787）に対して request API で確かめる。
 * 対象は開発サーバーだけです。本番の URL には接続しません。
 */
const FRONT_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8787';
/** 状態を変える要求は Origin が必要（開発では http://localhost:3000 を許可）。 */
const ORIGIN_HEADER = { origin: FRONT_URL };
const TEMPLATE_URL = new URL('../../data/templates/shikoku-landscape.json', import.meta.url);

interface TemplateFile {
  readonly areas: readonly unknown[];
  readonly periods: readonly unknown[];
}

interface CampaignBody {
  readonly id: string;
  readonly name: string;
  readonly areas: readonly unknown[];
  readonly periods: readonly unknown[];
  readonly cells: readonly unknown[];
  readonly acceptRule: unknown;
}

interface CoverageBody {
  readonly cells: readonly { cellId: string; accepted: number; pendingReview: number; required: number; closed: boolean }[];
  readonly priority: readonly string[];
}

/** セッションの Cookie（csid）を、最初の応答の Set-Cookie から取り出す。Cookie の値はログに出さない。 */
function sessionCookieFrom(response: APIResponse): string {
  const setCookie = response.headers()['set-cookie'] ?? '';
  const match = /csid=([^;]+)/.exec(setCookie);
  expect(match, 'Set-Cookie must contain csid').not.toBeNull();
  return `csid=${match?.[1] ?? ''}`;
}

test.describe('PR #33 ユーザーテスト手順（キャンペーンと充足マップの API）', () => {
  test('手順 1：http://localhost:3000 の表示が変わらない（トップのタイトルと本文）', async ({ page }) => {
    const response = await page.goto(`${FRONT_URL}/`);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(APP_STRINGS.pageTitle);
    await expect(page.locator('body')).toBeVisible();
  });

  test('手順 2：テンプレートの読み込み（POST /api/campaign/template）が 201 で、四国の 21 エリアと 84 マスを返す', async ({ request }) => {
    const template = JSON.parse(readFileSync(TEMPLATE_URL, 'utf8')) as TemplateFile;
    const areaCount = template.areas.length;
    const cellCount = template.areas.length * template.periods.length;
    expect(areaCount).toBe(21);
    expect(cellCount).toBe(84);

    const first = await request.get(`${API_URL}/api/session`, { headers: ORIGIN_HEADER });
    expect(first.status()).toBe(200);
    const cookie = sessionCookieFrom(first);

    const response = await request.post(`${API_URL}/api/campaign/template`, {
      headers: { ...ORIGIN_HEADER, cookie, 'content-type': 'application/json' },
      data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
    });
    expect(response.status()).toBe(201);
    const body = (await response.json()) as CampaignBody;
    expect(body.areas.length).toBe(areaCount);
    expect(body.periods.length).toBe(template.periods.length);
    expect(body.cells.length).toBe(cellCount);
  });

  test('手順 3：キャンペーンの取得（GET /api/campaign）が 200 で、読み込んだ内容を返す', async ({ request }) => {
    const session = await request.get(`${API_URL}/api/session`, { headers: ORIGIN_HEADER });
    const cookie = sessionCookieFrom(session);
    await request.post(`${API_URL}/api/campaign/template`, {
      headers: { ...ORIGIN_HEADER, cookie, 'content-type': 'application/json' },
      data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
    });

    const response = await request.get(`${API_URL}/api/campaign`, { headers: { cookie } });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as CampaignBody;
    expect(typeof body.id).toBe('string');
    expect(body.areas.length).toBe(21);
    expect(body.cells.length).toBe(84);
    expect(body.acceptRule).toBeTruthy();
  });

  test('手順 4：充足の取得（GET /api/coverage）が 200 で、84 マスの採用数・確認待ち数・必要数と優先順を返す', async ({ request }) => {
    const session = await request.get(`${API_URL}/api/session`, { headers: ORIGIN_HEADER });
    const cookie = sessionCookieFrom(session);
    await request.post(`${API_URL}/api/campaign/template`, {
      headers: { ...ORIGIN_HEADER, cookie, 'content-type': 'application/json' },
      data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
    });

    const response = await request.get(`${API_URL}/api/coverage`, { headers: { cookie } });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as CoverageBody;
    expect(body.cells.length).toBe(84);
    expect(body.priority.length).toBe(84);
    for (const cell of body.cells) {
      expect(cell.accepted).toBe(0);
      expect(cell.pendingReview).toBe(0);
      expect(cell.required).toBeGreaterThanOrEqual(1);
      expect(cell.closed).toBe(false);
    }
  });

  test('手順 5：別のセッション（別の Cookie）は、テンプレートを読み込んでいないキャンペーンを見られない（404）', async ({ playwright }) => {
    // 別のセッションにするため、Cookie を共有しない別々の要求の入れ物を使う。
    const contextA = await playwright.request.newContext();
    const contextB = await playwright.request.newContext();
    try {
      const cookieA = sessionCookieFrom(await contextA.get(`${API_URL}/api/session`, { headers: ORIGIN_HEADER }));
      const cookieB = sessionCookieFrom(await contextB.get(`${API_URL}/api/session`, { headers: ORIGIN_HEADER }));
      expect(cookieA).not.toBe(cookieB);

      await contextA.post(`${API_URL}/api/campaign/template`, {
        headers: { ...ORIGIN_HEADER, cookie: cookieA, 'content-type': 'application/json' },
        data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
      });
      const response = await contextB.get(`${API_URL}/api/campaign`, { headers: { cookie: cookieB } });
      expect(response.status()).toBe(404);
    } finally {
      await contextA.dispose();
      await contextB.dispose();
    }
  });
});
