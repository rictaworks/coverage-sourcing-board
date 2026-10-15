import { describe, expect, it } from 'vitest';
import { DebugTracer } from '../../../../src/core/trace';
import { ExifReader } from '../../../../src/frontend/lib/image/exifReader';
import { buildJpeg } from '../../../helpers/jpegBytes';
import { buildExifApp1, insertAfterApp0 } from '../../../helpers/exifFixture';

const reader = new ExifReader();

/** 架空の値だけを使う EXIF を入れた JPEG。 */
function jpegWithExif(options: Parameters<typeof buildExifApp1>[0]): Uint8Array {
  const plain = buildJpeg({ width: 1600, height: 1200 });
  return insertAfterApp0(plain, buildExifApp1(options));
}

/** 戻り値のどこにも現れてはいけない値（座標と機種名）。 */
const SECRET_LATITUDE = '35.123456';
const SECRET_MODEL = 'TestModelX9000';
const SECRET_MAKE = 'TestMakerQ';

describe('ExifReader（EXIF の要約。位置情報と機種情報の値は残しません）', () => {
  it('撮影日時と時差から、絶対時刻（UTC の瞬間）を求めます', async () => {
    const bytes = jpegWithExif({
      dateTimeOriginal: '2026:07:15 10:30:00',
      offsetTimeOriginal: '+09:00',
    });
    const summary = await reader.summarize(bytes);
    expect(summary.shotAt?.toISOString()).toBe('2026-07-15T01:30:00.000Z');
    expect(summary.offsetMinutes).toBe(540);
  });

  it('時差が負の値のときも、正しく求めます', async () => {
    const bytes = jpegWithExif({
      dateTimeOriginal: '2026:01:02 03:04:05',
      offsetTimeOriginal: '-05:30',
    });
    const summary = await reader.summarize(bytes);
    expect(summary.offsetMinutes).toBe(-330);
    expect(summary.shotAt?.toISOString()).toBe('2026-01-02T08:34:05.000Z');
  });

  it('時差が無いときは、撮影日時を null にします（時差の無い時刻を推定で補いません）', async () => {
    const bytes = jpegWithExif({ dateTimeOriginal: '2026:07:15 10:30:00' });
    const summary = await reader.summarize(bytes);
    expect(summary.shotAt).toBeNull();
    expect(summary.offsetMinutes).toBeNull();
  });

  it('GPS と機種情報の有無を真偽値で返し、緯度経度と機種名の値は結果に含めません', async () => {
    const bytes = jpegWithExif({
      dateTimeOriginal: '2026:07:15 10:30:00',
      offsetTimeOriginal: '+09:00',
      make: SECRET_MAKE,
      model: SECRET_MODEL,
      gps: { latitude: 35.123456, longitude: 134.654321 },
    });
    const summary = await reader.summarize(bytes);
    expect(summary.hasGps).toBe(true);
    expect(summary.hasDeviceInfo).toBe(true);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(SECRET_LATITUDE);
    expect(serialized).not.toContain(SECRET_MODEL);
    expect(serialized).not.toContain(SECRET_MAKE);
    expect(Object.keys(summary).sort()).toEqual(['hasDeviceInfo', 'hasGps', 'offsetMinutes', 'shotAt']);
  });

  it('EXIF が無い JPEG は、撮影日時なし・GPS なし・機種情報なしとして読みます', async () => {
    const summary = await reader.summarize(buildJpeg({ width: 1600, height: 1200 }));
    expect(summary).toEqual({ shotAt: null, offsetMinutes: null, hasGps: false, hasDeviceInfo: false });
  });

  it('機種名だけがあるとき、機種情報ありとして扱います（GPS は無し）', async () => {
    const summary = await reader.summarize(jpegWithExif({ model: SECRET_MODEL }));
    expect(summary.hasDeviceInfo).toBe(true);
    expect(summary.hasGps).toBe(false);
  });
});

describe('ExifReader（読み取りの失敗のトレース）', () => {
  it('読み取りが失敗したら、EXIF が無いものとして扱い、失敗の種類の番号だけをトレースに残します', async () => {
    const lines: string[] = [];
    const tracer = new DebugTracer('production', (line) => lines.push(line));
    const failing = new ExifReader(tracer, async () => {
      throw new TypeError('secret-model TestModelX9000 35.123456');
    });
    const summary = await failing.summarize(new Uint8Array([1, 2, 3]));
    expect(summary).toEqual({ shotAt: null, offsetMinutes: null, hasGps: false, hasDeviceInfo: false });
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line.name).toBe('image.exif_read_failed');
    expect(line.fields).toEqual({ errorKind: 2 });
    expect(lines[0]).not.toContain('TestModelX9000');
    expect(lines[0]).not.toContain('35.123456');
  });

  it('読み取りが成功したときは、トレースを出しません', async () => {
    const lines: string[] = [];
    const ok = new ExifReader(new DebugTracer('production', (line) => lines.push(line)));
    await ok.summarize(buildJpeg({ width: 1600, height: 1200 }));
    expect(lines).toEqual([]);
  });
});
