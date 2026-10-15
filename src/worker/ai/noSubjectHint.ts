import type { SubjectHint, SubjectHintResult } from '../../core/types';

/**
 * 被写体の推定をしない実装。常に「推定なし」（status が none）を返す。
 * AI のバインディングが無い開発環境の仕様どおりの動作（推定値を作って代用しない）。
 */
export class NoSubjectHint implements SubjectHint {
  async suggest(_imageSmall: string, _caption: string, _month: number): Promise<SubjectHintResult> {
    return { status: 'none' };
  }
}
