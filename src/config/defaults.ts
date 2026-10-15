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

/** 整形の既定値。保存用の品質は、高い方から順に試し、上限を超えたら次の品質にします。 */
export const PREPARE_DEFAULTS = {
  /** 保存用 JPEG の品質の候補（0〜1）。下限は最後の値です。 */
  saveQualities: [0.92, 0.85, 0.78, 0.7, 0.6],
  /** 分類用の縮小画像 JPEG の品質（0〜1）。 */
  classifyQuality: 0.8,
  /** トリミング枠の位置の段階（キーボードの矢印キーと range 入力で動かす量、%）。 */
  cropStepPercent: 5,
} as const;
