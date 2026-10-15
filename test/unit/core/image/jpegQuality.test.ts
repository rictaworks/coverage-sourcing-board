import { describe, expect, it } from 'vitest';
import {
  IJG_LUMINANCE_TABLE,
  JPEG_ZIGZAG_ORDER,
  estimateJpegQuality,
  scaleQuantTable,
} from '../../../../src/core/image/jpegQuality';
import { ImageInputError } from '../../../../src/core/image/rgbaImage';
import { IMAGE_FEATURE_STRINGS } from '../../../../src/config/strings/image';

/** 自然順の量子化テーブルを、JPEG の DQT セグメント（ジグザグ順）に詰めた JPEG のバイト列を作ります。 */
function buildJpegWithTable(natural: readonly number[], precision: 8 | 16): Uint8Array {
  const body: number[] = [precision === 16 ? 0x10 : 0x00];
  for (let k = 0; k < 64; k += 1) {
    const value = natural[JPEG_ZIGZAG_ORDER[k]];
    if (precision === 16) {
      body.push(value >> 8, value & 0xff);
    } else {
      body.push(value);
    }
  }
  const segmentLength = 2 + body.length;
  return Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xdb, segmentLength >> 8, segmentLength & 0xff, ...body, // DQT
    0xff, 0xd9, // EOI
  ]);
}

describe('estimateJpegQuality', () => {
  it.each([50, 75, 90])('estimates the IJG quality %i within plus or minus 3', (quality) => {
    const table = scaleQuantTable(IJG_LUMINANCE_TABLE, quality, 255);
    const result = estimateJpegQuality(buildJpegWithTable(table, 8));
    expect(result.status).toBe('estimated');
    if (result.status !== 'estimated') {
      return;
    }
    expect(Math.abs(result.quality - quality)).toBeLessThanOrEqual(3);
  });

  it('estimates the quality from a 16-bit precision table', () => {
    const table = scaleQuantTable(IJG_LUMINANCE_TABLE, 75, 65535);
    const result = estimateJpegQuality(buildJpegWithTable(table, 16));
    expect(result.status).toBe('estimated');
    if (result.status !== 'estimated') {
      return;
    }
    expect(Math.abs(result.quality - 75)).toBeLessThanOrEqual(3);
  });

  it('skips an APP0 segment before the quantization table', () => {
    const table = scaleQuantTable(IJG_LUMINANCE_TABLE, 90, 255);
    const jfif = [
      0xff, 0xe0, 0x00, 0x10, // APP0, length 16
      0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    ];
    const base = buildJpegWithTable(table, 8);
    const withApp0 = Uint8Array.from([...base.slice(0, 2), ...jfif, ...base.slice(2)]);
    const result = estimateJpegQuality(withApp0);
    expect(result.status).toBe('estimated');
    if (result.status !== 'estimated') {
      return;
    }
    expect(Math.abs(result.quality - 90)).toBeLessThanOrEqual(3);
  });

  it('reports not-jpeg for PNG bytes', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(estimateJpegQuality(png)).toEqual({ status: 'unavailable', reason: 'not-jpeg' });
  });

  it('reports not-jpeg for empty bytes', () => {
    expect(estimateJpegQuality(new Uint8Array(0))).toEqual({
      status: 'unavailable',
      reason: 'not-jpeg',
    });
  });

  it('reports no-quantization-table for a JPEG without DQT', () => {
    const jpegWithoutDqt = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
    expect(estimateJpegQuality(jpegWithoutDqt)).toEqual({
      status: 'unavailable',
      reason: 'no-quantization-table',
    });
  });

  it('reports malformed when the DQT length runs past the end of the bytes', () => {
    const truncated = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x10]);
    expect(estimateJpegQuality(truncated)).toEqual({ status: 'unavailable', reason: 'malformed' });
  });
});

describe('JPEG quantization helpers', () => {
  it('orders the zigzag scan from the top-left corner', () => {
    expect(JPEG_ZIGZAG_ORDER.slice(0, 10)).toEqual([0, 1, 8, 16, 9, 2, 3, 10, 17, 24]);
    expect(JPEG_ZIGZAG_ORDER[63]).toBe(63);
    expect([...JPEG_ZIGZAG_ORDER].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 64 }, (_, i) => i),
    );
  });

  it('returns the IJG table itself at quality 50', () => {
    expect(scaleQuantTable(IJG_LUMINANCE_TABLE, 50, 255)).toEqual([...IJG_LUMINANCE_TABLE]);
  });

  it.each([0, -1, 101, 50.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'throws for quality %s, which is not an integer from 1 to 100',
    (quality) => {
      expect(() => scaleQuantTable(IJG_LUMINANCE_TABLE, quality, 255)).toThrow(ImageInputError);
      expect(() => scaleQuantTable(IJG_LUMINANCE_TABLE, quality, 255)).toThrow(
        IMAGE_FEATURE_STRINGS.invalidQuality,
      );
    },
  );

  it.each([1, 100])('accepts the boundary quality %i', (quality) => {
    expect(scaleQuantTable(IJG_LUMINANCE_TABLE, quality, 255)).toHaveLength(64);
  });
});
