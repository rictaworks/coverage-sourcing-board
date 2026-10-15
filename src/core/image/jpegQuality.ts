/**
 * JPEG の量子化テーブル（DQT）から品質を推定します。外部に依存しない純粋な関数です。
 *
 * 推定の結果は型で区別します。JPEG でない、DQT が無い、構造が壊れている場合は例外ではなく
 * `status: 'unavailable'` と理由を返します。
 */
import { IMAGE_FEATURE_STRINGS } from '../../config/strings/image';
import { ImageInputError } from './rgbaImage';

/** 結果：推定できた場合は品質（1〜100）、推定できない場合は理由。 */
export type JpegQualityResult =
  | { readonly status: 'estimated'; readonly quality: number }
  | {
      readonly status: 'unavailable';
      readonly reason: 'not-jpeg' | 'no-quantization-table' | 'malformed';
    };

/** IJG（libjpeg）の標準の輝度テーブル（自然順、行優先）。ITU-T T.81 の附属書 K の表 K.1 です。 */
export const IJG_LUMINANCE_TABLE: readonly number[] = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

/** JPEG のジグザグ順（k 番目に読む要素の、自然順での位置）。 */
export const JPEG_ZIGZAG_ORDER: readonly number[] = buildZigzagOrder();

/** IJG の式で、基準のテーブルを品質に合わせて換算します。値は 1〜maxValue に収めます。 */
export function scaleQuantTable(
  base: readonly number[],
  quality: number,
  maxValue: number,
): number[] {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new ImageInputError(IMAGE_FEATURE_STRINGS.invalidQuality);
  }
  const scale = quality < 50 ? Math.floor(5000 / quality) : 200 - quality * 2;
  return base.map((value) => {
    const scaled = Math.floor((value * scale + 50) / 100);
    return Math.min(maxValue, Math.max(1, scaled));
  });
}

/** JPEG の品質（1〜100）を推定します。 */
export function estimateJpegQuality(bytes: Uint8Array): JpegQualityResult {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return { status: 'unavailable', reason: 'not-jpeg' };
  }
  const tables = readQuantTables(bytes);
  if (tables === 'malformed') {
    return { status: 'unavailable', reason: 'malformed' };
  }
  // 輝度のテーブル（ID 0）を優先します。無ければ最初のテーブルを使います。
  const table = tables.find((candidate) => candidate.id === 0) ?? tables[0];
  if (table === undefined) {
    return { status: 'unavailable', reason: 'no-quantization-table' };
  }
  return { status: 'estimated', quality: nearestQuality(table) };
}

/** DQT の 1 つのテーブルです。values は自然順です。 */
interface QuantTable {
  readonly id: number;
  readonly precision: 8 | 16;
  readonly values: readonly number[];
}

/** 品質 1〜100 のうち、テーブルとの差（絶対値の和）が最も小さいものを返します。 */
function nearestQuality(table: QuantTable): number {
  const maxValue = table.precision === 8 ? 255 : 65535;
  let bestQuality = 1;
  let bestError = Number.POSITIVE_INFINITY;
  for (let quality = 1; quality <= 100; quality += 1) {
    const expected = scaleQuantTable(IJG_LUMINANCE_TABLE, quality, maxValue);
    let error = 0;
    for (let i = 0; i < 64; i += 1) {
      error += Math.abs(expected[i] - table.values[i]);
    }
    if (error < bestError) {
      bestError = error;
      bestQuality = quality;
    }
  }
  return bestQuality;
}

/**
 * セグメントを順に読み、DQT のテーブルを集めます。SOS（画像データの開始）または EOI で止まります。
 * 構造が壊れている場合は 'malformed' を返します。
 */
function readQuantTables(bytes: Uint8Array): readonly QuantTable[] | 'malformed' {
  const tables: QuantTable[] = [];
  let pos = 2;
  while (true) {
    if (pos >= bytes.length || bytes[pos] !== 0xff) {
      return 'malformed';
    }
    // 直前のマーカーの後の余分な 0xFF（詰め物）を読み飛ばします。
    let markerPos = pos;
    while (markerPos < bytes.length && bytes[markerPos] === 0xff) {
      markerPos += 1;
    }
    if (markerPos >= bytes.length) {
      return 'malformed';
    }
    const marker = bytes[markerPos];
    pos = markerPos + 1;
    if (marker === 0xd9 || marker === 0xda) {
      // EOI（画像の終わり）または SOS（画像データの開始）。テーブルはここまでです。
      return tables;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      // 長さを持たないマーカーです。
      continue;
    }
    if (pos + 2 > bytes.length) {
      return 'malformed';
    }
    const segmentLength = (bytes[pos] << 8) | bytes[pos + 1];
    const segmentEnd = pos + segmentLength;
    if (segmentLength < 2 || segmentEnd > bytes.length) {
      return 'malformed';
    }
    if (marker === 0xdb) {
      const parsed = parseDqt(bytes, pos + 2, segmentEnd);
      if (parsed === 'malformed') {
        return 'malformed';
      }
      tables.push(...parsed);
    }
    pos = segmentEnd;
  }
}

/** DQT のセグメントの中身（start〜end）を読み、テーブルの一覧にします。 */
function parseDqt(bytes: Uint8Array, start: number, end: number): readonly QuantTable[] | 'malformed' {
  const tables: QuantTable[] = [];
  let pos = start;
  while (pos < end) {
    const precisionAndId = bytes[pos];
    const precisionCode = precisionAndId >> 4;
    const id = precisionAndId & 0x0f;
    if ((precisionCode !== 0 && precisionCode !== 1) || id > 3) {
      return 'malformed';
    }
    const precision = precisionCode === 0 ? 8 : 16;
    const bytesPerValue = precision / 8;
    const tableEnd = pos + 1 + 64 * bytesPerValue;
    if (tableEnd > end) {
      return 'malformed';
    }
    const natural = new Array<number>(64);
    for (let k = 0; k < 64; k += 1) {
      const offset = pos + 1 + k * bytesPerValue;
      const value = bytesPerValue === 1 ? bytes[offset] : (bytes[offset] << 8) | bytes[offset + 1];
      if (value === 0) {
        return 'malformed';
      }
      natural[JPEG_ZIGZAG_ORDER[k]] = value;
    }
    tables.push({ id, precision, values: natural });
    pos = tableEnd;
  }
  return tables;
}

/** 8 × 8 のジグザグ順を作ります（JPEG 規格の走査順）。 */
function buildZigzagOrder(): readonly number[] {
  const order: number[] = [];
  for (let sum = 0; sum <= 14; sum += 1) {
    const cells: number[] = [];
    for (let row = 0; row < 8; row += 1) {
      const col = sum - row;
      if (col >= 0 && col < 8) {
        cells.push(row * 8 + col);
      }
    }
    // 偶数の対角線は右上から左下へ、奇数の対角線は左下から右上へ進みます。
    if (sum % 2 === 0) {
      cells.reverse();
    }
    order.push(...cells);
  }
  return order;
}
