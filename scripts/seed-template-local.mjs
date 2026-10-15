// ローカルの D1 にテンプレート（四国 風景写真）を投入する開発用スクリプト（src/ の外に置く）。
// 投入の SQL は src/worker/db/templateSeed.ts が作る。TypeScript は Vite の ssrLoadModule で読み込む（新しい依存は追加しない）。
// 何度実行しても行は重複しない（ON CONFLICT で更新する）。migrations の適用（npm run db:migrate:local）の後に実行する。
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATABASE_NAME = 'coverage-sourcing-board';
const TEMPLATE_PATH = join(REPO_ROOT, 'data', 'templates', 'shikoku-landscape.json');

/** D1 の bind を、ローカルの wrangler d1 execute（--command）で使える SQL の値に変換する。内部のデータだけを対象とする。 */
class SqlLiteralConverter {
  toLiteral(value) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('数値が有限ではありません。');
      }
      return String(value);
    }
    return `'${String(value).replaceAll("'", "''")}'`;
  }

  inlineBinds(sql, binds) {
    let index = 0;
    return sql.replace(/\?/g, () => {
      if (index >= binds.length) {
        throw new Error('バインドの数が、プレースホルダーの数と一致しません。');
      }
      const literal = this.toLiteral(binds[index]);
      index += 1;
      return literal;
    });
  }
}

class LocalTemplateSeeder {
  constructor({ templatePath }) {
    this.templatePath = templatePath;
  }

  async loadBuilderClass(server) {
    const module = await server.ssrLoadModule('/src/worker/db/templateSeed.ts');
    return module.TemplateSeedBuilder;
  }

  async run() {
    const template = JSON.parse(readFileSync(this.templatePath, 'utf8'));
    const server = await createServer({
      root: REPO_ROOT,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false },
    });
    let statements;
    try {
      const TemplateSeedBuilder = await this.loadBuilderClass(server);
      statements = new TemplateSeedBuilder(template).buildStatements();
    } finally {
      await server.close();
    }
    const converter = new SqlLiteralConverter();
    const sql = statements.map((statement) => `${converter.inlineBinds(statement.sql, statement.binds)};`).join('\n');
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', DATABASE_NAME, '--local', '--command', sql],
      { cwd: REPO_ROOT, stdio: 'inherit' },
    );
    if (result.status === 0) {
      console.log(`テンプレートを投入しました（文の数：${statements.length}）。`);
    }
    return result.status ?? 1;
  }
}

const seeder = new LocalTemplateSeeder({ templatePath: TEMPLATE_PATH });
process.exitCode = await seeder.run();
