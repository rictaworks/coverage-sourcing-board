/**
 * 判定の理由のコード（requirements 3.3・3.4）。値は英小文字と下線だけで、文言は src/config/strings/checks.ts にあります。
 * 合格の理由は PASSED の 1 つにまとめます。
 */
export const REASON = {
  PASSED: 'passed',
  FORMAT_UNSUPPORTED: 'format_unsupported',
  ORIENTATION_PORTRAIT: 'orientation_portrait',
  RATIO_OUT_OF_RANGE: 'ratio_out_of_range',
  INPUT_TOO_LARGE: 'input_too_large',
  PIXELS_TOO_MANY: 'pixels_too_many',
  SHORT_SIDE_TOO_SMALL: 'short_side_too_small',
  JPEG_QUALITY_LOW: 'jpeg_quality_low',
  JPEG_QUALITY_BORDERLINE: 'jpeg_quality_borderline',
  FOCUS_LOW: 'focus_low',
  FOCUS_BORDERLINE: 'focus_borderline',
  SHOOT_LOCATION_UNVERIFIED: 'shoot_location_unverified',
  SHOOT_MONTH_MISSING: 'shoot_month_missing',
  SHOOT_MONTH_MISMATCH: 'shoot_month_mismatch',
  DAYTIME_OUT_OF_RANGE: 'daytime_out_of_range',
  DAYTIME_DARK: 'daytime_dark',
  PROCESSING_BIAS: 'processing_bias',
  DECLARATION_MISSING: 'declaration_missing',
  DEVICE_INFO_MISSING: 'device_info_missing',
  DUPLICATE_IMAGE_REJECT: 'duplicate_image_reject',
  DUPLICATE_IMAGE_REVIEW: 'duplicate_image_review',
  DUPLICATE_SPOT_REVIEW: 'duplicate_spot_review',
} as const;

/** 理由のコードの型（REASON の値のいずれか）。 */
export type ReasonCodeValue = (typeof REASON)[keyof typeof REASON];
