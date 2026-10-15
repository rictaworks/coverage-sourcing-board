import { expect, test, type Page } from '@playwright/test';
import { CAMPAIGN_API_ERROR_MESSAGES } from '../../src/config/strings/campaignApi';
import { CAMPAIGN_SETTINGS_STRINGS } from '../../src/config/strings/campaignSettings';
import { PAGE_TITLES } from '../../src/config/strings/layout';
import { CAMPAIGN_SETTINGS_INPUTS as IN } from '../fixtures/campaign-settings-inputs';

/**
 * キャンペーン設定の画面（D6、Issue #19）の確認。対象は開発サーバー（http://localhost:3000）だけです。
 * テストごとに新しいブラウザのコンテキストを使うため、セッション（Cookie）も毎回新しくなります。
 * 書き込みの要求は、Worker のレート制限（10 秒に 5 回まで）に収まるように数えて作っています。
 */
const CAMPAIGN_URL = 'http://localhost:3000/campaign';
const SEASON_COUNT = 4;
const AREA_COUNT = 21;
const TEMPLATE_AREA_LABEL = IN.areaTokushima;

/** 画面を開き、テンプレートを読み込むまでを行います。 */
async function openAndLoadTemplate(page: Page): Promise<void> {
  await page.goto(CAMPAIGN_URL);
  await expect(page).toHaveTitle(PAGE_TITLES.campaign);
  await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.loadButton }).click();
  await expect(page.getByRole('table')).toBeVisible();
}

/** 必要数の欄（マスごと）を、ラベルの名前で探します。 */
function cellInput(page: Page, area: string, season: string) {
  return page.getByLabel(CAMPAIGN_SETTINGS_STRINGS.cellLabel(area, season), { exact: true });
}

test.describe('キャンペーン設定（D6）', () => {
  test('テンプレートを読み込むと、21 エリア × 4 季節の表と受入条件が出て、幅 375 px でも横にはみ出しません', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await openAndLoadTemplate(page);

    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(AREA_COUNT);
    const headers = page.locator('thead th');
    await expect(headers).toHaveCount(SEASON_COUNT + 1);
    await expect(page.getByRole('heading', { name: CAMPAIGN_SETTINGS_STRINGS.ruleHeading })).toBeVisible();
    await expect(page.getByText(CAMPAIGN_SETTINGS_STRINGS.ruleRatioValue)).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('一律の必要数を 2 にして保存すると、サーバーの必要数が 2 になります', async ({ page }) => {
    await openAndLoadTemplate(page);
    await page.getByLabel(CAMPAIGN_SETTINGS_STRINGS.uniformLabel).fill('2');
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.uniformButton }).click();
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.saveButton }).click();
    await expect(page.getByText(CAMPAIGN_SETTINGS_STRINGS.saved)).toBeVisible();

    const response = await page.request.get('/api/campaign');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { cells: { required: number }[] };
    expect(body.cells).toHaveLength(AREA_COUNT * SEASON_COUNT);
    expect(body.cells.every((cell) => cell.required === 2)).toBe(true);

    // 充足マップ（/coverage）はこの Issue の後に作られるため、充足の API で「0／2」に相当する値を確かめます。
    const coverage = await page.request.get('/api/coverage');
    const coverageBody = (await coverage.json()) as { cells: { accepted: number; required: number }[] };
    expect(coverageBody.cells.every((cell) => cell.accepted === 0 && cell.required === 2)).toBe(true);
  });

  test('必要数が 0 のマスは、欄の近くに文字で示し、保存しません', async ({ page }) => {
    await openAndLoadTemplate(page);
    const input = cellInput(page, TEMPLATE_AREA_LABEL, IN.seasonSpring);
    await input.fill('0');
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.saveButton }).click();
    await expect(page.getByText(CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range).first()).toBeVisible();
    await expect(page.getByText(CAMPAIGN_SETTINGS_STRINGS.saved)).toHaveCount(0);
  });

  test('重複する区分値の追加は、エラーを画面に出し、一覧は増えません', async ({ page }) => {
    await openAndLoadTemplate(page);
    await page.getByLabel(CAMPAIGN_SETTINGS_STRINGS.areaLabelLabel).fill(TEMPLATE_AREA_LABEL);
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.areaAddButton }).click();
    await expect(page.getByText(CAMPAIGN_API_ERROR_MESSAGES.area_duplicate)).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(AREA_COUNT);
  });

  test('区分値は文字として表示され、HTML として解釈されません', async ({ page }) => {
    await openAndLoadTemplate(page);
    const label = IN.areaHtml;
    await page.getByLabel(CAMPAIGN_SETTINGS_STRINGS.areaLabelLabel).fill(label);
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.areaAddButton }).click();
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    await expect(page.locator('b', { hasText: IN.areaHtmlText })).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(AREA_COUNT + 1);
  });

  test('キャンペーンが無いときは、読み込みのボタンを出します', async ({ page }) => {
    await page.goto(CAMPAIGN_URL);
    await expect(page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.loadButton })).toBeVisible();
  });
});
