/**
 * テスト用に JPEG のバイト列をセグメント単位で組み立てる。
 * 実装（src/core/jpeg）は呼ばない。検査の対象を、仕様どおりのバイト列として作るためだけに使う。
 */

/** マーカーの符号（テストで使うもの）。 */
export const TEST_MARKER = {
  SOI: 0xd8,
  EOI: 0xd9,
  SOF0: 0xc0,
  SOF2: 0xc2,
  SOF3: 0xc3,
  DHT: 0xc4,
  DQT: 0xdb,
  SOS: 0xda,
  APP0: 0xe0,
  APP1: 0xe1,
  APP2: 0xe2,
  APP13: 0xed,
  COM: 0xfe,
} as const;

/** 文字列を ASCII のバイト列にする。 */
export function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

/** 複数の配列を 1 つにつなぐ。 */
export function concatBytes(...parts: number[][]): number[] {
  return parts.flat();
}

/** マーカー（FF xx）と長さ（2 バイト、長さ自身を含む）と本体からセグメントを作る。 */
export function segment(code: number, payload: number[] = []): number[] {
  const length = payload.length + 2;
  return [0xff, code, (length >> 8) & 0xff, length & 0xff, ...payload];
}

/** SOI（FF D8）。 */
export function soi(): number[] {
  return [0xff, TEST_MARKER.SOI];
}

/** EOI（FF D9）。 */
export function eoi(): number[] {
  return [0xff, TEST_MARKER.EOI];
}

/** RST マーカー（FF D0〜D7）。n は 0〜7。 */
export function rst(n: number): number[] {
  return [0xff, 0xd0 + n];
}

/** JFIF の APP0。 */
export function app0Jfif(): number[] {
  return segment(TEST_MARKER.APP0, ascii('JFIF\0').concat([1, 1, 0, 0, 1, 0, 1, 0, 0]));
}

/** EXIF の APP1。 */
export function app1Exif(): number[] {
  return segment(TEST_MARKER.APP1, ascii('Exif\0\0').concat([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]));
}

/** XMP の APP1。 */
export function app1Xmp(): number[] {
  return segment(TEST_MARKER.APP1, ascii('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'));
}

/** ICC プロファイルの APP2。 */
export function app2Icc(): number[] {
  return segment(TEST_MARKER.APP2, ascii('ICC_PROFILE\0').concat([1, 1, 0, 0, 0, 0]));
}

/** IPTC（Photoshop 3.0）の APP13。 */
export function app13Iptc(): number[] {
  return segment(TEST_MARKER.APP13, ascii('Photoshop 3.0\0'));
}

/** COM（コメント）セグメント。 */
export function com(text: string): number[] {
  return segment(TEST_MARKER.COM, ascii(text));
}

/** 量子化テーブル（DQT）。 */
export function dqt(): number[] {
  return segment(TEST_MARKER.DQT, [0x00].concat(new Array<number>(64).fill(1)));
}

/** ハフマン表（DHT）。シンボルの無い最小の表。 */
export function dht(): number[] {
  return segment(TEST_MARKER.DHT, [0x00].concat(new Array<number>(16).fill(0)));
}

/** フレームのヘッダ（SOF0 または SOF2）。幅と高さは SOF から読まれる値。 */
export function sof(code: number, width: number, height: number): number[] {
  return segment(code, [
    8,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    3,
    1, 0x22, 0,
    2, 0x11, 1,
    3, 0x11, 1,
  ]);
}

/** スキャンのヘッダ（SOS）。 */
export function sos(): number[] {
  return segment(TEST_MARKER.SOS, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
}

/** 圧縮データの最小の例（FF 00 を含む）。 */
export function defaultScan(): number[] {
  return [0x12, 0x34, 0xff, 0x00, 0x56, 0x78, 0x9a, 0xbc];
}

export interface JpegOptions {
  /** 幅（既定 1600）。 */
  width?: number;
  /** 高さ（既定 1200）。 */
  height?: number;
  /** true なら SOF2（プログレッシブ）にする。 */
  progressive?: boolean;
  /** APP0 の後、DQT の前に入れる追加のセグメント。 */
  extraSegments?: number[][];
  /** SOS の後の圧縮データ。 */
  scan?: number[];
  /** EOI の後ろに付けるバイト列。 */
  trailing?: number[];
  /** false なら EOI を付けない（既定は付ける）。 */
  withEoi?: boolean;
  /** false なら SOF を付けない（既定は付ける）。 */
  withFrame?: boolean;
  /** false なら SOS と圧縮データを付けない（既定は付ける）。 */
  withScan?: boolean;
}

/** 最小の妥当な JPEG のバイト列を組み立てる。options で壊し方を指定できる。 */
export function buildJpeg(options: JpegOptions = {}): Uint8Array {
  const withFrame = options.withFrame ?? true;
  const withScan = options.withScan ?? true;
  const withEoi = options.withEoi ?? true;
  const frameCode = options.progressive ? TEST_MARKER.SOF2 : TEST_MARKER.SOF0;

  const parts: number[][] = [soi(), app0Jfif()];
  for (const extra of options.extraSegments ?? []) {
    parts.push(extra);
  }
  parts.push(dqt());
  if (withFrame) {
    parts.push(sof(frameCode, options.width ?? 1600, options.height ?? 1200));
  }
  parts.push(dht());
  if (withScan) {
    parts.push(sos(), options.scan ?? defaultScan());
  }
  if (withEoi) {
    parts.push(eoi());
  }
  parts.push(options.trailing ?? []);
  return toBytes(concatBytes(...parts));
}

/** number[] を Uint8Array にする。 */
export function toBytes(values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

/**
 * 指定した長さの圧縮データを作る。FF 00 と RST を混ぜ、マーカーとして誤認しやすい形にする。
 * 本体のバイトは FF で始まらないもの（0x12）を基本にする。
 */
export function largeScan(length: number): number[] {
  const out: number[] = [];
  let rstIndex = 0;
  while (out.length < length) {
    const room = length - out.length;
    if (out.length % 1000 === 999 && room >= 2) {
      out.push(0xff, 0x00);
    } else if (out.length % 5000 === 4999 && room >= 2) {
      out.push(...rst(rstIndex % 8));
      rstIndex += 1;
    } else {
      out.push(0x12);
    }
  }
  return out;
}
