import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ImageFileProbe } from '../../../../src/frontend/lib/image/fileProbe';
import { RULE_DEFAULTS } from '../../../../src/config/defaults';
import { buildJpeg, app1Exif, toBytes, TEST_MARKER } from '../../../helpers/jpegBytes';
import { ascii } from '../../../helpers/jpegBytes';

const probe = new ImageFileProbe();

/** PNG の先頭（署名と IHDR）だけを組み立てる。probe は寸法の読み取りにだけ使う。 */
function pngHeader(width: number, height: number): Uint8Array {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const length = [0, 0, 0, 13];
  const ihdr = ascii('IHDR');
  const dims = [
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
  ];
  const rest = [8, 6, 0, 0, 0];
  return toBytes([...signature, ...length, ...ihdr, ...dims, ...rest, 0, 0, 0, 0]);
}

describe('ImageFileProbe（ファイルの形式と寸法の判定、デコードの前）', () => {
  it('JPEG を先頭のバイトで判定し、SOF から寸法を読みます', () => {
    const result = probe.probe(buildJpeg({ width: 1600, height: 1200 }));
    expect(result).toEqual({ ok: true, format: 'jpeg', width: 1600, height: 1200 });
  });

  it('プログレッシブの JPEG（SOF2）も寸法を読みます', () => {
    const result = probe.probe(buildJpeg({ width: 800, height: 600, progressive: true }));
    expect(result).toEqual({ ok: true, format: 'jpeg', width: 800, height: 600 });
  });

  it('EXIF の APP1 があっても、その後の SOF から寸法を読みます（入力では EXIF を許します）', () => {
    const result = probe.probe(buildJpeg({ width: 640, height: 480, extraSegments: [app1Exif()] }));
    expect(result).toEqual({ ok: true, format: 'jpeg', width: 640, height: 480 });
  });

  it('PNG を先頭のバイトで判定し、IHDR から寸法を読みます', () => {
    const result = probe.probe(pngHeader(1200, 900));
    expect(result).toEqual({ ok: true, format: 'png', width: 1200, height: 900 });
  });

  it('SVG は拒否します（拡張子ではなく中身で判定します）', () => {
    const svg = readFileSync(join(process.cwd(), 'test', 'fixtures', 'images', 'sample.svg'));
    expect(probe.probe(new Uint8Array(svg))).toEqual({ ok: false, reason: 'unsupported_format' });
  });

  it('GIF や空のバイト列など、JPEG と PNG 以外は拒否します', () => {
    expect(probe.probe(toBytes(ascii('GIF89a' + '\u0001\u0000\u0001\u0000')))).toEqual({
      ok: false,
      reason: 'unsupported_format',
    });
    expect(probe.probe(new Uint8Array(0))).toEqual({ ok: false, reason: 'unsupported_format' });
  });

  it('SOF が無い JPEG（途中で切れたもの）は、寸法を読めないとして拒否します', () => {
    const truncated = buildJpeg({ withFrame: false, withScan: false, withEoi: false });
    expect(probe.probe(truncated)).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('画素数が 4,000 万を超える画像は、デコードの前に拒否します', () => {
    const over = probe.probe(buildJpeg({ width: 8000, height: 5001 }));
    expect(over).toEqual({ ok: false, reason: 'too_many_pixels' });
    const at = probe.probe(buildJpeg({ width: 8000, height: 5000 }));
    expect(at).toEqual({ ok: true, format: 'jpeg', width: 8000, height: 5000 });
  });

  it('ファイルの大きさが 5 MB を超えたら、読む前に拒否します（5 MB ちょうどは通します）', () => {
    expect(probe.checkByteSize(RULE_DEFAULTS.maxInputBytes)).toBeNull();
    expect(probe.checkByteSize(RULE_DEFAULTS.maxInputBytes + 1)).toBe('too_large');
  });

  it('マーカーの先頭が SOI でない JPEG 風のバイト列は拒否します', () => {
    expect(probe.probe(toBytes([0xff, TEST_MARKER.EOI, 0x00]))).toEqual({
      ok: false,
      reason: 'unsupported_format',
    });
  });
});
