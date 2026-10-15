/**
 * 一次判定（requirements 3.3）。外部に依存しない純粋なクラスです。
 *
 * 判定は項目ごとに行い、不合格（fail）・要確認（review）・合格（pass）の結果を返します。
 * 撮影地は境界データがないため、常に要確認にします（requirements 12.5）。
 * 被写体区分は判定に使いません（補助。requirements 3.5）。
 * 画素数の上限の前段の判定（D3）は呼び出し側の担当です。
 */
import { RULE_DEFAULTS } from '../../config/defaults';
import { JST_OFFSET_MINUTES, PREFECTURAL_CAPITALS } from '../../config/geo';
import { CHECK_ERRORS } from '../../config/strings/checks';
import { IMAGE_FEATURE_STRINGS } from '../../config/strings/image';
import type { AcceptRule, CheckItem, CheckResult, DaytimeJudge, ExifSummary } from '../types';
import { REASON, type ReasonCodeValue } from './reasonCodes';

/** 季節（月から導出する。requirements 3.3）。 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** 投稿の扱い。不合格があれば保存しない（reject）。それ以外は確認待ち（pending_review）。 */
export type OverallOutcome = 'reject' | 'pending_review';

/** 一次判定の入力。画像の中身は含めず、ブラウザで求めた特徴量と EXIF の要約だけを受け取ります。 */
export interface SubmissionInput {
  /** 形式の文字列（jpeg・png など）。rule.formats に無いものは不合格です。 */
  readonly format: string;
  readonly width: number;
  readonly height: number;
  /** 入力ファイルの大きさ（バイト）。 */
  readonly byteSize: number;
  /** JPEG の品質の推定。推定できない（PNG など）ときは null で、判定しません。 */
  readonly jpegQuality: number | null;
  /** ピント（ラプラシアン分散）。 */
  readonly blurScore: number;
  /** 平均輝度（0〜255）。 */
  readonly meanLuma: number;
  /** 平均彩度（0〜1）。 */
  readonly saturation: number;
  /** コントラスト（0〜1）。 */
  readonly contrast: number;
  readonly exif: ExifSummary;
  /** 投稿者が申告した撮影月（1〜12）。無ければ null。 */
  readonly declaredMonth: number | null;
  /** 「AI で生成した画像ではない」の申告。 */
  readonly declaredNotAi: boolean;
  /** 「他のサイトで使っていない」の申告。 */
  readonly declaredNotReused: boolean;
}

/** 1 つの項目の判定の結果（理由つき）。 */
interface Issue {
  readonly verdict: 'fail' | 'review';
  readonly reason: ReasonCodeValue;
}

/** 浮動小数の誤差を吸収する小さな値（比率の境界の比較に使います）。 */
const EPSILON = 1e-9;

/**
 * requirements 3.0 の既定値から、採用の条件を作ります。
 * 比率・向き・形式・上限は AcceptRule に、要確認の境界は RULE_DEFAULTS に置きます。
 */
export function defaultAcceptRule(): AcceptRule {
  return {
    ratio: RULE_DEFAULTS.aspectRatio.width / RULE_DEFAULTS.aspectRatio.height,
    tolerance: RULE_DEFAULTS.aspectTolerance,
    orientation: RULE_DEFAULTS.orientation,
    formats: ['jpeg', 'png'],
    minShortPx: RULE_DEFAULTS.minShortSidePx,
    blurMin: RULE_DEFAULTS.focusFail,
    dupDistance: RULE_DEFAULTS.phashDuplicateMax,
    daytimeRequired: true,
    maxInputBytes: RULE_DEFAULTS.maxInputBytes,
    maxPixels: RULE_DEFAULTS.maxInputPixels,
  };
}

/** 月（1〜12）から季節を導出します。範囲外は例外にします。 */
export function seasonOfMonth(month: number): Season {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(CHECK_ERRORS.invalidMonth);
  }
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** 撮影地の時計での月（1〜12）を返します。時差が無いときは日本時間とみなします。 */
function wallClockMonth(shotAt: Date, offsetMinutes: number | null): number {
  const offset = offsetMinutes ?? JST_OFFSET_MINUTES;
  return new Date(shotAt.getTime() + offset * 60_000).getUTCMonth() + 1;
}

/** 一次判定。昼間の判定を外から受け取ります（SunCalculator など）。 */
export class Validator {
  constructor(private readonly daytime: DaytimeJudge) {}

  /** 投稿の全項目を判定します。合格の項目は 1 件、要確認と不合格は理由ごとに 1 件ずつ返します。 */
  validate(input: SubmissionInput, rule: AcceptRule): CheckResult[] {
    this.assertDimensions(input.width, input.height);
    const results: CheckResult[] = [];
    this.collect(results, 'format', this.judgeFormat(input, rule));
    this.collect(results, 'orientation_ratio', this.judgeOrientationRatio(input, rule));
    this.collect(results, 'resolution', this.judgeResolution(input, rule));
    this.collect(results, 'jpeg_quality', this.judgeJpegQuality(input));
    this.collect(results, 'focus', this.judgeFocus(input, rule));
    this.collect(results, 'shoot_location', this.judgeShootLocation());
    this.collect(results, 'shoot_month_season', this.judgeShootMonth(input));
    this.collect(results, 'daytime', this.judgeDaytime(input, rule));
    this.collect(results, 'processing', this.judgeProcessing(input));
    this.collect(results, 'declaration', this.judgeDeclaration(input));
    return results;
  }

  /** 不合格が 1 つでもあれば reject、それ以外（要確認のみ・全項目合格）は pending_review です。 */
  static overallOutcome(results: readonly CheckResult[]): OverallOutcome {
    return results.some((result) => result.verdict === 'fail') ? 'reject' : 'pending_review';
  }

