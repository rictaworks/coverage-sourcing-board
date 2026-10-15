import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/** 2 つのプロジェクト。worker.test.ts と *.worker.test.ts は workers（wrangler.toml の開発環境）で、それ以外は node で実行する。 */
const WORKER_TEST_PATTERNS = ['test/**/worker.test.ts', 'test/**/*.worker.test.ts'];

export default defineConfig({
  test: {
    testTimeout: 30_000,
    projects: [
      {
        test: {
          name: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['node_modules', ...WORKER_TEST_PATTERNS],
          environment: 'node',
        },
      },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
        test: {
          name: 'workers',
          include: WORKER_TEST_PATTERNS,
          exclude: ['node_modules'],
        },
      },
    ],
  },
});
