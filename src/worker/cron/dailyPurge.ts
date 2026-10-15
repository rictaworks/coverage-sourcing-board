import templateJson from '../../../data/templates/shikoku-landscape.json';
import { resolveAppEnv } from '../../config/env';
import { PURGE_STRINGS } from '../../config/strings/purge';
import { DebugTracer } from '../../core/trace';
import type { WorkerBindings } from '../env';
import { TemplateSeedBuilder, type SeedStatement, type TemplateDefinition } from '../db/templateSeed';

/**
 * 削除の文（固定の文だけ。外部の入力を含めない）。子から親の順にする。
 * session は、キャンペーン系（area・period・cell・accept_rule・campaign）が参照するため、最後に削除する。
 * requirements 3.9 の順序（投稿系の後に、キャンペーン系）と外部キーの制約を両立させるための順序である。
 */
const DELETE_STATEMENTS: readonly string[] = [
  'DELETE FROM check_result',
  'DELETE FROM review',
  'DELETE FROM submission',
  'DELETE FROM cell',
  'DELETE FROM accept_rule',
  'DELETE FROM period',
  'DELETE FROM area',
  'DELETE FROM campaign',
  'DELETE FROM session',
];

/** 1 回の実行の計画。deletes の後に reseed（テンプレートの再投入）を続けて、1 回の batch で行う。 */
export interface PurgePlan {
  readonly deletes: readonly SeedStatement[];
  readonly reseed: readonly SeedStatement[];
}

/** 実行の結果。値はトレースと同じ（個人情報を含まない）。 */
export interface PurgeResult {
  readonly queryCount: number;
  readonly deletedCount: number;
  readonly durationMs: number;
}

/** 例外の種類の番号（トレースの errorKind）。メッセージは使わない。 */
const ERROR_KIND_OTHER = 0;
const ERROR_KIND_ERROR = 1;
const ERROR_KIND_TYPE_ERROR = 2;
const ERROR_KIND_RANGE_ERROR = 3;

/** 削除の計画を作る。テンプレートの投入は TemplateSeedBuilder を使う。 */
export class PurgePlanBuilder {
  constructor(private readonly template: TemplateDefinition) {}

  build(): PurgePlan {
    return {
      deletes: DELETE_STATEMENTS.map((sql) => ({ sql, binds: [] })),
      reseed: new TemplateSeedBuilder(this.template).buildStatements(),
    };
  }
}

/**
 * 日次の全削除（requirements 3.9）。計画の文を、D1 の 1 回の batch で実行する。
 * batch は全体が 1 つの単位のため、途中で失敗したら全体が戻る。失敗は例外にして、トレースに残す（握りつぶさない）。
 * daily_counter は削除しない（UTC 0 時のリセットに従う）。
 */
export class DailyPurge {
  constructor(
    private readonly db: D1Database,
    private readonly tracer: DebugTracer,
    private readonly plan: PurgePlan,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  async run(): Promise<PurgeResult> {
    const startedAt = this.clock();
    const statements = [...this.plan.deletes, ...this.plan.reseed];
    const queryCount = statements.length;
    this.tracer.summary('cron.reset.started', { queryCount });
    try {
      const results = await this.db.batch(statements.map((statement) => this.db.prepare(statement.sql).bind(...statement.binds)));
      const deletedCount = results.slice(0, this.plan.deletes.length).reduce((sum, result) => sum + result.meta.changes, 0);
      const durationMs = this.clock() - startedAt;
      this.tracer.summary('cron.reset.finished', { queryCount, count: deletedCount, durationMs });
      return { queryCount, deletedCount, durationMs };
    } catch (error) {
      this.tracer.summary('cron.reset.failed', { queryCount, errorKind: this.errorKind(error), durationMs: this.clock() - startedAt });
      throw new Error(PURGE_STRINGS.errorPurgeFailed, { cause: error });
    }
  }

  private errorKind(error: unknown): number {
    if (error instanceof TypeError) {
      return ERROR_KIND_TYPE_ERROR;
    }
    if (error instanceof RangeError) {
      return ERROR_KIND_RANGE_ERROR;
    }
    if (error instanceof Error) {
      return ERROR_KIND_ERROR;
    }
    return ERROR_KIND_OTHER;
  }
}

/** Cron の入口から呼ぶ。APP_ENV は判定し、想定外の値なら実行しない。テンプレートは data/templates の JSON を使う。 */
export async function dailyPurge(env: WorkerBindings): Promise<PurgeResult> {
  const appEnv = resolveAppEnv(env.APP_ENV);
  const tracer = new DebugTracer(appEnv, (line) => console.log(line));
  const plan = new PurgePlanBuilder(templateJson as TemplateDefinition).build();
  return new DailyPurge(env.DB, tracer, plan).run();
}
