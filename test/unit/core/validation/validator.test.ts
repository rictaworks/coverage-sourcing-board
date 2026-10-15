import { describe, expect, it } from 'vitest';
import { RULE_DEFAULTS } from '../../../../src/config/defaults';
import { SunCalculator } from '../../../../src/core/validation/sunCalculator';
import {
  Validator,
  defaultAcceptRule,
  seasonOfMonth,
  type SubmissionInput,
} from '../../../../src/core/validation/validator';
import type { CheckResult } from '../../../../src/core/types';
import { REASON } from '../../../../src/core/validation/reasonCodes';

/** 12:00 JST（03:00Z）の撮影。日本時間の時差は 540 分。 */
const NOON_JST_JUNE = new Date('2026-06-21T03:00:00Z');

/** すべての項目が合格（撮影地を除く）になる入力。テストごとに一部だけを変えて使います。 */
function baseInput(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    format: 'jpeg',
    width: 1600,
    height: 1200,
    byteSize: 1_000_000,
    jpegQuality: 90,
    blurScore: 100,
    meanLuma: 120,
    saturation: 0.3,
    contrast: 0.4,
    exif: { shotAt: NOON_JST_JUNE, offsetMinutes: 540, hasGps: false, hasDeviceInfo: true },
    declaredMonth: 6,
    declaredNotAi: true,
    declaredNotReused: true,
    ...overrides,
  };
}

const validator = new Validator(new SunCalculator());
const rule = defaultAcceptRule();

/** 指定の項目の結果だけを返します。 */
function resultsFor(results: readonly CheckResult[], item: CheckResult['item']): CheckResult[] {
  return results.filter((result) => result.item === item);
}

/** 指定の項目の判定（単一）を返します。項目が無ければ例外にします。 */
function verdictOf(results: readonly CheckResult[], item: CheckResult['item']): CheckResult['verdict'] {
  const found = resultsFor(results, item);
  if (found.length === 0) {
    throw new Error(`No result for item ${item}.`);
  }
  return found[0].verdict;
}

describe('既定値の一本化（defaultAcceptRule は RULE_DEFAULTS を参照する）', () => {
  it('比率・許容誤差・向き・形式・上限が requirements 3.0 の値です', () => {
    expect(rule.ratio).toBeCloseTo(4 / 3, 12);
    expect(rule.tolerance).toBe(RULE_DEFAULTS.aspectTolerance);
    expect(rule.orientation).toBe('landscape');
    expect(rule.formats).toEqual(['jpeg', 'png']);
    expect(rule.minShortPx).toBe(RULE_DEFAULTS.minShortSidePx);
    expect(rule.blurMin).toBe(RULE_DEFAULTS.focusFail);
    expect(rule.dupDistance).toBe(RULE_DEFAULTS.phashDuplicateMax);
    expect(rule.daytimeRequired).toBe(true);
    expect(rule.maxInputBytes).toBe(RULE_DEFAULTS.maxInputBytes);
    expect(rule.maxPixels).toBe(RULE_DEFAULTS.maxInputPixels);
  });
});

