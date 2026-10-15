import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../../src/config/limits';
import { PREFECTURAL_CAPITALS } from '../../../src/config/geo';
import { BROWSER_CHECK_ITEMS } from '../../../src/config/submission';
import type { CampaignDetailView } from '../../../src/frontend/lib/api/campaignApi';
import type { PreparedImage } from '../../../src/frontend/lib/image/preparedImage';
import {
  SubmissionChecker,
  SubmitFormRules,
  resolveCell,
  remainingChars,
  type SubmitFormValues,
} from '../../../src/frontend/lib/submit/runChecks';
import { defaultAcceptRule } from '../../../src/core/validation/validator';
import type { CheckResult, DaytimeJudge } from '../../../src/core/types';
import type { CoverageResponse } from '../../../src/core/api/contract';

/** 4:3・昼間の情報がない、既定の値の整形結果（テストの入力）。 */
function preparedImage(overrides: Partial<PreparedImage['features']> = {}, width = 1600, height = 1200): PreparedImage {
  return {
    saved: { blob: new Blob([]), width, height, bytes: 300_000 },
    classifyImage: { blob: new Blob([]), width: 512, height: 384 },
    features: {
      width,
      height,
      format: 'jpeg',
      quality: 90,
      blurScore: 500,
      meanLuma: 120,
      saturation: 0.4,
      contrast: 0.4,
      phash: '0123456789abcdef',
      ...overrides,
    },
    exif: { shotAt: null, offsetMinutes: null, hasGps: false, hasDeviceInfo: false },
    crop: null,
  };
}

/** 昼の判定を常に真にする、記録つきの判定器（呼ばれた座標を残す）。 */
class RecordingDaytime implements DaytimeJudge {
  readonly calls: { lat: number; lng: number }[] = [];
  isDaytime(_date: Date, lat: number, lng: number): boolean {
    this.calls.push({ lat, lng });
    return true;
  }
}

const BASE_INPUT = {
  rule: defaultAcceptRule(),
  shotMonth: 7,
  prefecture: 'kochi' as const,
  declaredNotAi: true,
  declaredNotReused: true,
};

function verdictOf(results: readonly CheckResult[], item: string): string[] {
  return results.filter((result) => result.item === item).map((result) => result.verdict);
}

describe('SubmissionChecker（一次判定の組み立て）', () => {
  it('4:3 の正常な画像は、要確認だけなので送信できる', () => {
    const outcome = new SubmissionChecker(new RecordingDaytime()).judge({ ...BASE_INPUT, prepared: preparedImage() });
    expect(outcome.results.some((result) => result.verdict === 'fail')).toBe(false);
    expect(outcome.canSend).toBe(true);
    expect(verdictOf(outcome.results, 'shoot_location')).toEqual(['review']);
  });

  it('比率が 4:3 から外れた画像は不合格になり、送信できない', () => {
    const outcome = new SubmissionChecker(new RecordingDaytime()).judge({
      ...BASE_INPUT,
      prepared: preparedImage({}, 1600, 900),
    });
    expect(verdictOf(outcome.results, 'orientation_ratio')).toEqual(['fail']);
    expect(outcome.canSend).toBe(false);
  });

  it('撮影月が無いと不合格になり、送信できない', () => {
    const outcome = new SubmissionChecker(new RecordingDaytime()).judge({
      ...BASE_INPUT,
      shotMonth: null,
      prepared: preparedImage(),
    });
    expect(verdictOf(outcome.results, 'shoot_month_season')).toEqual(['fail']);
    expect(outcome.canSend).toBe(false);
  });

  it('申告が未チェックだと不合格になり、送信できない', () => {
    const outcome = new SubmissionChecker(new RecordingDaytime()).judge({
      ...BASE_INPUT,
      declaredNotAi: false,
      prepared: preparedImage(),
    });
    expect(verdictOf(outcome.results, 'declaration')).toEqual(['fail']);
    expect(outcome.canSend).toBe(false);
  });

  it('昼間の判定は、選んだ区分値の県の県庁所在地の座標だけで行う', () => {
    const daytime = new RecordingDaytime();
    new SubmissionChecker(daytime).judge({
      ...BASE_INPUT,
      prepared: { ...preparedImage(), exif: { shotAt: new Date('2026-07-15T01:30:00Z'), offsetMinutes: 540, hasGps: false, hasDeviceInfo: true } },
    });
    const kochi = PREFECTURAL_CAPITALS[3];
    expect(daytime.calls.length).toBeGreaterThan(0);
    expect(daytime.calls.every((call) => call.lat === kochi.lat && call.lng === kochi.lng)).toBe(true);
  });

  it('ブラウザの判定は、重複を除いた 10 項目を 1 件ずつ返す（jpeg_quality は PNG でも 1 件）', () => {
    const outcome = new SubmissionChecker(new RecordingDaytime()).judge({
      ...BASE_INPUT,
      prepared: { ...preparedImage({ format: 'png', quality: undefined }) },
    });
    const browserChecks = new SubmissionChecker(new RecordingDaytime()).toBrowserChecks(outcome.results);
    const items = browserChecks.map((check) => check.item);
    expect([...items].sort()).toEqual([...BROWSER_CHECK_ITEMS].sort());
    expect(new Set(items).size).toBe(items.length);
    expect(browserChecks.find((check) => check.item === 'jpeg_quality')).toEqual({
      item: 'jpeg_quality',
      verdict: 'pass',
      reasonCode: 'passed',
    });
  });

  it('同じ項目に複数の理由があるときは、不合格を優先して 1 件だけ送る', () => {
    const checker = new SubmissionChecker(new RecordingDaytime());
    const others: CheckResult[] = BROWSER_CHECK_ITEMS.filter((item) => item !== 'resolution').map((item) => ({
      item,
      verdict: 'pass',
      reasonCode: 'passed',
    }));
    const results: CheckResult[] = [
      ...others,
      { item: 'resolution', verdict: 'review', reasonCode: 'pixels_too_many' },
      { item: 'resolution', verdict: 'fail', reasonCode: 'short_side_too_small' },
    ];
    const browserChecks = checker.toBrowserChecks(results);
    expect(browserChecks).toHaveLength(BROWSER_CHECK_ITEMS.length);
    expect(browserChecks.find((check) => check.item === 'resolution')).toEqual({
      item: 'resolution',
      verdict: 'fail',
      reasonCode: 'short_side_too_small',
    });
  });
});

