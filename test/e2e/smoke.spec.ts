import { expect, test } from '@playwright/test';
import { APP_STRINGS } from '../../src/config/strings';

const FRONT_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8787';

test.describe('development servers smoke', () => {
  test('3000 top page shows the Japanese title', async ({ page }) => {
    await page.goto(`${FRONT_URL}/`);
    await expect(page).toHaveTitle(APP_STRINGS.pageTitle);
  });

  test('3000 proxies /api/health to the Workers dev server with 200 JSON', async ({ request }) => {
    const response = await request.get(`${FRONT_URL}/api/health`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('8787 answers /api/health with 200 JSON', async ({ request }) => {
    const response = await request.get(`${API_URL}/api/health`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
