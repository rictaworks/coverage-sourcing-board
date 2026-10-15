// ローカルの D1 に migrations/ の SQL を適用する開発用スクリプト（src/ の外に置く）。
// migrations/ に SQL がまだない場合は、適用せずに正常終了する（wrangler は空の場合にエラーを返すため）。
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

class LocalMigrationRunner {
  constructor({ databaseName, migrationsDir }) {
    this.databaseName = databaseName;
    this.migrationsDir = migrationsDir;
  }

  listSqlFiles() {
    if (!existsSync(this.migrationsDir)) {
      return [];
    }
    return readdirSync(this.migrationsDir).filter((name) => name.endsWith('.sql'));
  }

  run() {
    const sqlFiles = this.listSqlFiles();
    if (sqlFiles.length === 0) {
      console.log('適用する migrations がありません。D1 の適用は行いません。');
      return 0;
    }
    const result = spawnSync(
      'npx',
      ['wrangler', 'd1', 'migrations', 'apply', this.databaseName, '--local'],
      { stdio: 'inherit' },
    );
    return result.status ?? 1;
  }
}

const runner = new LocalMigrationRunner({
  databaseName: 'coverage-sourcing-board',
  migrationsDir: join(process.cwd(), 'migrations'),
});
process.exitCode = runner.run();
