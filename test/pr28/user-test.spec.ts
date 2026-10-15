import { expect, test, type Page } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';
import { LAYOUT_STRINGS, PAGE_NAMES } from '../../src/config/strings/layout';
import { LEGAL_STRINGS } from '../../src/config/strings/legal';
import { TOP_ROLE_CONFIG, TOP_STRINGS } from '../../src/config/strings/top';

/**
 * PR #28（Issue #14、D1 フロントの基盤）のユーザーテスト手順を、ブラウザの操作で確かめる。
 * 文言と URL は src/config/strings/ の定数から読み込み、画面の値と照合する（架空の値を書かない）。
 * 対象は開発サーバー（http://localhost:3000）だけです。本番の URL には接続しません。
 * 外部サイト（rictaworks.jp）への移動は、通信を Playwright で代わりに応答させて確かめます。
 */
const FRONT_ORIGIN = 'http://localhost:3000';
const TOP_URL = `${FRONT_ORIGIN}/`;
const LEGAL_URL = `${FRONT_ORIGIN}/legal`;

/** 藍のテーマ（ライト固定）の背景色。globals.css の --color-bg（#faf7f0）と同じ値。 */
const BG_RGB = 'rgb(250, 247, 240)';
/** アンバーバナーの背景色。--color-amber-bg（#fbeec2）と同じ値。 */
const AMBER_RGB = 'rgb(251, 238, 194)';

const JAPANESE_CHAR = /[぀-ヿ一-龯]/;

/** 外部サイトへの移動は、ネットワークに依存せず、Playwright が空の応答を返して確かめる。 */
async function stubExternalSite(page: Page): Promise<void> {
  await page.route('https://rictaworks.jp/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>stub</title></head><body>stub</body></html>',
    }),
  );
}

