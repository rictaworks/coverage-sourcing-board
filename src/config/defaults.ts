/**
 * 既定値（requirements 3.0）。数値はここに置き、コードの他の場所には直書きしない。
 * 「仮の値」と書いたものは、requirements に数値がないため暫定で置いたものです。実測で調整します（SPEC/config.md）。
 */
export const RULE_DEFAULTS = {
  aspectRatio: { width: 4, height: 3 },
  aspectTolerance: 0.01,
  orientation: 'landscape',
  maxInputBytes: 5 * 1024 * 1024,
  maxInputPixels: 40_000_000,
  minShortSidePx: 800,
  jpegQualityFail: 50,
  jpegQualityReview: 60,
  focusFail: 30,
  focusReview: 60,
  dimLumaReview: 40,
  phashDuplicateMax: 4,
  phashReviewMax: 8,
  classifyConfidenceMin: 0.6,
  savedLongEdgePx: 1600,
  savedMaxBytes: 1_900_000,
  classifyImageEdgePx: 512,
  /** 仮の値（加工の偏り。平均の彩度が範囲の外なら要確認）。 */
  saturationReviewMin: 0.05,
  saturationReviewMax: 0.85,
  /** 仮の値（加工の偏り。コントラストが範囲の外なら要確認）。 */
  contrastReviewMin: 0.1,
  contrastReviewMax: 0.8,
} as const;
