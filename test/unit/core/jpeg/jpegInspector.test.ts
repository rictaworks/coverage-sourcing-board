import { describe, expect, it } from 'vitest';
import { inspectJpeg } from '../../../../src/core/jpeg/jpegInspector';
import {
  TEST_MARKER,
  app0Jfif,
  app13Iptc,
  app1Exif,
  app1Xmp,
  app2Icc,
  ascii,
  buildJpeg,
  com,
  concatBytes,
  dht,
  dqt,
  eoi,
  largeScan,
  segment,
  sof,
  soi,
  sos,
  toBytes,
} from '../../../helpers/jpegBytes';

describe('inspectJpeg の合格', () => {
  it('最小の妥当な JPEG を合格にし、幅と高さを SOF から読む', () => {
    const result = inspectJpeg(buildJpeg({ width: 1600, height: 1200 }));
    expect(result).toEqual({ ok: true, width: 1600, height: 1200, progressive: false });
  });

  it('SOF2（プログレッシブ）も合格にし、progressive を true にする', () => {
    const result = inspectJpeg(buildJpeg({ width: 640, height: 480, progressive: true }));
    expect(result).toEqual({ ok: true, width: 640, height: 480, progressive: true });
  });

  it('圧縮データの FF 00 と RST を、マーカーと誤認しない', () => {
    // FF 00 は本体の FF（スタッフィング）なので、後ろの E1（APP1 と同じ値）は本体の一部として読み飛ばす。
    const scan = [0x12, 0xff, 0x00, 0xe1, 0x00, 0x08, 0xff, 0xd3, 0x34, 0xff, 0x00];
    const result = inspectJpeg(buildJpeg({ scan }));
    expect(result.ok).toBe(true);
  });

  it('圧縮データの中の FF E1（スタッフィングされていない）は APP1 として拒否する', () => {
    const scan = [0x12, 0xff, 0xe1, 0x00, 0x08, 0x34];
    expect(inspectJpeg(buildJpeg({ scan }))).toMatchObject({ ok: false, reason: 'forbidden_segment' });
  });

  it('プログレッシブの複数の SOS を含むものを合格にする', () => {
    const bytes = concatBytes(
      [...soi(), ...app0Jfif(), ...dqt(), ...sof(TEST_MARKER.SOF2, 320, 240), ...dht()],
      [...sos(), 0x11, 0x22, 0xff, 0x00],
      [...dht(), ...sos(), 0x33, 0xff, 0xd1, 0x44],
      [...eoi()],
    );
    const result = inspectJpeg(toBytes(bytes));
    expect(result).toEqual({ ok: true, width: 320, height: 240, progressive: true });
  });

  it('1,900,000 バイトの入力を、時間の上限のうちに処理して合格にする', () => {
    const bytes = buildJpeg({ scan: largeScan(1_900_000) });
    expect(bytes.length).toBeGreaterThan(1_900_000);
    const started = performance.now();
    const result = inspectJpeg(bytes);
    const elapsed = performance.now() - started;
    expect(result.ok).toBe(true);
    // Workers の CPU 時間（10 ms）の見込みは SPEC に書く。ここでは CI の揺れを見込んだ上限で確かめる。
    expect(elapsed).toBeLessThan(1000);
  });
});

