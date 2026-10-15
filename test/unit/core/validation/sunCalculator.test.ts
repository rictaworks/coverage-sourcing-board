import { describe, expect, it } from 'vitest';
import { PREFECTURAL_CAPITALS } from '../../../../src/config/geo';
import { VALIDATION_FIXTURES } from '../../../fixtures/validation-inputs';
import { CHECK_ERRORS } from '../../../../src/config/strings/checks';
import { SunCalculator, toShotInstant } from '../../../../src/core/validation/sunCalculator';

/**
 * 参照値：国立天文台 暦計算室「高松(香川県)の日の出入り」（令和 8 年 2026 年の月別の表。確認日 2026-10-16）。
 * 表示は JST の分単位。URL は https://eco.mtk.nao.ac.jp/koyomi/dni/2026/s3806.html（06 月）、s3812.html（12 月）、s3801.html（01 月）。
 * 国立天文台の座標は 34.35 N・134.05 E。ここでは市役所の座標を使うため、差は数秒から数十秒の範囲です。
 */
const TAKAMATSU = PREFECTURAL_CAPITALS.find((point) => point.name === VALIDATION_FIXTURES.capitalTakamatsu);
const NAOJ_REFERENCE = [
  { date: '2026-06-01', sunrise: '04:53', sunset: '19:11' },
  { date: '2026-06-21', sunrise: '04:52', sunset: '19:19' },
  { date: '2026-12-01', sunrise: '06:51', sunset: '16:54' },
  { date: '2026-12-21', sunrise: '07:06', sunset: '16:58' },
  { date: '2026-01-01', sunrise: '07:10', sunset: '17:05' },
] as const;

