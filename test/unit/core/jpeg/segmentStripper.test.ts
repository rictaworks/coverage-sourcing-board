import { describe, expect, it } from 'vitest';
import { inspectJpeg } from '../../../../src/core/jpeg/jpegInspector';
import { stripDisallowedSegments } from '../../../../src/core/jpeg/segmentStripper';
import { app0Jfif, app13Iptc, app1Exif, app2Icc, buildJpeg, com, dht, dqt, eoi, largeScan, rst, sof, soi, sos, TEST_MARKER, toBytes } from '../../../helpers/jpegBytes';

/** バイト列の中の、マーカー（FF xx）の並びを、スキャンの前まで読む。 */
function markersBeforeScan(bytes: Uint8Array): number[] {
  const codes: number[] = [];
  let pos = 2;
  while (pos + 3 < bytes.length) {
    const code = bytes[pos + 1];
    codes.push(code);
    if (code === TEST_MARKER.SOS) {
      break;
    }
    pos += 2 + ((bytes[pos + 2] << 8) | bytes[pos + 3]);
  }
  return codes;
}

/** SOS の後から EOI の前までの、圧縮データ。 */
function scanData(bytes: Uint8Array): Uint8Array {
  let pos = 2;
  for (;;) {
    if (bytes[pos + 1] === TEST_MARKER.SOS) {
      const start = pos + 2 + ((bytes[pos + 2] << 8) | bytes[pos + 3]);
      return bytes.subarray(start, bytes.length - 2);
    }
    pos += 2 + ((bytes[pos + 2] << 8) | bytes[pos + 3]);
  }
}

describe('stripDisallowedSegments（許可リスト以外のメタデータのセグメントを取り除く）', () => {
  const scan = largeScan(3000);

  it('ICC の APP2 を取り除き、APP0・DQT・SOF・DHT・SOS を残します', () => {
    const input = buildJpeg({ extraSegments: [app2Icc()], scan });
    expect(inspectJpeg(input).ok).toBe(false);
    const output = stripDisallowedSegments(input);
    expect(output).not.toBeNull();
    const codes = markersBeforeScan(output as Uint8Array);
    expect(codes).not.toContain(TEST_MARKER.APP2);
    expect(codes).toEqual([TEST_MARKER.APP0, TEST_MARKER.DQT, TEST_MARKER.SOF0, TEST_MARKER.DHT, TEST_MARKER.SOS]);
  });

  it('取り除いた後の JPEG は、B4 の検査（inspectJpeg）に合格し、寸法が同じです', () => {
    const input = buildJpeg({ width: 1600, height: 1200, extraSegments: [app2Icc()], scan });
    const output = stripDisallowedSegments(input) as Uint8Array;
    expect(inspectJpeg(output)).toEqual({ ok: true, width: 1600, height: 1200, progressive: false });
  });

  it('圧縮データ（画素）は 1 バイトも変わりません', () => {
    const input = buildJpeg({ extraSegments: [app2Icc()], scan });
    const output = stripDisallowedSegments(input) as Uint8Array;
    expect(Array.from(scanData(output))).toEqual(scan);
  });

  it('APP1（EXIF・XMP）・APP13（IPTC）・COM も取り除きます', () => {
    const input = buildJpeg({ extraSegments: [app1Exif(), app2Icc(), app13Iptc(), com('secret')], scan });
    const output = stripDisallowedSegments(input) as Uint8Array;
    expect(inspectJpeg(output).ok).toBe(true);
    expect(markersBeforeScan(output)).toEqual([TEST_MARKER.APP0, TEST_MARKER.DQT, TEST_MARKER.SOF0, TEST_MARKER.DHT, TEST_MARKER.SOS]);
  });

  it('取り除くものが無いときは、同じ内容を返します', () => {
    const input = buildJpeg({ scan });
    expect(Array.from(stripDisallowedSegments(input) as Uint8Array)).toEqual(Array.from(input));
  });

  it('プログレッシブ（スキャンが複数、間に DHT がある）でも、スキャンの中の DHT を残します', () => {
    const input = toBytes([
      ...soi(), ...app0Jfif(), ...app2Icc(), ...dqt(), ...sof(TEST_MARKER.SOF2, 800, 600),
      ...dht(), ...sos(), 0x11, 0xff, 0x00, 0x22, ...rst(0), 0x33,
      ...app2Icc(), ...dht(), ...sos(), 0x44, 0x55,
      ...eoi(),
    ]);
    const output = stripDisallowedSegments(input) as Uint8Array;
    expect(inspectJpeg(output)).toEqual({ ok: true, width: 800, height: 600, progressive: true });
    const text = Array.from(output);
    expect(text.join(',').includes('255,226')).toBe(false);
    expect(text.slice(-4)).toEqual([0x44, 0x55, 0xff, 0xd9]);
  });

  it('JPEG でないバイト列は null を返します（推定で補いません）', () => {
    expect(stripDisallowedSegments(toBytes([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(stripDisallowedSegments(buildJpeg({ withEoi: false, scan }))).toBeNull();
  });
});
