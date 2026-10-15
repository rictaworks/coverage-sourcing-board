import { TEXT_SEPARATORS } from '../../config/strings/common';

/**
 * 表記ゆれを正規化する（純粋な関数）。エリアの区分値と地点名で共通に使う。
 * - NFKC（全角の英数字と記号を半角に、半角の中点を複合表記の区切りに）
 * - 空白（全角の空白を含む）の連続を 1 つにし、前後の空白を除く
 * - 複合表記の区切りの前後の空白を除き、複合表記（「A・B」）を 1 つの値として保つ
 */
export function normalizeText(input: string): string {
  const separator = TEXT_SEPARATORS.compound;
  const aroundSeparator = new RegExp(` ?${separator} ?`, 'g');
  return input
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(aroundSeparator, separator);
}
