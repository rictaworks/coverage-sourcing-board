import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { COVERAGE_STRINGS, COVERAGE_SUBMIT_LINK } from '../../src/config/strings/coverage';
import { STATUS_NOTICES } from '../../src/config/strings/status';

/**
 * 充足マップの画面（D2、Issue #15）のブラウザでの確認。対象は開発サーバー（http://localhost:3000）だけです。
 * テンプレートの読み込みは、開発の API（同一オリジンの /api/ を Workers へ転送）に直接行います。
 * ログインはありません（セッションの Cookie だけで区別されます）。
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
const EMPTY_CELL_TEXT = `0${COVERAGE_STRINGS.countSeparator}${TEMPLATE.requiredPerCell}`;
const SEASON_HEADERS = [
  COVERAGE_STRINGS.columnPrefecture,
  COVERAGE_STRINGS.columnArea,
  ...TEMPLATE.periods.map((period) => period.label),
];

/** テンプレートを読み込み、このブラウザのセッションにキャンペーンを作ります（API を直接呼びます）。 */
async function loadTemplate(page: Page): Promise<void> {
  const response = await page.request.post(`${FRONT_URL}/api/campaign/template`, {
    headers: { origin: FRONT_URL, 'content-type': 'application/json' },
    data: { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId },
  });
  expect([200, 201]).toContain(response.status());
}

test('キャンペーンが無いときは、キャンペーン設定へ案内します', async ({ page }) => {
  await page.goto(COVERAGE_URL);
  await expect(page.getByRole('heading', { name: COVERAGE_STRINGS.campaignNotFoundHeading })).toBeVisible();
  await expect(page.getByRole('link', { name: COVERAGE_STRINGS.campaignLinkLabel })).toHaveAttribute(
    'href',
    COVERAGE_STRINGS.campaignLinkHref,
  );
});

test('テンプレートを読み込むと、全マスの表といま求めている場所が表示されます', async ({ page }) => {
  await loadTemplate(page);
  await page.goto(COVERAGE_URL);

  const table = page.getByRole('table', { name: COVERAGE_STRINGS.tableCaption });
  await expect(table).toBeVisible();
  await expect(table.locator('tbody td')).toHaveCount(CELL_COUNT);
  await expect(table.locator('tbody td', { hasText: EMPTY_CELL_TEXT })).toHaveCount(CELL_COUNT);
  await expect(table.locator('tbody td', { hasText: COVERAGE_STRINGS.unfilledBadge })).toHaveCount(CELL_COUNT);
  await expect(table.locator('thead th')).toHaveText(SEASON_HEADERS);

  await expect(page.locator('ol > li')).toHaveCount(CELL_COUNT);
  await expect(page.getByText(STATUS_NOTICES.noRealTransaction)).toBeVisible();

  const firstLink = page.locator('ol > li a').first();
  await expect(firstLink).toHaveAttribute(
    'href',
    new RegExp(`^${COVERAGE_SUBMIT_LINK.path}\\?${COVERAGE_SUBMIT_LINK.areaParam}=.+&${COVERAGE_SUBMIT_LINK.periodParam}=.+$`),
  );
});

test('375 px の幅でも、ページ全体の横のスクロールは起きず、表は枠の中でスクロールします', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  await loadTemplate(page);
  await page.goto(COVERAGE_URL);
  await expect(page.getByRole('table', { name: COVERAGE_STRINGS.tableCaption })).toBeVisible();

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(pageOverflow).toBeLessThanOrEqual(0);

  const wrap = page.getByRole('region', { name: COVERAGE_STRINGS.tableRegionLabel });
  const wrapScrolls = await wrap.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(wrapScrolls).toBe(true);

  await wrap.focus();
  await expect(wrap).toBeFocused();
});
