/**
 * テスト用の EXIF（APP1）を組み立てる。実装（src/frontend/lib/image）は呼ばない。
 * 値はすべて架空のものです（実在の機種や位置を表さない）。バイト順は Motorola（MM）で作ります。
 */
import { segment, TEST_MARKER } from './jpegBytes';

const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

/** 撮影の情報。すべて省略できる。 */
export interface ExifFixtureOptions {
  /** 撮影日時（EXIF の書式 "YYYY:MM:DD HH:MM:SS"）。 */
  readonly dateTimeOriginal?: string;
  /** 時差（EXIF の書式 "+09:00"）。 */
  readonly offsetTimeOriginal?: string;
  /** 機種（メーカー）名。架空の値を使います。 */
  readonly make?: string;
  /** 機種名。架空の値を使います。 */
  readonly model?: string;
  /** GPS の緯度・経度（10 進数）。与えると GPS の IFD を作ります。 */
  readonly gps?: { readonly latitude: number; readonly longitude: number };
}

interface Entry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  /** 値のバイト列（ASCII は末尾の NUL を含む）。 */
  readonly bytes: number[];
}

function u16(value: number): number[] {
  return [(value >> 8) & 0xff, value & 0xff];
}

function u32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function asciiBytes(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0)).concat([0]);
}

/** 10 進数の度・分・秒を、EXIF の有理数 3 組（各 8 バイト）にする。分と秒は整数で作る。 */
function dmsRationals(value: number): number[] {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutesFull = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = Math.round((minutesFull - minutes) * 60 * 100);
  return [...u32(degrees), ...u32(1), ...u32(minutes), ...u32(1), ...u32(seconds), ...u32(100)];
}

/** IFD の大きさ（件数 2 + 各 12 バイト + 次の IFD のオフセット 4）。 */
function ifdSize(entryCount: number): number {
  return 2 + entryCount * 12 + 4;
}

/** IFD を書く。値が 4 バイトを超えるものは data の領域に置き、そのオフセットを書く。 */
function writeIfd(entries: readonly Entry[], dataStart: number, data: number[][]): number[] {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const out: number[] = [...u16(sorted.length)];
  for (const entry of sorted) {
    out.push(...u16(entry.tag), ...u16(entry.type), ...u32(entry.count));
    if (entry.bytes.length <= 4) {
      out.push(...entry.bytes, ...new Array<number>(4 - entry.bytes.length).fill(0));
    } else {
      // 値の領域は共有の配列に積む。オフセットは、そのときまでの領域の長さから求める。
      const offset = dataStart + data.reduce((sum, chunk) => sum + chunk.length, 0);
      out.push(...u32(offset));
      const padded = entry.bytes.length % 2 === 0 ? entry.bytes : [...entry.bytes, 0];
      data.push(padded);
    }
  }
  return out;
}

/**
 * TIFF の本体を組み立てる。IFD0 → Exif IFD → GPS IFD の順に並べ、その後ろに値の領域を置く。
 * 値の領域は呼び出しごとに新しい配列にするため、他の呼び出しに影響しない。
 */
