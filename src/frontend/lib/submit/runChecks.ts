import { LIMITS } from '../../../config/limits';
import { PREFECTURAL_CAPITALS, type GeoPoint } from '../../../config/geo';
import { BROWSER_CHECK_ITEMS } from '../../../config/submission';
import { SUBMIT_DEV_ERRORS, SUBMIT_FORM_ERRORS } from '../../../config/strings/submit';
import { PREFECTURE_CODES, type CoverageResponse, type PrefectureCode } from '../../../core/api/contract';
import { SunCalculator } from '../../../core/validation/sunCalculator';
import { Validator, type SubmissionInput } from '../../../core/validation/validator';
import { REASON } from '../../../core/validation/reasonCodes';
import type { AcceptRule, CheckResult, DaytimeJudge, Verdict } from '../../../core/types';
import type { CampaignDetailView } from '../api/campaignApi';
import type { PreparedImage } from '../image/preparedImage';

/** 一次判定の入力（整形の結果と、画面の入力）。 */
export interface JudgeInput {
  readonly prepared: PreparedImage;
  readonly rule: AcceptRule;
  /** 撮影月（1〜12）。未入力なら null。 */
  readonly shotMonth: number | null;
  /** 区分値の県。昼間の判定は、この県の県庁所在地の座標で行います。 */
  readonly prefecture: PrefectureCode;
  readonly declaredNotAi: boolean;
  readonly declaredNotReused: boolean;
}

/** 一次判定の結果。canSend は不合格が 1 つも無いことを表します（要確認は送信できます）。 */
export interface JudgeOutcome {
  readonly results: readonly CheckResult[];
  readonly canSend: boolean;
}

/** Worker へ送る 1 項目の判定（meta.checks の 1 件）。 */
export interface BrowserCheckResult {
  readonly item: (typeof BROWSER_CHECK_ITEMS)[number];
  readonly verdict: Exclude<Verdict, 'info'>;
  readonly reasonCode: string;
}

/** 判定しない項目を合格として送るときの理由（PNG の JPEG 品質など）。 */
const PASSED_REASON = REASON.PASSED;

/** 不合格 → 要確認 → 合格の順の強さ。同じ項目の複数の結果から、送る 1 件を選ぶときに使います。 */
const VERDICT_STRENGTH: Record<Exclude<Verdict, 'info'>, number> = { fail: 2, review: 1, pass: 0 };

/**
 * 一次判定（requirements 3.3）。B3 の Validator と B2 の特徴量（D3 で求めたもの）を組み合わせます。
 * 判定は保存する画像（整形後の寸法と大きさ）で行います。Worker も保存する画像で検査するため、比率と寸法が揃います。
 */
export class SubmissionChecker {
  constructor(private readonly sun: DaytimeJudge = new SunCalculator()) {}

  judge(input: JudgeInput): JudgeOutcome {
    const validator = new Validator(this.daytimeFor(input.prefecture));
    const results = validator.validate(this.submissionInput(input), input.rule);
    return { results, canSend: !results.some((result) => result.verdict === 'fail') };
  }

  /** 1 項目 1 件の判定に変換します（Worker の meta.checks の形）。不合格を優先し、同じ強さなら先の理由を使います。 */
  toBrowserChecks(results: readonly CheckResult[]): BrowserCheckResult[] {
    return BROWSER_CHECK_ITEMS.map((item) => {
      const candidates = results.filter((result) => result.item === item);
      if (candidates.length === 0) {
        if (item === 'jpeg_quality') {
          // 品質を推定できない（PNG など）ときは判定しない項目です。Worker は 10 項目を求めるため、合格として 1 件送ります。
          return { item, verdict: 'pass' as const, reasonCode: PASSED_REASON };
        }
        throw new Error(`${SUBMIT_DEV_ERRORS.browserCheckMissing}${item}`);
      }
      const chosen = candidates.reduce((best, current) =>
        VERDICT_STRENGTH[current.verdict as Exclude<Verdict, 'info'>] > VERDICT_STRENGTH[best.verdict as Exclude<Verdict, 'info'>] ? current : best,
      );
      return { item, verdict: chosen.verdict as BrowserCheckResult['verdict'], reasonCode: chosen.reasonCode };
    });
  }

  /** 区分値の県の県庁所在地だけを、昼間の判定に使う判定器を返します（他の県の座標では判定しません）。 */
  daytimeFor(prefecture: PrefectureCode): DaytimeJudge {
    const capital = capitalOf(prefecture);
    return {
      isDaytime: (date: Date, lat: number, lng: number): boolean =>
        lat === capital.lat && lng === capital.lng && this.sun.isDaytime(date, lat, lng),
    };
  }

  /** B3 の入力に変換します。寸法と大きさは保存する画像のものを使います。 */
  submissionInput(input: JudgeInput): SubmissionInput {
    const { prepared } = input;
    return {
      format: prepared.features.format,
      width: prepared.saved.width,
      height: prepared.saved.height,
      byteSize: prepared.saved.bytes,
      // PNG など、品質を推定できない元の画像は null（判定しない）。送信は保存する JPEG で行います。
      jpegQuality: prepared.features.quality ?? null,
      blurScore: prepared.features.blurScore,
      meanLuma: prepared.features.meanLuma,
      saturation: prepared.features.saturation,
      contrast: prepared.features.contrast,
      exif: prepared.exif,
      declaredMonth: input.shotMonth,
      declaredNotAi: input.declaredNotAi,
      declaredNotReused: input.declaredNotReused,
    };
  }
}