describe('inspectJpeg の metadata の拒否（許可リスト）', () => {
  it('APP1（EXIF）を含むものを forbidden_segment で拒否する', () => {
    expect(inspectJpeg(buildJpeg({ extraSegments: [app1Exif()] }))).toMatchObject({
      ok: false,
      reason: 'forbidden_segment',
    });
  });

  it('APP1（XMP）を含むものを forbidden_segment で拒否する', () => {
    expect(inspectJpeg(buildJpeg({ extraSegments: [app1Xmp()] }))).toMatchObject({
      ok: false,
      reason: 'forbidden_segment',
    });
  });

  it('APP2（ICC）を含むものを forbidden_segment で拒否する', () => {
    expect(inspectJpeg(buildJpeg({ extraSegments: [app2Icc()] }))).toMatchObject({
      ok: false,
      reason: 'forbidden_segment',
    });
  });

  it('APP13（IPTC）を含むものを forbidden_segment で拒否する', () => {
    expect(inspectJpeg(buildJpeg({ extraSegments: [app13Iptc()] }))).toMatchObject({
      ok: false,
      reason: 'forbidden_segment',
    });
  });

  it('COM（コメント）を含むものを forbidden_segment で拒否する', () => {
    expect(inspectJpeg(buildJpeg({ extraSegments: [com('made by test')] }))).toMatchObject({
      ok: false,
      reason: 'forbidden_segment',
    });
  });

  it('許可リストにないフレームマーカー（SOF3）を forbidden_segment で拒否する', () => {
    const bytes = concatBytes(
      [...soi(), ...app0Jfif(), ...dqt(), ...sof(TEST_MARKER.SOF3, 100, 100), ...dht()],
      [...sos(), 0x12, ...eoi()],
    );
    expect(inspectJpeg(toBytes(bytes))).toMatchObject({ ok: false, reason: 'forbidden_segment' });
  });

  it('拒否の結果には、問題のあったバイト位置（offset）を含める', () => {
    const result = inspectJpeg(buildJpeg({ extraSegments: [app1Exif()] }));
    // SOI（2 バイト）と APP0（JFIF）の後ろに APP1 が来る。
    expect(result).toMatchObject({ ok: false, offset: 2 + app0Jfif().length });
  });
});

describe('inspectJpeg の末尾の余分なバイトの拒否', () => {
  it('EOI の後ろに 1 バイトあるものを trailing_bytes で拒否する', () => {
    expect(inspectJpeg(buildJpeg({ trailing: [0x00] }))).toMatchObject({
      ok: false,
      reason: 'trailing_bytes',
    });
  });

  it('EOI の後ろに ZIP の署名（PK）があるものを trailing_bytes で拒否する', () => {
    const zip = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00];
    expect(inspectJpeg(buildJpeg({ trailing: zip }))).toMatchObject({
      ok: false,
      reason: 'trailing_bytes',
    });
  });

  it('EOI の後ろに別の JPEG を付けたものを trailing_bytes で拒否する', () => {
    const second = buildJpeg({ width: 10, height: 10 });
    expect(inspectJpeg(buildJpeg({ trailing: Array.from(second) }))).toMatchObject({
      ok: false,
      reason: 'trailing_bytes',
    });
  });
});

