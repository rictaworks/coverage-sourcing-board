/**
 * 画像処理そのものの設定（縮小の格子など）。
 * 判定の閾値（JPEG 品質・ピント・ハッシュの距離・輝度）は src/config/defaults.ts の RULE_DEFAULTS だけに置きます。
 */
export const IMAGE_FEATURE_DEFAULTS = {
  /** 差分ハッシュの縮小の格子（横 9 × 縦 8 で、横方向の差分から 8 × 8 = 64 ビット） */
  dHashGrid: { width: 9, height: 8 },
  /** ピントの判定に使う縮小の長辺（px）。縮小は D3 で行います */
  focusDownscaleLongSide: 512,
} as const;
