/** normalizeText のテスト用の入力データ。表示文は置きません（SPEC/config.md 7 章）。 */
export const NORMALIZE_INPUTS = {
  fullWidthAlnum: 'ＡＢＣ１２３',
  paddedPlace: '　美波町　',
  multiSpacePlace: '高知県   安芸市',
  compound: '美波町・海陽町',
  compoundTrailingSpace: '美波町・海陽町 ',
  compoundSpaced: '美波町 ・ 海陽町',
  compoundHalfWidthDot: '美波町･海陽町',
  placeA: '美波町',
  placeB: '海陽町',
  onlyFullWidthSpace: '　 ',
} as const;

export const NORMALIZE_EXPECTED_FROM_INPUT = {
  paddedPlace: '美波町',
  multiSpacePlace: '高知県 安芸市',
  compound: '美波町・海陽町',
} as const;
