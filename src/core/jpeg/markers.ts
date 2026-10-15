/**
 * JPEG のマーカーの符号と、許可リスト。外部に依存しない定数だけを置く。
 * 許可リストの方式（CLAUDE.md 8）：ここに無いマーカーは、すべて拒否する。
 */

/** マーカーの符号（第 2 バイト）。 */
export const MARKER = {
  /** 画像の開始。 */
  SOI: 0xd8,
  /** 画像の終了。 */
  EOI: 0xd9,
  /** ベースラインのフレーム（幅と高さを持つ）。 */
  SOF0: 0xc0,
  /** 拡張（ハフマン）のフレーム。 */
  SOF1: 0xc1,
  /** プログレッシブのフレーム。 */
  SOF2: 0xc2,
  /** ハフマン表。 */
  DHT: 0xc4,
  /** 量子化テーブル。 */
  DQT: 0xdb,
  /** 再開間隔（DRI）。 */
  DRI: 0xdd,
  /** スキャンの開始。圧縮データが続く。 */
  SOS: 0xda,
  /** JFIF の APP0。Canvas が出す標準の付加情報で、EXIF を含まない。 */
  APP0: 0xe0,
  /** RST0。リスタートの区切り（圧縮データの中）。 */
  RST0: 0xd0,
  /** RST7。リスタートの区切り（圧縮データの中）。 */
  RST7: 0xd7,
} as const;

/**
 * 許可するマーカー。
 * SOI・APP0（JFIF）・DQT・SOF0〜SOF2・DHT・DRI・SOS・RST0〜RST7・EOI だけを許す。
 * APP1（EXIF・XMP）、APP2〜APP15（IPTC を含む）、COM は、位置情報や機種情報を運ぶおそれがあるため許可しない。
 */
export const ALLOWED_MARKERS: ReadonlySet<number> = new Set<number>([
  MARKER.SOI,
  MARKER.APP0,
  MARKER.DQT,
  MARKER.SOF0,
  MARKER.SOF1,
  MARKER.SOF2,
  MARKER.DHT,
  MARKER.DRI,
  MARKER.SOS,
  ...rstMarkers(),
  MARKER.EOI,
]);

/** フレームのマーカー（幅と高さを SOF から読む）。 */
export const FRAME_MARKERS: ReadonlySet<number> = new Set<number>([MARKER.SOF0, MARKER.SOF1, MARKER.SOF2]);

/** 長さを持たないマーカー（SOI・EOI・RST）。これ以外は、2 バイトの長さを持つ。 */
export function isStandaloneMarker(code: number): boolean {
  return code === MARKER.SOI || code === MARKER.EOI || isRstMarker(code);
}

/** RST0〜RST7 のいずれか。 */
export function isRstMarker(code: number): boolean {
  return code >= MARKER.RST0 && code <= MARKER.RST7;
}

function rstMarkers(): number[] {
  const codes: number[] = [];
  for (let code = MARKER.RST0; code <= MARKER.RST7; code += 1) {
    codes.push(code);
  }
  return codes;
}