/** 県の県庁所在地。PREFECTURE_CODES と PREFECTURAL_CAPITALS の並びを対応させます（並びは src/config/geo.ts と一致）。 */
export function capitalOf(prefecture: PrefectureCode): GeoPoint {
  const index = PREFECTURE_CODES.indexOf(prefecture);
  const capital = PREFECTURAL_CAPITALS[index];
  if (capital === undefined || PREFECTURAL_CAPITALS.length !== PREFECTURE_CODES.length) {
    throw new Error(SUBMIT_DEV_ERRORS.capitalMissing);
  }
  return capital;
}

/** 入力欄の誤りの欄の名前。 */
export type FormField = 'area' | 'month' | 'spotName' | 'caption' | 'declaration' | 'consent';

/** 入力欄の値（画面の state と同じ形）。 */
export interface SubmitFormValues {
  readonly areaId: string;
  /** 撮影月の入力（1〜12 の文字列。未選択は空文字）。 */
  readonly shotMonth: string;
  readonly spotName: string;
  readonly caption: string;
  readonly declaredNotAi: boolean;
  readonly declaredNotReused: boolean;
  readonly consent: boolean;
}

/** 入力欄の誤り。message は表示する文言（src/config/strings/submit.ts）。 */
export interface FormError {
  readonly field: FormField;
  readonly message: string;
}

export type FormCheck =
  | { readonly ok: true; readonly shotMonth: number; readonly spotName: string; readonly caption: string }
  | { readonly ok: false; readonly errors: readonly FormError[] };

/** 制御文字（改行・タブを含む）。Worker の SUBMISSION_CONFIG.controlCharPattern と同じ規則です。 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** 入力欄の検査（上限は Worker と同じ src/config/limits.ts の値）。 */
export class SubmitFormRules {
  check(values: SubmitFormValues): FormCheck {
    const errors: FormError[] = [];
    const shotMonth = monthOf(values.shotMonth);
    if (values.areaId === '') {
      errors.push({ field: 'area', message: SUBMIT_FORM_ERRORS.area });
    }
    if (shotMonth === null) {
      errors.push({ field: 'month', message: SUBMIT_FORM_ERRORS.month });
    }
    const spotName = values.spotName.trim();
    const caption = values.caption.trim();
    if (Array.from(spotName).length > LIMITS.spotNameMaxChars) {
      errors.push({ field: 'spotName', message: SUBMIT_FORM_ERRORS.spotName(LIMITS.spotNameMaxChars) });
    } else if (CONTROL_CHARS.test(spotName)) {
      errors.push({ field: 'spotName', message: SUBMIT_FORM_ERRORS.controlChars });
    }
    if (Array.from(caption).length > LIMITS.captionMaxChars) {
      errors.push({ field: 'caption', message: SUBMIT_FORM_ERRORS.caption(LIMITS.captionMaxChars) });
    } else if (CONTROL_CHARS.test(caption)) {
      errors.push({ field: 'caption', message: SUBMIT_FORM_ERRORS.controlChars });
    }
    if (!values.declaredNotAi || !values.declaredNotReused) {
      errors.push({ field: 'declaration', message: SUBMIT_FORM_ERRORS.declaration });
    }
    if (!values.consent) {
      errors.push({ field: 'consent', message: SUBMIT_FORM_ERRORS.consent });
    }
    if (errors.length > 0 || shotMonth === null) {
      return { ok: false, errors };
    }
    return { ok: true, shotMonth, spotName, caption };
  }
}

/** 撮影月の入力（1〜12 の整数だけを受け付けます）。 */
function monthOf(text: string): number | null {
  if (!/^\d{1,2}$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return value >= 1 && value <= 12 ? value : null;
}

/** マスの解決の結果。 */
export type CellResolution =
  | { readonly kind: 'ok'; readonly cellId: string; readonly closed: boolean }
  | { readonly kind: 'no_period' }
  | { readonly kind: 'no_cell' };

/**
 * 区分値と撮影月から、マスを選びます。撮影月を含む期間（季節）のマスを使い、募集終了は充足の応答の closed で判定します。
 * 応答に対応するマスが無いときは、代わりの値を作らず例外にします。
 */
export function resolveCell(
  campaign: Pick<CampaignDetailView, 'periods' | 'cells'>,
  coverage: CoverageResponse,
  areaId: string,
  shotMonth: number,
): CellResolution {
  const period = campaign.periods.find((candidate) => candidate.months.includes(shotMonth));
  if (period === undefined) {
    return { kind: 'no_period' };
  }
  const cell = campaign.cells.find((candidate) => candidate.areaId === areaId && candidate.periodId === period.id);
  if (cell === undefined) {
    return { kind: 'no_cell' };
  }
  const coverageCell = coverage.cells.find((candidate) => candidate.cellId === cell.cellId);
  if (coverageCell === undefined) {
    throw new Error(SUBMIT_DEV_ERRORS.cellCoverageMissing);
  }
  return { kind: 'ok', cellId: cell.cellId, closed: coverageCell.closed };
}

/** 入力の残りの字数（コードポイントで数えます。負の値にしません）。 */
export function remainingChars(text: string, max: number): number {
  return Math.max(0, max - Array.from(text).length);
}