describe('inspectJpeg の形式の拒否', () => {
  it('SVG（<svg で始まる）を svg で拒否する', () => {
    const svg = ascii('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
    expect(inspectJpeg(toBytes(svg))).toMatchObject({ ok: false, reason: 'svg' });
  });

  it('先頭に空白と改行がある SVG を svg で拒否する', () => {
    const svg = ascii('  \r\n\t<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(inspectJpeg(toBytes(svg))).toMatchObject({ ok: false, reason: 'svg' });
  });

  it('<?xml で始まる SVG を svg で拒否する', () => {
    const svg = ascii('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(inspectJpeg(toBytes(svg))).toMatchObject({ ok: false, reason: 'svg' });
  });

  it('PNG を not_jpeg で拒否する', () => {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d];
    expect(inspectJpeg(toBytes(png))).toMatchObject({ ok: false, reason: 'not_jpeg' });
  });

  it('空のバイト列を not_jpeg で拒否する', () => {
    expect(inspectJpeg(new Uint8Array(0))).toMatchObject({ ok: false, reason: 'not_jpeg' });
  });

  it('SOI（FF D8 FF）で始まらないテキストを not_jpeg で拒否する', () => {
    expect(inspectJpeg(toBytes(ascii('hello')))).toMatchObject({ ok: false, reason: 'not_jpeg' });
  });

  it('SOI の後ろが FF でない（FF D8 00）ものを not_jpeg で拒否する', () => {
    expect(inspectJpeg(toBytes([0xff, 0xd8, 0x00, 0x00]))).toMatchObject({
      ok: false,
      reason: 'not_jpeg',
    });
  });

  it('途中で切れた JPEG（圧縮データの途中）を truncated で拒否する', () => {
    const full = buildJpeg({ scan: largeScan(5000) });
    const cut = full.slice(0, full.length - 3000);
    expect(inspectJpeg(cut)).toMatchObject({ ok: false, reason: 'truncated' });
  });

  it('セグメントの長さが範囲外（途中で切れた DQT）を truncated で拒否する', () => {
    const cut = toBytes([...soi(), ...app0Jfif(), 0xff, 0xdb, 0x00, 0x43, 0x00]);
    expect(inspectJpeg(cut)).toMatchObject({ ok: false, reason: 'truncated' });
  });

  it('EOI が無いものを truncated で拒否する', () => {
    expect(inspectJpeg(buildJpeg({ withEoi: false }))).toMatchObject({
      ok: false,
      reason: 'truncated',
    });
  });

  it('SOF（フレーム）が無いものを missing_frame で拒否する', () => {
    expect(inspectJpeg(buildJpeg({ withFrame: false }))).toMatchObject({
      ok: false,
      reason: 'missing_frame',
    });
  });

  it('SOS（スキャン）が無いものを missing_scan で拒否する', () => {
    expect(inspectJpeg(buildJpeg({ withScan: false }))).toMatchObject({
      ok: false,
      reason: 'missing_scan',
    });
  });
});

describe('inspectJpeg の APP0 と SOI の検査', () => {
  const app0 = (payload: number[]): number[] => segment(TEST_MARKER.APP0, payload);
  const build = (app0Bytes: number[], extra: number[][] = []): Uint8Array =>
    toBytes(
      concatBytes(
        soi(),
        app0Bytes,
        ...extra,
        dqt(),
        sof(TEST_MARKER.SOF0, 320, 240),
        dht(),
        sos(),
        [0x12, 0x34],
        eoi(),
      ),
    );

  it('標準の JFIF の APP0（長さ 16、サムネイル 0x0）を合格にする', () => {
    expect(inspectJpeg(build(app0Jfif()))).toEqual({ ok: true, width: 320, height: 240, progressive: false });
  });

  it('JFXX の APP0 を拒否する', () => {
    const jfxx = app0([...ascii('JFXX\0'), 0x10, 0x00]);
    expect(inspectJpeg(build(app0Jfif(), [jfxx]))).toMatchObject({ ok: false, reason: 'forbidden_segment' });
  });

  it('APP0 が複数あるものを拒否する', () => {
    expect(inspectJpeg(build(app0Jfif(), [app0Jfif()]))).toMatchObject({ ok: false, reason: 'forbidden_segment' });
  });

  it('JFIF の識別子が違う APP0 を拒否する', () => {
    const bad = app0([...ascii('Exif\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
    expect(inspectJpeg(build(bad))).toMatchObject({ ok: false, reason: 'forbidden_segment' });
  });

  it('JFIF でも長さが 16 でない APP0（拡張データ付き）を拒否する', () => {
    const long = app0([...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xde, 0xad]);
    expect(inspectJpeg(build(long))).toMatchObject({ ok: false, reason: 'forbidden_segment' });
  });

  it('サムネイルの幅か高さが 0 でない APP0 を拒否する', () => {
    const thumb = app0([...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 1, 0]);
    expect(inspectJpeg(build(thumb))).toMatchObject({ ok: false, reason: 'forbidden_segment' });
    const thumbH = app0([...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 1]);
    expect(inspectJpeg(build(thumbH))).toMatchObject({ ok: false, reason: 'forbidden_segment' });
  });

  it('SOI の直後以外にある APP0 を拒否する', () => {
    const bytes = toBytes(
      concatBytes(soi(), dqt(), app0Jfif(), sof(TEST_MARKER.SOF0, 320, 240), dht(), sos(), [0x12], eoi()),
    );
    expect(inspectJpeg(bytes)).toMatchObject({ ok: false, reason: 'forbidden_segment' });
  });

  it('途中に現れる SOI を拒否する', () => {
    const bytes = toBytes(
      concatBytes(soi(), app0Jfif(), dqt(), soi(), sof(TEST_MARKER.SOF0, 320, 240), dht(), sos(), [0x12], eoi()),
    );
    expect(inspectJpeg(bytes)).toMatchObject({ ok: false, reason: 'malformed' });
  });
});

describe('inspectJpeg の入力の扱い', () => {
  it('ランダムなバイト列でも例外を投げず、合否の型を返す', () => {
    // 決まった種の擬似乱数で、再現できる入力にする。
    let seed = 12345;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed & 0xff;
    };
    for (let trial = 0; trial < 300; trial += 1) {
      const length = 1 + (next() % 200);
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = next();
      }
      if (trial % 2 === 0 && length >= 3) {
        bytes.set([0xff, 0xd8, 0xff], 0);
      }
      const result = inspectJpeg(bytes);
      expect(typeof result.ok).toBe('boolean');
    }
  });
});
