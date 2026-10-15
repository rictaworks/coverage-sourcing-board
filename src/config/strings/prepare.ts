/**
 * 画像の整形（requirements 3.2、D3）の文字列（日本語のみ）。
 * 文言だけを置きます。数値の既定値は src/config/defaults.ts（RULE_DEFAULTS・PREPARE_DEFAULTS）が正です。
 */

/** 整形の失敗の理由ごとの文言（ユーザーに見せる文）。 */
export const PREPARE_ERROR_STRINGS = {
  unsupported_format: 'JPEG または PNG の画像を選んでください。SVG など、ほかの形式は使えません。',
  too_large: (megabytes: number): string => `画像のサイズは ${megabytes} MB 以下にしてください。`,
  too_many_pixels: (tenThousands: number): string => `画素数は ${tenThousands} 万画素以下にしてください。`,
  unreadable: '画像の寸法を読み取れませんでした。別の画像を選んでください。',
  decode_failed: '画像を読み込めませんでした。別の画像を選んでください。',
  portrait: '縦向きは不可です。横向きの写真を選んでください。',
  save_too_large: (megabytes: number): string =>
    `保存用の画像を ${megabytes} MB 以下にできませんでした。別の写真を選んでください。`,
  encode_failed: '画像の変換に失敗しました。もう一度お試しください。',
  unexpected: '予期しないエラーが発生しました。もう一度お試しください。',
} as const;

/** 整形の画面の文字列。 */
export const PREPARE_STRINGS = {
  intro: '写真を選び、4:3 の枠の位置を決めて確定すると、保存用の画像ができます。',
  steps: [
    '1. 写真を選びます（JPEG または PNG、5 MB 以下、横向きの写真）。',
    '2. 比率が 4:3 と違うときは、枠の位置を調整します。',
    '3. 枠を確定すると、整形後の画像を確かめられます。',
  ],
  privacyNote: '位置情報と機種情報は保存されません。画像は、写真の情報を除いて保存されます。',
  pickLabel: '写真を選ぶ',
  pickHelp: 'JPEG または PNG を選んでください。',
  analyzing: '画像を確かめています。',
  preparing: '画像を整形しています。',
  cropHeading: 'トリミング枠',
  cropNotNeeded: '写真の比率は 4:3 です。枠の調整は不要です。',
  cropHelp: '枠をドラッグするか、スライダーで左右（上下）の位置を動かせます。矢印キーでも動かせます。',
  cropRangeLabel: 'トリミング枠の位置',
  cropValueText: (percent: number): string => `${percent}%`,
  confirmButton: '枠を確定する',
  resetButton: '別の写真を選ぶ',
  previewHeading: '整形後の画像',
  previewSize: (width: number, height: number): string => `${width} × ${height} px`,
  previewBytes: (kilobytes: number): string => `${kilobytes} KB`,
  previewLongSide: '長辺は 1,600 px 以下です。',
  previewNoPhoto: '画像はまだありません。',
  cropFrameLabel: 'トリミング枠',
} as const;
