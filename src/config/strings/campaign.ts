/**
 * キャンペーンのドメイン（src/core/campaign）の文字列（日本語のみ）。
 * 季節の表示名と、例外のコードに対応する文言を置く。Worker とフロントは、コードからここの文言を引く。
 */
export const SEASON_LABELS = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬',
} as const;

export const CAMPAIGN_ERROR_MESSAGES = {
  NAME_EMPTY: 'キャンペーンの名称を入力してください。',
  NAME_INVALID: 'キャンペーンの名称に使えない文字（制御文字・ゼロ幅の文字・双方向の制御文字）が含まれています。',
  AREA_NONE: '区分値を 1 つ以上指定してください。',
  AREA_INVALID: '区分値が空か、複合地域の区切りの位置が正しくありません。',
  AREA_TOO_LONG: '区分値が長すぎます。短くしてください。',
  AREA_DUPLICATE: '同じ区分値が重複しています。表記だけが違う値も重複とみなします。',
  SEASON_NONE: '季節を 1 つ以上指定してください。',
  SEASON_INVALID: '季節の値が正しくありません。',
  SEASON_DUPLICATE: '同じ季節が重複しています。',
  MONTH_INVALID: '月は 1 から 12 までの整数で指定してください。',
  REQUIRED_INVALID: '必要数は 1 以上の整数で指定してください。',
  REQUIRED_MISSING: '個別の必要数に、指定のないマスがあります。',
  REQUIRED_DUPLICATE: '個別の必要数に、同じマスが重複しています。',
  REQUIRED_UNKNOWN_CELL: '個別の必要数に、キャンペーンにないマスが含まれています。',
  RULE_INVALID: '受入条件の値が正しい範囲にありません。',
  ID_INVALID: 'キャンペーンの ID の作成に失敗しました。',
  CELL_NOT_FOUND: '指定されたマスが見つかりません。',
  COUNT_INVALID: '件数は 0 以上の整数で指定してください。',
  COUNT_UNKNOWN_CELL: '件数に、キャンペーンにないマスが含まれています。',
  COUNT_CAMPAIGN_MISMATCH: '件数に、別のキャンペーンのものが含まれています。',
  COUNT_DUPLICATE: '件数に、同じマスが重複しています。',
} as const;

/**
 * 区分値に含めてはならない文字（正規化の後で判定する）。
 * 制御文字（U+0000-U+001F、U+007F-U+009F）、ゼロ幅の文字、双方向の制御文字。
 */
export const AREA_FORBIDDEN_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]/;

/** 名称に含めてはならない文字。区分値と同じ規則を使う。 */
export const NAME_FORBIDDEN_CHARS = AREA_FORBIDDEN_CHARS;

export type CampaignErrorCode = keyof typeof CAMPAIGN_ERROR_MESSAGES;