/** 指定の日付と JST の時刻（HH:MM）の瞬間を返します。 */
function jst(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+09:00`);
}

/** 分単位の差（絶対値）を返します。 */
function minutesApart(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

describe('SunCalculator（日の出と日の入りの近似）', () => {
  const calculator = new SunCalculator();

  it('県庁所在地は 4 件で、徳島市・高松市・松山市・高知市の座標を持ちます', () => {
    expect(PREFECTURAL_CAPITALS.map((point) => point.name)).toEqual(VALIDATION_FIXTURES.capitalNames);
    for (const point of PREFECTURAL_CAPITALS) {
      expect(point.lat).toBeGreaterThan(33);
      expect(point.lat).toBeLessThan(35);
      expect(point.lng).toBeGreaterThan(132);
      expect(point.lng).toBeLessThan(135);
    }
  });

  it.each(NAOJ_REFERENCE)('高松の $date の日の出と日の入りは、国立天文台の値と ±10 分以内です', ({ date, sunrise, sunset }) => {
    if (TAKAMATSU === undefined) {
      throw new Error('The Takamatsu coordinates are missing.');
    }
    const anchor = jst(date, '12:00');
    const times = calculator.sunTimes(anchor, TAKAMATSU.lat, TAKAMATSU.lng);
    expect(times.sunrise).not.toBeNull();
    expect(times.sunset).not.toBeNull();
    expect(minutesApart(times.sunrise as Date, jst(date, sunrise))).toBeLessThanOrEqual(10);
    expect(minutesApart(times.sunset as Date, jst(date, sunset))).toBeLessThanOrEqual(10);
  });

  it.each(NAOJ_REFERENCE)('高松の $date の日の出と日の入りは、SPEC の表の値と 1 分以内です', ({ date, sunrise, sunset }) => {
    if (TAKAMATSU === undefined) {
      throw new Error('The Takamatsu coordinates are missing.');
    }
    const times = calculator.sunTimes(jst(date, '12:00'), TAKAMATSU.lat, TAKAMATSU.lng);
    expect(times.sunrise).not.toBeNull();
    expect(times.sunset).not.toBeNull();
    expect(minutesApart(times.sunrise as Date, jst(date, sunrise))).toBeLessThanOrEqual(1);
    expect(minutesApart(times.sunset as Date, jst(date, sunset))).toBeLessThanOrEqual(1);
  });

  it('夏至の正午（JST）は昼間、午前 2 時は夜です', () => {
    expect(calculator.isDaytime(jst('2026-06-21', '12:00'), 34.3428, 134.0466)).toBe(true);
    expect(calculator.isDaytime(jst('2026-06-21', '02:00'), 34.3428, 134.0466)).toBe(false);
  });

  it('冬至の 16:30（JST）は昼間、17:30（JST）は夜です（日の入りは 16:58 頃）', () => {
    expect(calculator.isDaytime(jst('2026-12-21', '16:30'), 34.3428, 134.0466)).toBe(true);
    expect(calculator.isDaytime(jst('2026-12-21', '17:30'), 34.3428, 134.0466)).toBe(false);
  });

  it('日の出の直前は夜、日の入りの直後は夜です（境界の両側）', () => {
    expect(calculator.isDaytime(jst('2026-06-21', '04:40'), 34.3428, 134.0466)).toBe(false);
    expect(calculator.isDaytime(jst('2026-06-21', '05:00'), 34.3428, 134.0466)).toBe(true);
    expect(calculator.isDaytime(jst('2026-06-21', '19:10'), 34.3428, 134.0466)).toBe(true);
    expect(calculator.isDaytime(jst('2026-06-21', '19:30'), 34.3428, 134.0466)).toBe(false);
  });

  it('極夜や白夜のような、日の出と日の入りがない場合も判定します（北極圏の例）', () => {
    expect(calculator.isDaytime(jst('2026-06-21', '00:30'), 80, 0)).toBe(true);
    expect(calculator.isDaytime(jst('2026-12-21', '12:00'), 80, 0)).toBe(false);
  });
});

describe('toShotInstant（EXIF の撮影日時を瞬間に変換）', () => {
  it('時差（分）が無いときは日本時間（+09:00）とみなします', () => {
    const wall = { year: 2026, month: 6, day: 21, hour: 12, minute: 0, second: 0 };
    expect(toShotInstant(wall, null).toISOString()).toBe('2026-06-21T03:00:00.000Z');
  });

  it('時差があるときは、その時差を使います', () => {
    const wall = { year: 2026, month: 6, day: 21, hour: 12, minute: 0, second: 0 };
    expect(toShotInstant(wall, 540).toISOString()).toBe('2026-06-21T03:00:00.000Z');
    expect(toShotInstant(wall, 0).toISOString()).toBe('2026-06-21T12:00:00.000Z');
    expect(toShotInstant(wall, -300).toISOString()).toBe('2026-06-21T17:00:00.000Z');
  });

  it('範囲外の値（13 月など）は例外にします', () => {
    expect(() => toShotInstant({ year: 2026, month: 13, day: 1, hour: 0, minute: 0, second: 0 }, null)).toThrow();
  });
});

describe('SunCalculator の入力の検証', () => {
  const calc = new SunCalculator();
  const valid = new Date('2026-06-01T03:00:00Z');

  it('不正な日時（NaN）は例外にします', () => {
    expect(() => calc.isDaytime(new Date(Number.NaN), 34, 134)).toThrow(CHECK_ERRORS.invalidDate);
    expect(() => calc.sunTimes(new Date(Number.NaN), 34, 134)).toThrow(CHECK_ERRORS.invalidDate);
  });

  it('緯度が範囲外（-90〜90 の外、NaN）なら例外にします', () => {
    expect(() => calc.isDaytime(valid, 90.1, 134)).toThrow(CHECK_ERRORS.invalidLatitude);
    expect(() => calc.isDaytime(valid, -90.1, 134)).toThrow(CHECK_ERRORS.invalidLatitude);
    expect(() => calc.sunTimes(valid, Number.NaN, 134)).toThrow(CHECK_ERRORS.invalidLatitude);
  });

  it('経度が範囲外（-180〜180 の外、NaN）なら例外にします', () => {
    expect(() => calc.isDaytime(valid, 34, 180.1)).toThrow(CHECK_ERRORS.invalidLongitude);
    expect(() => calc.isDaytime(valid, 34, -180.1)).toThrow(CHECK_ERRORS.invalidLongitude);
    expect(() => calc.sunTimes(valid, 34, Number.NaN)).toThrow(CHECK_ERRORS.invalidLongitude);
  });

  it('境界の値（緯度 ±90、経度 ±180）は例外にしません', () => {
    expect(() => calc.isDaytime(valid, 90, 180)).not.toThrow();
    expect(() => calc.isDaytime(valid, -90, -180)).not.toThrow();
  });
});
