import type { SubjectHint } from '../../core/types';
import type { WorkerBindings } from '../env';
import { NoSubjectHint } from './noSubjectHint';

/**
 * 被写体の推定の実装を選ぶ。C4 が、AI のバインディングがあるときの実装を追加する。
 * 現在は、どの環境でも NoSubjectHint を返す。
 */
export function subjectHintFactory(_env: WorkerBindings): SubjectHint {
  return new NoSubjectHint();
}
