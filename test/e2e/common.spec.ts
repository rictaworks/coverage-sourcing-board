import { expect, test, type Page } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';
import { LAYOUT_STRINGS, PAGE_TITLES } from '../../src/config/strings/layout';
import { LEGAL_STRINGS } from '../../src/config/strings/legal';

const FRONT_URL = 'http://localhost:3000';
const NARROW_WIDTH_PX = 375;

/** 全ページ共通の要素を確かめる対象。キーは URL のパス、値は期待する <title>。 */
const PAGES: ReadonlyArray<{ readonly path: string; readonly title: string }> = [
  { path: '/', title: APP_STRINGS.pageTitle },
  { path: '/legal', title: LEGAL_STRINGS.title },
  { path: '/coverage', title: PAGE_TITLES.coverage },
  { path: '/submit', title: PAGE_TITLES.submit },
  { path: '/mine', title: PAGE_TITLES.mine },
  { path: '/campaign', title: PAGE_TITLES.campaign },
  { path: '/review', title: PAGE_TITLES.review },
];

async function expectCommonElements(page: Page, path: string, title: string): Promise<void> {
  await page.goto(`${FRONT_URL}${path}`);
  await expect(page).toHaveTitle(title);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');

  const banner = page.getByTestId('amber-banner');
  await expect(banner).toContainText(LAYOUT_STRINGS.amberNoticeDemo);
  await expect(banner).toContainText(LAYOUT_STRINGS.amberNoticeErase);

  const backLink = page.getByRole('link', { name: LAYOUT_STRINGS.backToDemoList });
  await expect(backLink).toHaveAttribute('href', LAYOUT_STRINGS.backToDemoListHref);

  const consult = page.getByRole('link', { name: LAYOUT_STRINGS.consultLabel });
  await expect(consult).toHaveAttribute('href', LAYOUT_STRINGS.consultHref);
  await expect(consult).toHaveCSS('position', 'fixed');
  await expect(consult).toHaveCSS('bottom', '24px');
  await expect(consult).toHaveCSS('right', '24px');

  await expect(page.locator('footer').getByRole('link', { name: LAYOUT_STRINGS.footerLegalLabel })).toHaveAttribute(
    'href',
    LAYOUT_STRINGS.footerLegalHref,
  );
}

test.describe('全ページ共通の要素（requirements 4.1）', () => {
  for (const { path, title } of PAGES) {
    test(`${path}: common elements and Japanese title`, async ({ page }) => {
      await expectCommonElements(page, path, title);
    });
  }

  test('ライトテーマを宣言し、背景色を明示します', async ({ page }) => {
    await page.goto(`${FRONT_URL}/`);
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 247, 240)');
  });

  test('開発環境では GA4 を読み込みません', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await page.goto(`${FRONT_URL}/`);
    expect(requests.filter((url) => url.includes('googletagmanager.com'))).toEqual([]);
  });

  test('存在しないページは 404 で、共通の要素を表示します', async ({ page }) => {
    const response = await page.goto(`${FRONT_URL}/no-such-page`);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: APP_STRINGS.notFoundMessage })).toBeVisible();
    await expect(page.getByTestId('amber-banner')).toBeVisible();
  });
});

test.describe('スマートフォンの幅（375 px）', () => {
  for (const { path, title } of PAGES) {
    test(`${path}: no horizontal scroll at 375 px`, async ({ page }) => {
      await page.setViewportSize({ width: NARROW_WIDTH_PX, height: 800 });
      await page.goto(`${FRONT_URL}${path}`);
      await expect(page).toHaveTitle(title);
      const overflow = await page.evaluate<number>(
        'document.documentElement.scrollWidth - document.documentElement.clientWidth',
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
