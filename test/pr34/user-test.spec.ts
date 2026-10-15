import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { COVERAGE_STRINGS } from '../../src/config/strings/coverage';

/**
 * PR #34（Issue #15、D2 充足マップの画面）のユーザーテスト手順を、ブラウザで 1 手順ずつ確かめる。
 * PR 本文の手順 1〜6 を、手順ごとのテストにしています。
 * 対象は開発サーバー（http://localhost:3000）だけです。本番の URL には接続しません。
 * テンプレートの読み込みは、開発の API（同一オリジンの /api/ を Workers へ転送）に直接行います。ログインはありません。
 */
const FRONT_URL = 'http://localhost:3000';
const COVERAGE_URL = `${FRONT_URL}/coverage`;
const MOBILE_VIEWPORT = { width: 375, height: 812 };
const TEMPLATE_URL = new URL('../../data/templates/shikoku-landscape.json', import.meta.url);

interface TemplateFile {
  readonly areas: readonly unknown[];
  readonly periods: readonly { readonly label: string }[];
  readonly requiredPerCell: number;
}

const TEMPLATE = JSON.parse(readFileSync(TEMPLATE_URL, 'utf8')) as TemplateFile;
const CELL_COUNT = TEMPLATE.areas.length * TEMPLATE.periods.length;
const SEASON_LABELS = TEMPLATE.periods.map((period) => period.label);
const EMPTY_CELL_TEXT = `0${COVERAGE_STRINGS.countSeparator}${TEMPLATE.requiredPerCell}`;
/** 「採用数／必要数」の形（例：0／3）。 */
const COUNT_PATTERN = new RegExp(`^\\d+${COVERAGE_STRINGS.countSeparator}\\d+`);

/** テンプレートを読み込み、このブラウザのセッションにキャンペーンを作ります（ページ操作の前提）。 */
async function loadTemplate(page: Page): Promise<void> {
  const response = await page.request.post(`${FRONT_URL}/api/campaign/template`, {
    headers: { origin: FRONT_URL, 'content-type': 'application/json' },
    data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
  });
  expect([200, 201]).toContain(response.status());
}

/** 表の 1 マス（tbody の td）を、すべて返します。 */
function tableCells(page: Page) {
  return page.getByRole('table', { name: COVERAGE_STRINGS.tableCaption }).locator('tbody td');
}

test.describe('PR #34 ユーザーテスト手順（充足マップの画面）', () => {
  test.beforeEach(async ({ page }) => {
    await loadTemplate(page);
  });

  test('手順 1：http://localhost:3000/coverage を開くと、充足マップの画面が表示される', async ({ page }) => {
    const response = await page.goto(COVERAGE_URL);
    expect(response?.status()).toBe(200);
    await expect(page.getByText(COVERAGE_STRINGS.lead)).toBeVisible();
    await expect(page.getByRole('table', { name: COVERAGE_STRINGS.tableCaption })).toBeVisible();
  });

  test('手順 2：表の見出しに「エリア」と、季節の見出し（テンプレートの季節）が見える', async ({ page }) => {
    await page.goto(COVERAGE_URL);
    const table = page.getByRole('table', { name: COVERAGE_STRINGS.tableCaption });
    await expect(table).toBeVisible();

    await expect(table.getByRole('columnheader', { name: COVERAGE_STRINGS.columnArea, exact: true })).toBeVisible();
    for (const label of SEASON_LABELS) {
      await expect(table.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
    }
  });

  test('手順 3：各マスに「採用数／必要数」の形（例：0／3）で数が出ている', async ({ page }) => {
    await page.goto(COVERAGE_URL);
    const cells = tableCells(page);
    await expect(cells).toHaveCount(CELL_COUNT);

    await expect(cells.filter({ hasText: EMPTY_CELL_TEXT })).toHaveCount(CELL_COUNT);
    // 各マスの先頭の span（採用数／必要数）を、マスごとに 1 つずつ読みます。
    const texts = await cells.locator('span:first-child').allTextContents();
    expect(texts).toHaveLength(CELL_COUNT);
    for (const text of texts) {
      expect(text.trim()).toMatch(COUNT_PATTERN);
    }
  });

  test('手順 4：未充足のマスに、色だけでなく「未充足」の文字と印が付いている', async ({ page }) => {
    await page.goto(COVERAGE_URL);
    const cells = tableCells(page);
    await expect(cells).toHaveCount(CELL_COUNT);

    // 採用が 0 件のテンプレートでは、全マスが未充足です。
    const unfilled = cells.filter({ hasText: COVERAGE_STRINGS.unfilledBadge });
    await expect(unfilled).toHaveCount(CELL_COUNT);

    const firstBadge = unfilled.first().locator('span').filter({ hasText: COVERAGE_STRINGS.unfilledBadge });
    await expect(firstBadge).toBeVisible();
    // 印（Font Awesome のアイコン）は SVG で描かれます。
    await expect(firstBadge.locator('svg')).toHaveCount(1);
  });

  test('手順 5：画面の下のほうに「いま求めている場所」の一覧が出ている', async ({ page }) => {
    await page.goto(COVERAGE_URL);
    const section = page.locator('section[aria-labelledby="coverage-wanted-heading"]');
    await expect(section.getByRole('heading', { name: COVERAGE_STRINGS.wantedHeading })).toBeVisible();
    await expect(section.getByText(COVERAGE_STRINGS.wantedDescription)).toBeVisible();

    const items = section.locator('ol > li');
    await expect(items).toHaveCount(CELL_COUNT);

    // 一覧は画面の下のほうにあります（表より下）。
    const tableBox = await page.getByRole('table', { name: COVERAGE_STRINGS.tableCaption }).boundingBox();
    const listBox = await section.boundingBox();
    expect(tableBox).not.toBeNull();
    expect(listBox).not.toBeNull();
    expect((listBox?.y ?? 0) > (tableBox?.y ?? 0)).toBe(true);
  });

  test('手順 6：スマートフォンの幅（375 px）で、ページ全体は横にずれず、表は枠の中でだけスクロールする', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(COVERAGE_URL);
    await expect(page.getByRole('table', { name: COVERAGE_STRINGS.tableCaption })).toBeVisible();

    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow).toBeLessThanOrEqual(0);

    const wrap = page.getByRole('region', { name: COVERAGE_STRINGS.tableRegionLabel });
    const wrapScrolls = await wrap.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(wrapScrolls).toBe(true);
  });
});