test.describe('PR #28 ユーザーテスト手順', () => {
  test('手順 1：トップを開くと、ライトテーマで、アンバーバナーに 2 つの文が出る', async ({ page }) => {
    const response = await page.goto(TOP_URL);
    expect(response?.status()).toBe(200);

    // ライトテーマの固定（color-scheme: light）。OS がダークでも light のままであることを確かめる。
    const colorScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(colorScheme).toBe('light');
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe(BG_RGB);

    // アンバーバナーの文言と色
    const banner = page.getByTestId('amber-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(LAYOUT_STRINGS.amberNoticeDemo);
    await expect(banner).toContainText(LAYOUT_STRINGS.amberNoticeErase);
    const bannerBg = await banner.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bannerBg).toBe(AMBER_RGB);

    // バナーが画面の最上部にあること
    const box = await banner.boundingBox();
    expect(box?.y ?? 99).toBeLessThan(5);
  });

  test('手順 2：ヘッダーの「← デモ一覧へ」は https://rictaworks.jp/#demos に移る', async ({ page }) => {
    await stubExternalSite(page);
    await page.goto(TOP_URL);

    const backLink = page.getByRole('link', { name: LAYOUT_STRINGS.backToDemoList });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveText(LAYOUT_STRINGS.backToDemoList);
    await expect(backLink).toHaveAttribute('href', 'https://rictaworks.jp/#demos');

    // 右端にあること（ヘッダーの nav の中で最後に置かれている）
    const navLinks = page.getByRole('navigation', { name: LAYOUT_STRINGS.headerNavLabel }).getByRole('link');
    await expect(navLinks.last()).toHaveText(LAYOUT_STRINGS.backToDemoList);

    // 押すと外部サイトへ移ることを確かめる（通信は Playwright が代わりに応答する）
    await Promise.all([page.waitForURL('https://rictaworks.jp/**'), backLink.click()]);
    expect(page.url()).toBe('https://rictaworks.jp/#demos');
  });

  test('手順 3：右下に「ご相談はこちら」の吹き出しがあり、https://rictaworks.jp/ につながる', async ({ page }) => {
    await page.goto(TOP_URL);
    const consult = page.getByRole('link', { name: LAYOUT_STRINGS.consultLabel });
    await expect(consult).toBeVisible();
    await expect(consult).toHaveAttribute('href', 'https://rictaworks.jp/');

    // 画面の右下に固定されていること（スクロールしても見える位置）
    const position = await consult.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe('fixed');
    const viewport = page.viewportSize();
    const box = await consult.boundingBox();
    expect(viewport).not.toBeNull();
    expect(box).not.toBeNull();
    if (viewport && box) {
      expect(box.x + box.width).toBeGreaterThan(viewport.width * 0.5);
      expect(box.y + box.height).toBeGreaterThan(viewport.height * 0.5);
    }
  });

  test('手順 4：「発注者」と「投稿者」を切り替えると、表示される進める画面が変わる', async ({ page }) => {
    await page.goto(TOP_URL);
    const group = page.getByRole('group', { name: TOP_STRINGS.roleGroupLabel });
    const ordererButton = group.getByRole('button', { name: TOP_STRINGS.roles.orderer.label });
    const submitterButton = group.getByRole('button', { name: TOP_STRINGS.roles.submitter.label });

    // 既定は投稿者（TOP_ROLE_CONFIG.defaultRole）
    expect(TOP_ROLE_CONFIG.defaultRole).toBe('submitter');
    await expect(submitterButton).toHaveAttribute('aria-pressed', 'true');

    // 発注者に切り替え
    await ordererButton.click();
    await expect(ordererButton).toHaveAttribute('aria-pressed', 'true');
    await expect(submitterButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText(TOP_STRINGS.roles.orderer.description)).toBeVisible();
    for (const link of TOP_STRINGS.roles.orderer.links) {
      await expect(page.getByRole('link', { name: link.label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: PAGE_NAMES.submit, exact: true })).toHaveCount(0);

    // 投稿者に戻す
    await submitterButton.click();
    await expect(submitterButton).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(TOP_STRINGS.roles.submitter.description)).toBeVisible();
    for (const link of TOP_STRINGS.roles.submitter.links) {
      await expect(page.getByRole('link', { name: link.label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: PAGE_NAMES.campaign, exact: true })).toHaveCount(0);
  });

  test('手順 4 補足：選んだ役割はブラウザに残り、再読み込み後も同じ役割が表示される', async ({ page }) => {
    await page.goto(TOP_URL);
    await page.getByRole('button', { name: TOP_STRINGS.roles.orderer.label }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: TOP_STRINGS.roles.orderer.label })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // 後始末：既定の役割に戻す（次のテストへ影響させない）
    await page.getByRole('button', { name: TOP_STRINGS.roles.submitter.label }).click();
  });

  test('手順 5：フッターの「利用規約・免責事項」を押すと /legal が開き、規約の画面が出る', async ({ page }) => {
    await page.goto(TOP_URL);
    const footerLink = page.getByRole('link', { name: LAYOUT_STRINGS.footerLegalLabel });
    await expect(footerLink).toHaveAttribute('href', LAYOUT_STRINGS.footerLegalHref);

    await Promise.all([page.waitForURL(LEGAL_URL), footerLink.click()]);
    expect(page.url()).toBe(LEGAL_URL);

    await expect(page.getByRole('heading', { level: 1, name: LEGAL_STRINGS.heading })).toBeVisible();
    await expect(page.getByText(LEGAL_STRINGS.draftNote)).toBeVisible();
    await expect(page.getByRole('heading', { name: LEGAL_STRINGS.contactHeading, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: LEGAL_STRINGS.contactEmail })).toHaveAttribute(
      'href',
      LEGAL_STRINGS.contactHref,
    );
  });

  test('手順 6：準備中の画面（充足マップ・投稿・自分の投稿・キャンペーン設定・確認キュー）に「準備中」と出る', async ({
    page,
  }) => {
    const pendingPaths: Array<{ path: string; name: string }> = [
      { path: '/coverage', name: PAGE_NAMES.coverage },
      { path: '/submit', name: PAGE_NAMES.submit },
      { path: '/mine', name: PAGE_NAMES.mine },
      { path: '/campaign', name: PAGE_NAMES.campaign },
      { path: '/review', name: PAGE_NAMES.review },
    ];
    for (const { path, name } of pendingPaths) {
      const response = await page.goto(`${FRONT_ORIGIN}${path}`);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name }), path).toBeVisible();
      await expect(page.getByText(LAYOUT_STRINGS.pendingNotice), path).toBeVisible();
      await expect(page.locator('body'), path).toContainText(LAYOUT_STRINGS.pendingNotice);
    }
  });

  test('補足：ページのタイトルは日本語で、トップは共通の題名を使う', async ({ page }) => {
    await page.goto(TOP_URL);
    const title = await page.title();
    expect(title).toBe(APP_STRINGS.pageTitle);
    expect(title).toMatch(JAPANESE_CHAR);

    await page.goto(LEGAL_URL);
    expect(await page.title()).toBe(LEGAL_STRINGS.title);
    expect(await page.title()).toMatch(JAPANESE_CHAR);

    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toBe('ja');
  });

  test('補足：ダークの OS 設定でも、背景はライトのまま（ライトテーマ固定）', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto(TOP_URL);
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe(BG_RGB);
    await context.close();
  });
});
