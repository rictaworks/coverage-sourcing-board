import exifr from 'exifr';
import { DebugTracer } from '../../../core/trace';
import type { ExifSummary } from '../../../core/types';

/** 読み取りに使うタグ。撮影日時・時差・機種・GPS の有無だけを取り出します（値の保存はしません）。 */
const PICKED_TAGS = [
  'DateTimeOriginal',
  'OffsetTimeOriginal',
  'Make',
  'Model',
  'GPSLatitude',
  'GPSLongitude',
] as const;

const DATE_PATTERN = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const OFFSET_PATTERN = /^([+-])(\d{2}):(\d{2})$/;

/** 読み取った EXIF の、判定に使う部分だけの値（読み取りの中間の型）。 */
interface RawExifFields {
  readonly DateTimeOriginal?: unknown;
  readonly OffsetTimeOriginal?: unknown;
  readonly Make?: unknown;
  readonly Model?: unknown;
  readonly GPSLatitude?: unknown;
  readonly GPSLongitude?: unknown;
}

/**
 * exifr（A1 で固定した版）で EXIF を読み、判定に使う要約（ExifSummary）を返します。
 * 緯度経度と機種名の値は、この関数の中で使わず、結果にも含めません。
 * 読み取りに失敗した EXIF は、EXIF が無いものとして扱います（推定の値で補いません）。
 * shotAt は、D4 の判定（撮影月の照合・昼間の判定）の中だけで使います。保存にも送信にも含めません。
 */
export class ExifReader {
  constructor(
    private readonly tracer: DebugTracer = new DebugTracer('production', (line) => console.debug(line)),
    private readonly parse: ExifParse = defaultParse,
  ) {}

  /** 読み取りの要約を返します。EXIF が無い・読めない場合は、すべて空の要約になります。 */
  async summarize(bytes: Uint8Array | ArrayBuffer): Promise<ExifSummary> {
    const fields = await this.readFields(bytes);
    if (fields === null) {
      return emptySummary();
    }
    const offsetMinutes = parseOffsetMinutes(fields.OffsetTimeOriginal);
    const shotAt = offsetMinutes === null ? null : parseShotAt(fields.DateTimeOriginal, offsetMinutes);
    return {
      shotAt,
      offsetMinutes,
      hasGps: fields.GPSLatitude !== undefined && fields.GPSLongitude !== undefined,
      hasDeviceInfo: isPresent(fields.Make) || isPresent(fields.Model),
    };
  }

  private async readFields(bytes: Uint8Array | ArrayBuffer): Promise<RawExifFields | null> {
    try {
      const parsed = (await this.parse(bytes, { pick: [...PICKED_TAGS], reviveValues: false })) as RawExifFields | undefined;
      return parsed ?? null;
    } catch (error) {
      // 失敗の種類の番号だけを残します（メッセージには値が含まれることがあるため、残しません）。
      this.tracer.summary('image.exif_read_failed', { errorKind: errorKindOf(error) });
      return null;
    }
  }
}

type ExifParse = (bytes: Uint8Array | ArrayBuffer, options: object) => Promise<unknown>;

const defaultParse: ExifParse = (bytes, options) => exifr.parse(bytes, options);

/** 失敗の種類の番号。0 その他、1 Error、2 TypeError、3 RangeError。 */
function errorKindOf(error: unknown): number {
  if (error instanceof TypeError) {
    return 2;
  }
  if (error instanceof RangeError) {
    return 3;
  }
  return error instanceof Error ? 1 : 0;
}

function emptySummary(): ExifSummary {
  return { shotAt: null, offsetMinutes: null, hasGps: false, hasDeviceInfo: false };
}

function isPresent(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
}

/** "+09:00" の形式を分に直します。形式が違えば null です。 */
export function parseOffsetMinutes(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = OFFSET_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/**
 * "YYYY:MM:DD HH:MM:SS" と時差から、絶対時刻を求めます（タイムゾーンに依存しません）。
 * 形式が違えば null です。
 */
export function parseShotAt(value: unknown, offsetMinutes: number): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = DATE_PATTERN.exec(value.trim());
  if (match === null) {
    return null;
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return new Date(wallClockUtc - offsetMinutes * 60_000);
}
