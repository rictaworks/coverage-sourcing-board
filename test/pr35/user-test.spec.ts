import { expect, test, type Page } from '@playwright/test';
import { CAMPAIGN_API_ERROR_MESSAGES } from '../../src/config/strings/campaignApi';
import { CAMPAIGN_SETTINGS_STRINGS } from '../../src/config/strings/campaignSettings';
import { PAGE_TITLES } from '../../src/config/strings/layout';
import { CAMPAIGN_SETTINGS_INPUTS as IN } from '../fixtures/campaign-settings-inputs';

/**
 * PR #35（Issue #19、D6 キャンペーン設定の画面）のユーザーテスト手順を、ブラウザで 1 手順ずつ確かめます。
 * 対象は開発サーバー（http://localhost:3000 と http://localhost:8787）だけです。本番の URL には接続しません。
 * テストごとに新しいブラウザのコンテキストを使うため、セッション（Cookie）も毎回新しくなります。
 * 書き込みの要求は、Worker のレート制限（10 秒に 5 回まで）に収まる数で作っています。
 */
const CAMPAIGN_URL = 'http://localhost:3000/campaign';
const AREA_COUNT = 21;
const SEASON_COUNT = 4;
const OUT_OF_RANGE_VALUE = '1000';
const IN_RANGE_VALUE = '2';


/** 「テンプレートを読み込む」を押し、表が出るまで待ちます。 */
async function openAndLoadTemplate(page: Page): Promise<void> {
  await page.goto(CAMPAIGN_URL);
  await expect(page).toHaveTitle(PAGE_TITLES.campaign);
  await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.loadButton }).click();
  await expect(page.getByRole('table')).toBeVisible();
}

/** 必要数の欄（エリアと季節の組）を、ラベルの名前で探します。 */
function cellInput(page: Page, area: string, season: string) {
  return page.getByLabel(CAMPAIGN_SETTINGS_STRINGS.cellLabel(area, season), { exact: true });
}

test.describe('PR #35 ユーザーテスト手順（キャンペーン設定の画面）', () => {
  test('手順 1：http://localhost:3000/campaign を開くと、キャンペーン設定の画面が表示されます', async ({ page }) => {
    const response = await page.goto(CAMPAIGN_URL);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(PAGE_TITLES.campaign);
    await expect(page.getByText(CAMPAIGN_SETTINGS_STRINGS.intro)).toBeVisible();
    await expect(page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.loadButton })).toBeVisible();
  });

  test('手順 2：「テンプレートを読み込む」を押すと、四国の 21 エリアと 4 つの季節のマス目が表示されます', async ({ page }) => {
    await openAndLoadTemplate(page);

    await expect(page.locator('tbody tr')).toHaveCount(AREA_COUNT);
    await expect(page.locator('thead th')).toHaveCount(SEASON_COUNT + 1);
    await expect(page.getByText(CAMPAIGN_SETTINGS_STRINGS.loadedNotice)).toBeVisible();
  });

  test('手順 3：区分を追加できます。同じ名前をもう一度追加すると、重複の案内が出て一覧は増えません', async ({ page }) => {
    await openAndLoadTemplate(page);

    // 1 回目の追加：一覧に追加したエリアが出ます。
    await page.getByLabel(CAMPAIGN_SETTINGS_STRINGS.areaLabelLabel).fill(IN.areaNew);
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.areaAddButton }).click();
    await expect(page.getByText(CAMPAIGN_SETTINGS_STRINGS.areaAdded(IN.areaNew))).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(AREA_COUNT + 1);
    await expect(page.getByText(IN.areaNew, { exact: true }).first()).toBeVisible();

    // 2 回目の追加（同じ名前）：重複の案内が出て、追加されません。
    await page.getByLabel(CAMPAIGN_SETTINGS_STRINGS.areaLabelLabel).fill(IN.areaNew);
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.areaAddButton }).click();
    await expect(page.getByText(CAMPAIGN_API_ERROR_MESSAGES.area_duplicate)).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(AREA_COUNT + 1);
  });

  test('手順 4：必要数の欄に範囲外の値（1000）を入れて保存すると、保存できない旨の案内が出て、保存されません', async ({ page }) => {
    await openAndLoadTemplate(page);

    await cellInput(page, IN.areaTokushima, IN.seasonSpring).fill(OUT_OF_RANGE_VALUE);
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.saveButton }).click();

    await expect(page.getByText(CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range).first()).toBeVisible();
    await expect(page.getByText(CAMPAIGN_SETTINGS_STRINGS.saved)).toHaveCount(0);
  });

  test('手順 5：範囲内の値（2）に直して「保存」を押すと、保存された旨が表示されます', async ({ page }) => {
    await openAndLoadTemplate(page);

    const input = cellInput(page, IN.areaTokushima, IN.seasonSpring);
    await input.fill(OUT_OF_RANGE_VALUE);
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.saveButton }).click();
    await expect(page.getByText(CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range).first()).toBeVisible();

    await input.fill(IN_RANGE_VALUE);
    await page.getByRole('button', { name: CAMPAIGN_SETTINGS_STRINGS.saveButton }).click();
    await expect(page.getByText(CAMPAIGN_SETTINGS_STRINGS.saved)).toBeVisible();

    // 保存の結果を、開発の Worker（同じセッション）から確かめます。
    const response = await page.request.get('http://localhost:8787/api/campaign');
    expect(response.status()).toBe(200);
    // サーバーは ID を振り直すため、ID ではなく名前（徳島市・春）で欄を探します。
    const body = (await response.json()) as {
      areas: { id: string; label: string }[];
      periods: { id: string; label: string }[];
      cells: { areaId: string; periodId: string; required: number }[];
    };
    expect(body.cells).toHaveLength(AREA_COUNT * SEASON_COUNT);
    const areaId = body.areas.find((area) => area.label === IN.areaTokushima)?.id;
    const periodId = body.periods.find((period) => period.label === IN.seasonSpring)?.id;
    expect(areaId, 'the area for the edited cell must exist').toBeDefined();
    expect(periodId, 'the period for the edited cell must exist').toBeDefined();
    const edited = body.cells.find((cell) => cell.areaId === areaId && cell.periodId === periodId);
    expect(edited?.required).toBe(Number(IN_RANGE_VALUE));
  });
});