function buildTiff(options: ExifFixtureOptions): number[] {
  const hasExif = options.dateTimeOriginal !== undefined || options.offsetTimeOriginal !== undefined;
  const hasGps = options.gps !== undefined;
  const ifd0Entries: Entry[] = [];
  if (options.make !== undefined) {
    const bytes = asciiBytes(options.make);
    ifd0Entries.push({ tag: 0x010f, type: TYPE_ASCII, count: bytes.length, bytes });
  }
  if (options.model !== undefined) {
    const bytes = asciiBytes(options.model);
    ifd0Entries.push({ tag: 0x0110, type: TYPE_ASCII, count: bytes.length, bytes });
  }
  // ポインタの値はオフセットが決まってから入れる。先に型だけ置く。
  const exifPointerIndex = ifd0Entries.length;
  if (hasExif) {
    ifd0Entries.push({ tag: 0x8769, type: TYPE_LONG, count: 1, bytes: [0, 0, 0, 0] });
  }
  const gpsPointerIndex = ifd0Entries.length;
  if (hasGps) {
    ifd0Entries.push({ tag: 0x8825, type: TYPE_LONG, count: 1, bytes: [0, 0, 0, 0] });
  }

  const exifEntries: Entry[] = [];
  if (options.dateTimeOriginal !== undefined) {
    const bytes = asciiBytes(options.dateTimeOriginal);
    exifEntries.push({ tag: 0x9003, type: TYPE_ASCII, count: bytes.length, bytes });
  }
  if (options.offsetTimeOriginal !== undefined) {
    const bytes = asciiBytes(options.offsetTimeOriginal);
    exifEntries.push({ tag: 0x9011, type: TYPE_ASCII, count: bytes.length, bytes });
  }

  const gpsEntries: Entry[] = [];
  if (options.gps !== undefined) {
    const { latitude, longitude } = options.gps;
    const latRef = latitude < 0 ? 'S' : 'N';
    const lngRef = longitude < 0 ? 'W' : 'E';
    gpsEntries.push({ tag: 0x0001, type: TYPE_ASCII, count: 2, bytes: asciiBytes(latRef) });
    gpsEntries.push({ tag: 0x0002, type: TYPE_RATIONAL, count: 3, bytes: dmsRationals(latitude) });
    gpsEntries.push({ tag: 0x0003, type: TYPE_ASCII, count: 2, bytes: asciiBytes(lngRef) });
    gpsEntries.push({ tag: 0x0004, type: TYPE_RATIONAL, count: 3, bytes: dmsRationals(longitude) });
  }

  const ifd0Offset = 8;
  const exifOffset = ifd0Offset + ifdSize(ifd0Entries.length);
  const gpsOffset = exifOffset + (hasExif ? ifdSize(exifEntries.length) : 0);
  const dataStart = gpsOffset + (hasGps ? ifdSize(gpsEntries.length) : 0);

  if (hasExif) {
    ifd0Entries[exifPointerIndex] = { tag: 0x8769, type: TYPE_LONG, count: 1, bytes: u32(exifOffset) };
  }
  if (hasGps) {
    ifd0Entries[gpsPointerIndex] = { tag: 0x8825, type: TYPE_LONG, count: 1, bytes: u32(gpsOffset) };
  }

  const data: number[][] = [];
  const ifd0 = writeIfd(ifd0Entries, dataStart, data);
  const exifIfd = hasExif ? writeIfd(exifEntries, dataStart, data) : [];
  const gpsIfd = hasGps ? writeIfd(gpsEntries, dataStart, data) : [];
  return [
    0x4d, 0x4d, 0x00, 0x2a, ...u32(ifd0Offset),
    ...ifd0, ...u32(0),
    ...exifIfd, ...(hasExif ? u32(0) : []),
    ...gpsIfd, ...(hasGps ? u32(0) : []),
    ...data.flat(),
  ];
}

/** EXIF の APP1 セグメント（FF E1 ...）を組み立てる。 */
export function buildExifApp1(options: ExifFixtureOptions): number[] {
  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  return segment(TEST_MARKER.APP1, [...header, ...buildTiff(options)]);
}

/**
 * JPEG の先頭の APP0 の直後に、セグメントを差し込む。
 * SOI と APP0 のある JPEG（Canvas の出力と同じ形）を前提にする。
 */
export function insertAfterApp0(jpeg: Uint8Array, segmentBytes: number[]): Uint8Array {
  const app0Length = (jpeg[4] << 8) | jpeg[5];
  const insertAt = 2 + 2 + app0Length;
  const head = Array.from(jpeg.subarray(0, insertAt));
  const tail = Array.from(jpeg.subarray(insertAt));
  return Uint8Array.from([...head, ...segmentBytes, ...tail]);
}
