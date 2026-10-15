/**
 * 日の出と日の入りの近似（NOAA の太陽位置の式）。外部に依存しない純粋な計算です。
 *
 * 精度の目安は分単位（数分の誤差）です。太陽の上辺が地平線に一致する時刻（天頂距離 90.833 度）を求めます。
 * 国立天文台の暦（高松）との比較は test/unit/core/validation/sunCalculator.test.ts にあり、SPEC/validation.md に記録します。
 */
import { CHECK_ERRORS } from '../../config/strings/checks';
import { JST_OFFSET_MINUTES } from '../../config/geo';
import type { DaytimeJudge } from '../types';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** 1970-01-01T00:00:00Z のユリウス日。 */
const JULIAN_DAY_AT_UNIX_EPOCH = 2440587.5;
/** 2000-01-01T12:00:00Z（J2000）のユリウス日。 */
const JULIAN_DAY_J2000 = 2451545.0;
/** 太陽の上辺と大気の屈折を含む天頂距離（度）。 */
const SUNRISE_ZENITH_DEG = 90.833;
/** 時差（分）の上限の目安（±14 時間）。 */
const MAX_OFFSET_MINUTES = 840;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
const normalizeDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;

/** EXIF の撮影日時（撮影地の時計での年月日時分秒）。 */
export interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** 1 日分の太陽の時刻。polar は極地の白夜・極夜（日の出と日の入りがない場合）を表します。 */
export interface SunEvents {
  readonly solarNoon: Date;
  readonly sunrise: Date | null;
  readonly sunset: Date | null;
  readonly polar: 'none' | 'day' | 'night';
}

/**
 * EXIF の撮影日時を瞬間（UTC の Date）に変換します。時差（分）が無ければ日本時間（+540 分）とみなします。
 * 範囲外の値は例外にします。
 */
export function toShotInstant(wall: WallClock, offsetMinutes: number | null): Date {
  const fields = [wall.year, wall.month, wall.day, wall.hour, wall.minute, wall.second];
  if (!fields.every((value) => Number.isInteger(value))) {
    throw new Error(CHECK_ERRORS.invalidWallClock);
  }
  const utcMs = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const probe = new Date(utcMs);
  const matches =
    probe.getUTCFullYear() === wall.year &&
    probe.getUTCMonth() === wall.month - 1 &&
    probe.getUTCDate() === wall.day &&
    probe.getUTCHours() === wall.hour &&
    probe.getUTCMinutes() === wall.minute &&
    probe.getUTCSeconds() === wall.second;
  if (!matches || wall.hour > 23 || wall.minute > 59 || wall.second > 59) {
    throw new Error(CHECK_ERRORS.invalidWallClock);
  }
  const offset = offsetMinutes ?? JST_OFFSET_MINUTES;
  if (!Number.isInteger(offset) || Math.abs(offset) > MAX_OFFSET_MINUTES) {
    throw new Error(CHECK_ERRORS.invalidShotInstant);
  }
  return new Date(utcMs - offset * MINUTE_MS);
}

/** 太陽の赤緯（ラジアン）と均時差（分）を、時刻 ms で求めます（NOAA の式）。 */
function solarPosition(ms: number): { declinationRad: number; equationOfTimeMinutes: number } {
  const julianDay = ms / DAY_MS + JULIAN_DAY_AT_UNIX_EPOCH;
  const t = (julianDay - JULIAN_DAY_J2000) / 36525;
  const meanLongitude = normalizeDegrees(280.46646 + t * (36000.76983 + t * 0.0003032));
  const meanAnomaly = toRadians(357.52911 + t * (35999.05029 - 0.0001537 * t));
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const equationOfCenter =
    Math.sin(meanAnomaly) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnomaly) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnomaly) * 0.000289;
  const trueLongitude = meanLongitude + equationOfCenter;
  const omega = toRadians(125.04 - 1934.136 * t);
  const apparentLongitude = toRadians(trueLongitude - 0.00569 - 0.00478 * Math.sin(omega));
  const meanObliquity =
    23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = toRadians(meanObliquity + 0.00256 * Math.cos(omega));
  const declinationRad = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));
  const y = Math.tan(obliquity / 2) ** 2;
  const l0 = toRadians(meanLongitude);
  const equationOfTimeRad =
    y * Math.sin(2 * l0) -
    2 * eccentricity * Math.sin(meanAnomaly) +
    4 * eccentricity * y * Math.sin(meanAnomaly) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) -
    1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomaly);
  return { declinationRad, equationOfTimeMinutes: toDegrees(equationOfTimeRad) * 4 };
}

