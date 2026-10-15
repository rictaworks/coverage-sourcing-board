import type { SubjectHint } from '../../core/types';
import { ClefSubjectHint, type ClefSubjectHintResult } from './clefSubjectHint';

/**
 * 被写体の推定をしない実装。常に「推定なし」（status が none）を返し、表示用の文言（被写体の推定はありません）を含める。
 * AI のバインディングが無い開発環境の仕様どおりの動作（推定値を作って代用しない）。
 */
export class NoSubjectHint implements SubjectHint {
  async suggest(_imageSmall: string, _caption: string, _month: number): Promise<ClefSubjectHintResult> {
    return ClefSubjectHint.noneResult('unavailable');
  }
}
