import type { AcceptRule } from '../../src/core/types';

/** キャンペーンのテスト用の入力データ。表示文は置きません（SPEC/config.md 7 章）。 */
export const CAMPAIGN_INPUTS = {
  /** 長さの上限の検査に使う 1 文字。 */
  longUnit: '\u3042',
  name: '四国の風景の春',
  blankName: '　 ',
  minamiTown: '美波町',
  kaiyoTown: '海陽町',
  mugiTown: '牟岐町',
  anan: '阿南市',
  compound: '美波町・海陽町',
  compoundSpaced: '美波町 ・ 海陽町',
  compoundOtherOrder: '海陽町・美波町',
  paddedMugi: '　牟岐町　',
  paddedSpaces: '　',
  mugi: '牟岐町',
  leadingSeparator: '・美波町',
  areas: ['美波町', '海陽町', '美波町・海陽町', '牟岐町'],
  areasWithTwoTowns: ['美波町', '海陽町'],
  duplicateAreas: ['牟岐町', '牟岐町　'],
  duplicateCompound: ['美波町・海陽町', '美波町 ・ 海陽町'],
} as const;

/** 季節の値（英語の識別子。表示文は config にある）。 */
export const SEASON_KEYS = {
  spring: 'spring',
  winter: 'winter',
} as const;

/** 個別の必要数（4 区分値 × 2 季節 の全マス）。順は区分値の並び順。 */
export const REQUIRED_ENTRIES_ALL = [
  { area: '美波町', season: 'spring', required: 1 },
  { area: '美波町', season: 'winter', required: 4 },
  { area: '海陽町', season: 'spring', required: 2 },
  { area: '海陽町', season: 'winter', required: 3 },
  { area: '美波町・海陽町', season: 'spring', required: 5 },
  { area: '美波町・海陽町', season: 'winter', required: 6 },
  { area: '牟岐町', season: 'spring', required: 7 },
  { area: '牟岐町', season: 'winter', required: 8 },
] as const;

/** 個別の必要数（1 マスだけ。残りのマスが未指定になる）。 */
export const REQUIRED_ENTRIES_PARTIAL = [{ area: '美波町', season: 'spring', required: 1 }] as const;

/** 個別の必要数（同じマスが 2 回）。 */
export const REQUIRED_ENTRIES_DUPLICATE = [
  { area: '美波町', season: 'spring', required: 1 },
  { area: '美波町', season: 'spring', required: 2 },
] as const;

/** 個別の必要数（キャンペーンにない区分値を含む）。 */
export const REQUIRED_ENTRIES_UNKNOWN = [
  { area: '阿南市', season: 'spring', required: 1 },
  { area: '美波町', season: 'spring', required: 1 },
  { area: '美波町', season: 'winter', required: 1 },
  { area: '海陽町', season: 'spring', required: 1 },
  { area: '海陽町', season: 'winter', required: 1 },
  { area: '美波町・海陽町', season: 'spring', required: 1 },
  { area: '美波町・海陽町', season: 'winter', required: 1 },
  { area: '牟岐町', season: 'spring', required: 1 },
] as const;

/** 必要数（2 区分値 × 2 季節）。差の大きい順の確認に使う。美波町の春と海陽町の春は必要数が同じで、冬は差が大きい。 */
export const REQUIRED_ENTRIES_GAP = [
  { area: '美波町', season: 'spring', required: 2 },
  { area: '美波町', season: 'winter', required: 6 },
  { area: '海陽町', season: 'spring', required: 2 },
  { area: '海陽町', season: 'winter', required: 6 },
] as const;

/** 受入条件の既定の値（requirements 3.0 の値）。 */
export const ACCEPT_RULE_INPUT: AcceptRule = {
  ratio: 4 / 3,
  tolerance: 0.01,
  orientation: 'landscape',
  formats: ['jpeg', 'png'],
  minShortPx: 800,
  blurMin: 30,
  dupDistance: 4,
  daytimeRequired: true,
  maxInputBytes: 5 * 1024 * 1024,
  maxPixels: 40_000_000,
};

/** 2 区分値 × 2 季節（美波町・海陽町の複合の前に、この 4 マスの並び順）。 */
export const CELL_ORDER_TWO_TOWNS = [
  '美波町/spring',
  '美波町/winter',
  '海陽町/spring',
  '海陽町/winter',
] as const;

/** 4 区分値 × 2 季節 の並び順（区分値の並び順、その中で季節の並び順）。 */
export const CELL_ORDER_FULL = [
  '美波町/spring',
  '美波町/winter',
  '海陽町/spring',
  '海陽町/winter',
  '美波町・海陽町/spring',
  '美波町・海陽町/winter',
  '牟岐町/spring',
  '牟岐町/winter',
] as const;

/** 区分値に含めてはならない文字を含む値（名前の説明と値）。 */
export const FORBIDDEN_AREA_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['zero-width space', `${'\u5357'}\u200B${'\u753A'}`],
  ['zero-width joiner', `${'\u5357'}\u200D${'\u753A'}`],
  ['word joiner', `${'\u5357'}\u2060${'\u753A'}`],
  ['control NUL', `${'\u5357'}\u0000${'\u753A'}`],
  ['control DEL', `${'\u5357'}\u007F${'\u753A'}`],
  ['C1 control', `${'\u5357'}\u0085${'\u753A'}`],
  ['bidi RLO', `${'\u5357'}\u202E${'\u753A'}`],
  ['bidi isolate', `${'\u5357'}\u2066${'\u753A'}`],
];