/** 太陽の南中（UTC の ms）を求めます。赤緯と均時差は南中の時刻で求め直します（2 回の反復）。 */
function solarNoonOfDay(utcDayStartMs: number, lng: number): number {
  let noon = utcDayStartMs + (720 - 4 * lng) * MINUTE_MS;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const { equationOfTimeMinutes } = solarPosition(noon);
    noon = utcDayStartMs + (720 - 4 * lng - equationOfTimeMinutes) * MINUTE_MS;
  }
  return noon;
}

/** 日時・緯度・経度を検証します。不正な値は例外にします（黙って「昼間ではない」にはしません）。 */
function assertValidInput(date: Date, lat: number, lng: number): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(CHECK_ERRORS.invalidDate);
  }
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(CHECK_ERRORS.invalidLatitude);
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error(CHECK_ERRORS.invalidLongitude);
  }
}

/** 日の出と日の入りを求めるクラス。DaytimeJudge を実装します。 */
export class SunCalculator implements DaytimeJudge {
  /** anchor の瞬間に最も近い南中を含む、1 日分の日の出と日の入りを返します。 */
  sunTimes(anchor: Date, lat: number, lng: number): SunEvents {
    assertValidInput(anchor, lat, lng);
    const anchorMs = anchor.getTime();
    const dayIndex = Math.floor(anchorMs / DAY_MS);
    let noon = solarNoonOfDay(dayIndex * DAY_MS, lng);
    for (const shift of [-1, 1]) {
      const candidate = solarNoonOfDay((dayIndex + shift) * DAY_MS, lng);
      if (Math.abs(candidate - anchorMs) < Math.abs(noon - anchorMs)) {
        noon = candidate;
      }
    }
    const { declinationRad } = solarPosition(noon);
    const latRad = toRadians(lat);
    const cosHourAngle =
      (Math.cos(toRadians(SUNRISE_ZENITH_DEG)) - Math.sin(latRad) * Math.sin(declinationRad)) /
      (Math.cos(latRad) * Math.cos(declinationRad));
    if (cosHourAngle > 1) {
      return { solarNoon: new Date(noon), sunrise: null, sunset: null, polar: 'night' };
    }
    if (cosHourAngle < -1) {
      return { solarNoon: new Date(noon), sunrise: null, sunset: null, polar: 'day' };
    }
    // 時角（度）を時間の差（分）に換算します（地球は 1 度を 4 分で回る）。
    const halfDayMinutes = toDegrees(Math.acos(cosHourAngle)) * 4;
    return {
      solarNoon: new Date(noon),
      sunrise: new Date(noon - halfDayMinutes * MINUTE_MS),
      sunset: new Date(noon + halfDayMinutes * MINUTE_MS),
      polar: 'none',
    };
  }

  /** 日の出から日の入りの間なら昼間とします。前日・当日・翌日の南中を見て、極地では日中の全体を昼間とします。 */
  isDaytime(date: Date, lat: number, lng: number): boolean {
    assertValidInput(date, lat, lng);
    const ms = date.getTime();
    for (const shift of [-1, 0, 1]) {
      const events = this.sunTimes(new Date(ms + shift * DAY_MS), lat, lng);
      if (events.polar === 'day' && Math.abs(events.solarNoon.getTime() - ms) <= DAY_MS / 2) {
        return true;
      }
      if (events.sunrise !== null && events.sunset !== null) {
        if (events.sunrise.getTime() <= ms && ms <= events.sunset.getTime()) {
          return true;
        }
      }
    }
    return false;
  }
}
