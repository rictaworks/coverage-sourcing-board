import type { PrefectureCode } from '../../core/api/contract';

/** 県の表示名（県のコードごと）。 */
export const PREFECTURE_NAMES: Record<PrefectureCode, string> = {
  tokushima: '徳島県',
  kagawa: '香川県',
  ehime: '愛媛県',
  kochi: '高知県',
};
