import { defineConfig, devices } from '@playwright/test';

const FRONT_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:8787';

/** テストの前に、開発サーバー（3000 番と 8787 番）を起動する。本番の URL は設定しない。 */
export default defineConfig({
  testDir: 'test',
  testMatch: ['e2e/**/*.spec.ts', 'pr*/**/*.spec.ts'],
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: FRONT_URL,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:web',
      url: `${FRONT_URL}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:api',
      url: `${API_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
