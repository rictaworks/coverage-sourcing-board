import type { SubjectHint } from '../../core/types';
import type { WorkerBindings } from '../env';
import { resolveAppEnv } from '../../config/env';
import { CLASSIFIER_CONFIG } from '../../config/classifier';
import { CallLedger } from '../../core/ledger/callLedger';
import { DebugTracer } from '../../core/trace';
import { DailyCounterRepo } from '../repo/dailyCounterRepo';
import { ClefSubjectHint, WorkersAiClefRunner } from './clefSubjectHint';
import { NoSubjectHint } from './noSubjectHint';

/**
 * 被写体の推定の実装を選ぶ。AI のバインディング（env.AI）があれば ClefSubjectHint、無ければ NoSubjectHint。
 * APP_ENV は必ず判定する（想定外の値は例外。トレースの詳しさに使う）。推定値を作って代用しない。
 * 本番のバインディングは wrangler.toml の env.production だけにある（開発では無い）。
 */
export function subjectHintFactory(env: WorkerBindings): SubjectHint {
  const appEnv = resolveAppEnv(env.APP_ENV);
  if (env.AI === undefined) {
    return new NoSubjectHint();
  }
  const ledger = new CallLedger(new DailyCounterRepo(env.DB), CLASSIFIER_CONFIG.dailyLimit);
  const tracer = new DebugTracer(appEnv, (line) => console.log(line));
  return new ClefSubjectHint({ runner: new WorkersAiClefRunner(env.AI), ledger, tracer });
}
