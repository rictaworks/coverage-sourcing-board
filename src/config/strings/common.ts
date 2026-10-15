/**
 * 全画面で共通の文言とエラーの文言（日本語のみ）。
 * 機能ごとの文言は、その機能の Issue が src/config/strings/<機能>.ts に置く。
 */
export const COMMON_STRINGS = {
  loading: '読み込み中です。しばらくお待ちください。',
  errorHeading: 'エラーが発生しました。',
  errorInvalidTraceName: 'トレースの name が許可リストにありません。',
  errorInvalidTraceField: 'トレースのフィールド名が許可リストにありません。',
  errorInvalidAppEnv: 'APP_ENV の値が正しくありません。development か production を指定してください。',
} as const;

/** 表記の区切り文字。複合表記（「美波町・海陽町」）の区切りに使う。 */
export const TEXT_SEPARATORS = {
  compound: '・',
} as const;
