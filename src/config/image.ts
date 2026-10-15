/**
 * 画像の特徴量と一次判定の既定値（requirements.md 3.0）。
 * 実測の結果に応じて調整し、調整の内容は記録します。A2 の既定値の定義ができたら、そちらを参照する形に寄せます。
 * この Issue（B2）で使うのは dHashGrid だけです。ほかは B3 の判定で使います。
 */
export const IMAGE_FEATURE_DEFAULTS = {
  /** 差分ハッシュの縮小の格子（横 9 × 縦 8 で、横方向の差分から 8 × 8 = 64 ビット） */
  dHashGrid: { width: 9, height: 8 },
  /** ピントの判定に使う縮小の長辺（px）。縮小は D3 で行います */
  focusDownscaleLongSide: 512,
  /** JPEG 品質の推定：この値未満は不合格 */
  jpegQualityRejectBelow: 50,
  /** JPEG 品質の推定：この値未満は要確認（不合格の下限より上の範囲） */
  jpegQualityReviewBelow: 60,
  /** ピント（ラプラシアン分散）：この値未満は不合格 */
  focusRejectBelow: 30,
  /** ピント（ラプラシアン分散）：この値以下は要確認（上限を含む。30〜60 が要確認） */
  focusReviewMax: 60,
  /** 同一画像（ハッシュの距離）：この値以下は不合格 */
  duplicateHammingRejectAtMost: 4,
  /** 同一画像（ハッシュの距離）：この値以下は要確認 */
  duplicateHammingReviewAtMost: 8,
  /** EXIF が無い場合の昼間の判定：平均輝度がこの値未満は要確認 */
  daytimeLumaReviewBelow: 40,
} as const;