  /** null は「判定しない」、空の配列は「合格」を表します。 */
  private collect(results: CheckResult[], item: CheckItem, issues: Issue[] | null): void {
    if (issues === null) {
      return;
    }
    if (issues.length === 0) {
      results.push({ item, verdict: 'pass', reasonCode: REASON.PASSED });
      return;
    }
    for (const issue of issues) {
      results.push({ item, verdict: issue.verdict, reasonCode: issue.reason });
    }
  }

  private judgeFormat(input: SubmissionInput, rule: AcceptRule): Issue[] {
    const allowed = (rule.formats as readonly string[]).includes(input.format);
    return allowed ? [] : [{ verdict: 'fail', reason: REASON.FORMAT_UNSUPPORTED }];
  }

  private judgeOrientationRatio(input: SubmissionInput, rule: AcceptRule): Issue[] {
    // 縦向きは回転せず不合格にします。縦向きの比率は判定しません。
    if (input.height > input.width) {
      return [{ verdict: 'fail', reason: REASON.ORIENTATION_PORTRAIT }];
    }
    const deviation = Math.abs(input.width / input.height - rule.ratio) / rule.ratio;
    return deviation > rule.tolerance + EPSILON ? [{ verdict: 'fail', reason: REASON.RATIO_OUT_OF_RANGE }] : [];
  }

  private judgeResolution(input: SubmissionInput, rule: AcceptRule): Issue[] {
    const issues: Issue[] = [];
    if (input.byteSize > rule.maxInputBytes) {
      issues.push({ verdict: 'fail', reason: REASON.INPUT_TOO_LARGE });
    }
    if (input.width * input.height > rule.maxPixels) {
      issues.push({ verdict: 'fail', reason: REASON.PIXELS_TOO_MANY });
    }
    if (Math.min(input.width, input.height) < rule.minShortPx) {
      issues.push({ verdict: 'fail', reason: REASON.SHORT_SIDE_TOO_SMALL });
    }
    return issues;
  }

  private judgeJpegQuality(input: SubmissionInput): Issue[] | null {
    if (input.jpegQuality === null) {
      return null;
    }
    if (input.jpegQuality < RULE_DEFAULTS.jpegQualityFail) {
      return [{ verdict: 'fail', reason: REASON.JPEG_QUALITY_LOW }];
    }
    if (input.jpegQuality < RULE_DEFAULTS.jpegQualityReview) {
      return [{ verdict: 'review', reason: REASON.JPEG_QUALITY_BORDERLINE }];
    }
    return [];
  }

  private judgeFocus(input: SubmissionInput, rule: AcceptRule): Issue[] {
    if (input.blurScore < rule.blurMin) {
      return [{ verdict: 'fail', reason: REASON.FOCUS_LOW }];
    }
    if (input.blurScore <= RULE_DEFAULTS.focusReview) {
      return [{ verdict: 'review', reason: REASON.FOCUS_BORDERLINE }];
    }
    return [];
  }

  /** 境界データがないため、照合は行わず常に要確認にします（requirements 12.5）。 */
  private judgeShootLocation(): Issue[] {
    return [{ verdict: 'review', reason: REASON.SHOOT_LOCATION_UNVERIFIED }];
  }

  private judgeShootMonth(input: SubmissionInput): Issue[] {
    const declared = input.declaredMonth;
    if (declared === null || !Number.isInteger(declared) || declared < 1 || declared > 12) {
      return [{ verdict: 'fail', reason: REASON.SHOOT_MONTH_MISSING }];
    }
    const { shotAt, offsetMinutes } = input.exif;
    if (shotAt !== null && wallClockMonth(shotAt, offsetMinutes) !== declared) {
      return [{ verdict: 'review', reason: REASON.SHOOT_MONTH_MISMATCH }];
    }
    return [];
  }

  private judgeDaytime(input: SubmissionInput, rule: AcceptRule): Issue[] | null {
    if (!rule.daytimeRequired) {
      return null;
    }
    const { shotAt } = input.exif;
    if (shotAt !== null) {
      // 県庁所在地のいずれかで昼間なら昼間とします（市町村が未確定のため。SPEC/validation.md）。
      const daytime = PREFECTURAL_CAPITALS.some((point) => this.daytime.isDaytime(shotAt, point.lat, point.lng));
      return daytime ? [] : [{ verdict: 'fail', reason: REASON.DAYTIME_OUT_OF_RANGE }];
    }
    return input.meanLuma < RULE_DEFAULTS.dimLumaReview ? [{ verdict: 'review', reason: REASON.DAYTIME_DARK }] : [];
  }

  private judgeProcessing(input: SubmissionInput): Issue[] {
    const saturationOff =
      input.saturation < RULE_DEFAULTS.saturationReviewMin || input.saturation > RULE_DEFAULTS.saturationReviewMax;
    const contrastOff = input.contrast < RULE_DEFAULTS.contrastReviewMin || input.contrast > RULE_DEFAULTS.contrastReviewMax;
    return saturationOff || contrastOff ? [{ verdict: 'review', reason: REASON.PROCESSING_BIAS }] : [];
  }

  private judgeDeclaration(input: SubmissionInput): Issue[] {
    if (!input.declaredNotAi || !input.declaredNotReused) {
      return [{ verdict: 'fail', reason: REASON.DECLARATION_MISSING }];
    }
    return input.exif.hasDeviceInfo ? [] : [{ verdict: 'review', reason: REASON.DEVICE_INFO_MISSING }];
  }

  private assertDimensions(width: number, height: number): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error(IMAGE_FEATURE_STRINGS.invalidDimensions);
    }
  }
}
