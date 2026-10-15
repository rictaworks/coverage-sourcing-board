/**
 * 画像の特徴量（src/core/image）の例外の文字列（日本語のみ）。
 */
export const IMAGE_FEATURE_STRINGS = {
  invalidDimensions: '画像の幅と高さは 1 以上の整数にしてください。',
  dataLengthMismatch: '画素の配列の長さが、幅と高さから求めた長さと一致しません。',
  laplacianTooSmall: 'ラプラシアンの計算には、幅と高さが 3 以上の画像が必要です。',
  invalidQuality: 'JPEG の品質は 1 から 100 までの整数で指定してください。',
  invalidHash: 'ハッシュは 16 文字の 16 進の文字列で指定してください。',
} as const;