const CAMPAIGN: CampaignDetailView = {
  id: 'campaign-1',
  name: 'test',
  areas: [{ id: 'area-1', prefecture: 'tokushima', label: 'area-a' }],
  periods: [
    { id: 'period-spring', label: 'spring', months: [3, 4, 5] },
    { id: 'period-summer', label: 'summer', months: [6, 7, 8] },
  ],
  acceptRule: defaultAcceptRule(),
  cells: [
    { cellId: 'cell-spring', areaId: 'area-1', periodId: 'period-spring', required: 3 },
    { cellId: 'cell-summer', areaId: 'area-1', periodId: 'period-summer', required: 3 },
  ],
} as unknown as CampaignDetailView;

const COVERAGE: CoverageResponse = {
  cells: [
    { cellId: 'cell-spring', areaId: 'area-1', periodId: 'period-spring', accepted: 0, pendingReview: 0, required: 3, closed: false },
    { cellId: 'cell-summer', areaId: 'area-1', periodId: 'period-summer', accepted: 3, pendingReview: 0, required: 3, closed: true },
  ],
  priority: ['cell-spring'],
};

describe('resolveCell（区分値と撮影月からマスを選ぶ）', () => {
  it('撮影月の季節のマスを返し、募集終了かどうかを示す', () => {
    expect(resolveCell(CAMPAIGN, COVERAGE, 'area-1', 4)).toEqual({ kind: 'ok', cellId: 'cell-spring', closed: false });
    expect(resolveCell(CAMPAIGN, COVERAGE, 'area-1', 8)).toEqual({ kind: 'ok', cellId: 'cell-summer', closed: true });
  });

  it('どの季節の期間にも含まれない月は、マスがない', () => {
    expect(resolveCell(CAMPAIGN, COVERAGE, 'area-1', 11)).toEqual({ kind: 'no_period' });
  });
});

describe('SubmitFormRules（入力欄の検査）', () => {
  const rules = new SubmitFormRules();
  const valid: SubmitFormValues = {
    areaId: 'area-1',
    shotMonth: '7',
    spotName: '',
    caption: '',
    declaredNotAi: true,
    declaredNotReused: true,
    consent: true,
  };

  it('必須の入力が揃えば、撮影月を数値にして通す', () => {
    expect(rules.check(valid)).toEqual({ ok: true, shotMonth: 7, spotName: '', caption: '' });
  });

  it('区分と撮影月が無いと、その欄の誤りになる', () => {
    const result = rules.check({ ...valid, areaId: '', shotMonth: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field).sort()).toEqual(['area', 'month']);
    }
  });

  it('地点名は 20 字まで、説明文は 60 字までを通し、超えると誤りになる', () => {
    expect(rules.check({ ...valid, spotName: 'x'.repeat(LIMITS.spotNameMaxChars) }).ok).toBe(true);
    expect(rules.check({ ...valid, caption: 'x'.repeat(LIMITS.captionMaxChars) }).ok).toBe(true);
    const spot = rules.check({ ...valid, spotName: 'x'.repeat(LIMITS.spotNameMaxChars + 1) });
    expect(spot.ok).toBe(false);
    const caption = rules.check({ ...valid, caption: 'x'.repeat(LIMITS.captionMaxChars + 1) });
    expect(caption.ok).toBe(false);
  });

  it('申告か同意が無いと誤りになる', () => {
    const result = rules.check({ ...valid, declaredNotAi: false, consent: false });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field).sort()).toEqual(['consent', 'declaration']);
    }
  });

  it('制御文字（改行など）を含む文字列は誤りになる', () => {
    expect(rules.check({ ...valid, caption: 'a\nb' }).ok).toBe(false);
  });

  it('残りの字数は、コードポイントで数える', () => {
    expect(remainingChars('a\u{1F600}', 20)).toBe(18);
  });
});
