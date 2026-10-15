/**
 * キャンペーン設定の画面（D6）のテスト用の入力データ。日本語の値はこのファイルにだけ置きます（test/unit/hardcode.test.ts）。
 * 表示文は置きません（表示文は src/config/strings/ にあります）。
 */
export const CAMPAIGN_SETTINGS_INPUTS = {
  seasonSpring: '春',
  seasonSummer: '夏',
  seasonAutumn: '秋',
  seasonWinter: '冬',
  areaTokushima: '徳島市',
  areaKochi: '高知市',
  areaSukumo: '須崎市',
  areaPaddedSukumo: '　須崎市　',
  areaWideAbc: 'ＡＢＣ市',
  areaAbc: 'ABC市',
  areaNew: '新しい市',
  areaGeneric: '区分',
  areaBlank: '　',
  areaHtml: '<b>テスト区分</b>',
  areaHtmlText: 'テスト区分',
  campaignName: '四国の風景',
  blankName: '　 ',
  longNameUnit: 'あ',
  longUnit: 'あ',
  fullWidthDigitTwo: '２',
  unknownApiMessage: '想定にない文言です。',
} as const;
