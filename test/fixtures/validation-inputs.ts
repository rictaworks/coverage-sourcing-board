/** 一次判定と重複の判定のテスト用の入力データ。表示文は置きません（判定の文言は src/config/strings/checks.ts）。 */
export const VALIDATION_FIXTURES = {
  spotMinamiAwa: '美波町',
  spotKaiyo: '海陽町',
  spotCompound: '美波町・海陽町',
  spotCompoundSpaced: '美波町 ・ 海陽町',
  spotPaddedMinamiAwa: '　美波町 ',
  spotOther: '日和佐',
  spotEmpty: '',
  spotBlank: '　 ',
  capitalTakamatsu: '高松市',
  capitalNames: ['徳島市', '高松市', '松山市', '高知市'],
  sentenceEnd: '。',
  seasonLabels: ['春', '夏', '秋', '冬'],
} as const;