describe('Validator（一次判定）', () => {
  it('すべて合格の入力は、撮影地だけが要確認になり、全体は確認待ちになります', () => {
    const results = validator.validate(baseInput(), rule);
    expect(verdictOf(results, 'shoot_location')).toBe('review');
    for (const item of ['format', 'orientation_ratio', 'resolution', 'jpeg_quality', 'focus', 'shoot_month_season', 'daytime', 'processing', 'declaration'] as const) {
      expect(verdictOf(results, item)).toBe('pass');
    }
    expect(Validator.overallOutcome(results)).toBe('pending_review');
  });

  describe('形式', () => {
    it('JPEG と PNG は合格、それ以外は不合格です', () => {
      expect(verdictOf(validator.validate(baseInput({ format: 'png', jpegQuality: null }), rule), 'format')).toBe('pass');
      const gif = validator.validate(baseInput({ format: 'gif' }), rule);
      expect(verdictOf(gif, 'format')).toBe('fail');
      expect(resultsFor(gif, 'format')[0].reasonCode).toBe(REASON.FORMAT_UNSUPPORTED);
    });
  });

  describe('向き・比率（4:3 の許容誤差 1%。境界を含む）', () => {
    it('縦向きは不合格で、比率の判定は行いません（回転しません）', () => {
      const results = validator.validate(baseInput({ width: 1200, height: 1600 }), rule);
      const orientation = resultsFor(results, 'orientation_ratio');
      expect(orientation).toHaveLength(1);
      expect(orientation[0]).toMatchObject({ verdict: 'fail', reasonCode: REASON.ORIENTATION_PORTRAIT });
    });

    it.each([
      [1320, 1000, 'pass'],
      [1321, 1000, 'pass'],
      [1333, 1000, 'pass'],
      [1319, 1000, 'fail'],
      [1350, 1000, 'fail'],
      [1000, 1000, 'fail'],
    ])('幅 %i 高さ %i（比率 %s）は %s になります', (width, height, expected) => {
      const results = validator.validate(baseInput({ width, height }), rule);
      expect(verdictOf(results, 'orientation_ratio')).toBe(expected);
    });

    it('比率が外れた不合格の理由は、比率の理由コードです', () => {
      const results = validator.validate(baseInput({ width: 1350, height: 1000 }), rule);
      expect(resultsFor(results, 'orientation_ratio')[0].reasonCode).toBe(REASON.RATIO_OUT_OF_RANGE);
    });
  });

  describe('解像度（入力の 5 MB 超、4,000 万画素超、短辺 800 px 未満は不合格）', () => {
    it('入力が 5 MB ちょうどは合格、1 バイト超は不合格です', () => {
      const limit = RULE_DEFAULTS.maxInputBytes;
      expect(verdictOf(validator.validate(baseInput({ byteSize: limit }), rule), 'resolution')).toBe('pass');
      const over = resultsFor(validator.validate(baseInput({ byteSize: limit + 1 }), rule), 'resolution');
      expect(over[0]).toMatchObject({ verdict: 'fail', reasonCode: REASON.INPUT_TOO_LARGE });
    });

    it('画素数の上限を超えると不合格です（8000 × 6000 は 4,800 万画素）', () => {
      const results = validator.validate(baseInput({ width: 8000, height: 6000 }), rule);
      expect(resultsFor(results, 'resolution').some((r) => r.reasonCode === REASON.PIXELS_TOO_MANY && r.verdict === 'fail')).toBe(true);
    });

    it('短辺は 800 px ちょうどが合格、799 px は不合格です', () => {
      expect(verdictOf(validator.validate(baseInput({ width: 1066, height: 800 }), rule), 'resolution')).toBe('pass');
      const short = resultsFor(validator.validate(baseInput({ width: 1065, height: 799 }), rule), 'resolution');
      expect(short[0]).toMatchObject({ verdict: 'fail', reasonCode: REASON.SHORT_SIDE_TOO_SMALL });
    });
  });

  describe('JPEG 品質（50 未満は不合格、50〜59 は要確認、60 は合格）', () => {
    it.each([
      [49, 'fail'],
      [50, 'review'],
      [59, 'review'],
      [60, 'pass'],
    ])('品質 %i は %s になります', (quality, expected) => {
      expect(verdictOf(validator.validate(baseInput({ jpegQuality: quality }), rule), 'jpeg_quality')).toBe(expected);
    });

    it('推定できない場合（PNG など）は判定しません（結果を返さない）', () => {
      const results = validator.validate(baseInput({ format: 'png', jpegQuality: null }), rule);
      expect(resultsFor(results, 'jpeg_quality')).toHaveLength(0);
    });
  });

  describe('ピント（30 未満は不合格、30〜60 は要確認。60 を含む）', () => {
    it.each([
      [29.9, 'fail'],
      [30, 'review'],
      [60, 'review'],
      [60.1, 'pass'],
    ])('ピント %s は %s になります', (blur, expected) => {
      expect(verdictOf(validator.validate(baseInput({ blurScore: blur }), rule), 'focus')).toBe(expected);
    });
  });

  describe('撮影地（境界データがないため、常に要確認）', () => {
    it('EXIF の位置情報があっても、常に要確認です（不合格にしません）', () => {
      const withGps = baseInput({ exif: { shotAt: NOON_JST_JUNE, offsetMinutes: 540, hasGps: true, hasDeviceInfo: true } });
      const results = validator.validate(withGps, rule);
      expect(verdictOf(results, 'shoot_location')).toBe('review');
      expect(resultsFor(results, 'shoot_location')[0].reasonCode).toBe(REASON.SHOOT_LOCATION_UNVERIFIED);
    });
  });

  describe('撮影月・季節（申告は必須。EXIF の月と違えば要確認）', () => {
    it.each([null, 0, 13, 6.5])('申告の撮影月 %s は不合格です', (month) => {
      const results = validator.validate(baseInput({ declaredMonth: month }), rule);
      expect(verdictOf(results, 'shoot_month_season')).toBe('fail');
      expect(resultsFor(results, 'shoot_month_season')[0].reasonCode).toBe(REASON.SHOOT_MONTH_MISSING);
    });

    it('EXIF の月（時差を反映）と申告が違えば要確認です', () => {
      const results = validator.validate(baseInput({ declaredMonth: 5 }), rule);
      expect(verdictOf(results, 'shoot_month_season')).toBe('review');
      expect(resultsFor(results, 'shoot_month_season')[0].reasonCode).toBe(REASON.SHOOT_MONTH_MISMATCH);
    });

    it('時差を反映した月で比べます（UTC では 5 月末でも、JST の 6 月 1 日 00:30 なら 6 月）', () => {
      const lateMay = new Date('2026-05-31T15:30:00Z'); // JST 2026-06-01 00:30
      const results = validator.validate(baseInput({ declaredMonth: 6, exif: { shotAt: lateMay, offsetMinutes: 540, hasGps: false, hasDeviceInfo: true } }), rule);
      expect(verdictOf(results, 'shoot_month_season')).toBe('pass');
    });

    it('EXIF の撮影日時が無いときは、月の不一致の判定を行いません', () => {
      const results = validator.validate(baseInput({ declaredMonth: 5, exif: { shotAt: null, offsetMinutes: null, hasGps: false, hasDeviceInfo: true }, meanLuma: 120 }), rule);
      expect(verdictOf(results, 'shoot_month_season')).toBe('pass');
    });

    it('季節は月から導出します', () => {
      expect(seasonOfMonth(3)).toBe('spring');
      expect(seasonOfMonth(5)).toBe('spring');
      expect(seasonOfMonth(6)).toBe('summer');
      expect(seasonOfMonth(8)).toBe('summer');
      expect(seasonOfMonth(9)).toBe('autumn');
      expect(seasonOfMonth(11)).toBe('autumn');
      expect(seasonOfMonth(12)).toBe('winter');
      expect(seasonOfMonth(1)).toBe('winter');
      expect(seasonOfMonth(2)).toBe('winter');
      expect(() => seasonOfMonth(0)).toThrow();
      expect(() => seasonOfMonth(13)).toThrow();
    });
  });

  describe('昼間（EXIF の日時があれば日の出〜日の入り。無ければ平均輝度 40 未満は要確認）', () => {
    it('EXIF の日時が夜なら不合格です（JST 2026-06-21 02:00）', () => {
      const night = new Date('2026-06-20T17:00:00Z');
      const results = validator.validate(baseInput({ exif: { shotAt: night, offsetMinutes: 540, hasGps: false, hasDeviceInfo: true }, declaredMonth: 6 }), rule);
      expect(verdictOf(results, 'daytime')).toBe('fail');
      expect(resultsFor(results, 'daytime')[0].reasonCode).toBe(REASON.DAYTIME_OUT_OF_RANGE);
    });

    it('EXIF の日時が無いとき、平均輝度 39.9 は要確認、40 は合格です', () => {
      const noExif = { shotAt: null, offsetMinutes: null, hasGps: false, hasDeviceInfo: true };
      expect(verdictOf(validator.validate(baseInput({ exif: noExif, meanLuma: 39.9 }), rule), 'daytime')).toBe('review');
      expect(verdictOf(validator.validate(baseInput({ exif: noExif, meanLuma: 40 }), rule), 'daytime')).toBe('pass');
      expect(resultsFor(validator.validate(baseInput({ exif: noExif, meanLuma: 39.9 }), rule), 'daytime')[0].reasonCode).toBe(REASON.DAYTIME_DARK);
    });

    it('昼間の判定が不要なキャンペーンでは、結果を返しません', () => {
      const noDaytime = { ...rule, daytimeRequired: false };
      const night = new Date('2026-06-20T17:00:00Z');
      const results = validator.validate(baseInput({ exif: { shotAt: night, offsetMinutes: 540, hasGps: false, hasDeviceInfo: true } }), noDaytime);
      expect(resultsFor(results, 'daytime')).toHaveLength(0);
    });
  });

  describe('加工（彩度・コントラストの偏りは要確認。範囲の内側は合格）', () => {
    it.each([
      ['saturation', 0.04, 'review'],
      ['saturation', 0.05, 'pass'],
      ['saturation', 0.85, 'pass'],
      ['saturation', 0.86, 'review'],
      ['contrast', 0.09, 'review'],
      ['contrast', 0.1, 'pass'],
      ['contrast', 0.8, 'pass'],
      ['contrast', 0.81, 'review'],
    ] as const)('%s が %s なら %s になります', (field, value, expected) => {
      const results = validator.validate(baseInput({ [field]: value }), rule);
      expect(verdictOf(results, 'processing')).toBe(expected);
    });
  });

  describe('申告（AI 生成でない・他サイトで使っていないの両方が必須）', () => {
    it('どちらかの申告が無ければ不合格です', () => {
      const noAi = validator.validate(baseInput({ declaredNotAi: false }), rule);
      expect(verdictOf(noAi, 'declaration')).toBe('fail');
      expect(resultsFor(noAi, 'declaration')[0].reasonCode).toBe(REASON.DECLARATION_MISSING);
      expect(verdictOf(validator.validate(baseInput({ declaredNotReused: false }), rule), 'declaration')).toBe('fail');
    });

    it('機種情報が EXIF に無ければ要確認です', () => {
      const noDevice = validator.validate(baseInput({ exif: { shotAt: NOON_JST_JUNE, offsetMinutes: 540, hasGps: false, hasDeviceInfo: false } }), rule);
      expect(verdictOf(noDevice, 'declaration')).toBe('review');
      expect(resultsFor(noDevice, 'declaration')[0].reasonCode).toBe(REASON.DEVICE_INFO_MISSING);
    });
  });

  describe('全体の結果（不合格が 1 つでもあれば保存しない。それ以外は確認待ち）', () => {
    it('不合格があれば reject です', () => {
      expect(Validator.overallOutcome(validator.validate(baseInput({ jpegQuality: 40 }), rule))).toBe('reject');
    });

    it('要確認だけなら確認待ちです', () => {
      expect(Validator.overallOutcome(validator.validate(baseInput({ jpegQuality: 55 }), rule))).toBe('pending_review');
    });

    it('不合格の理由は、理由と修正方法を返せるように、理由コードつきで返します', () => {
      const results = validator.validate(baseInput({ blurScore: 10, width: 1200, height: 1600 }), rule);
      const fails = results.filter((r) => r.verdict === 'fail');
      expect(fails.map((r) => r.reasonCode)).toEqual(expect.arrayContaining([REASON.FOCUS_LOW, REASON.ORIENTATION_PORTRAIT]));
    });
  });
});
