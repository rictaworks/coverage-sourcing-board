import { IMAGE_FEATURE_DEFAULTS } from '../../config/image';
import { IMAGE_FEATURE_STRINGS } from '../../config/strings/image';
import type { GrayImage } from './grayscale';
import { assertDimensions, ImageInputError } from './rgbaImage';

const HASH_PATTERN = /^[0-9a-fA-F]{16}$/;

/**
 * 差分ハッシュ（dHash）を 16 文字の 16 進の文字列で返します。
 * 面積平均で 9 × 8 に縮小し、各行で左の格子が右より暗ければ 1 とします（8 行 × 8 列 = 64 ビット）。
 */
export function dHash(gray: GrayImage): string {
  assertDimensions(gray.width, gray.height);
  if (gray.data.length !== gray.width * gray.height) {
    throw new ImageInputError(IMAGE_FEATURE_STRINGS.dataLengthMismatch);
  }
  const { width: gridWidth, height: gridHeight } = IMAGE_FEATURE_DEFAULTS.dHashGrid;
  const cells = shrinkToGrid(gray, gridWidth, gridHeight);
  let bits = '';
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth - 1; x += 1) {
      const left = cells[y * gridWidth + x];
      const right = cells[y * gridWidth + x + 1];
      bits += left < right ? '1' : '0';
    }
  }
  return bitsToHex(bits);
}

/** 2 つのハッシュのハミング距離（0〜64）を返します。形式が不正なら例外にします。 */
export function hammingDistance(a: string, b: string): number {
  const left = hexToBits(a);
  const right = hexToBits(b);
  let distance = 0;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      distance += 1;
    }
  }
  return distance;
}

/** 面積平均で、画像を cols × rows の格子に縮小します。各セルの値は 0〜255 の実数です。 */
function shrinkToGrid(gray: GrayImage, cols: number, rows: number): number[] {
  const cells: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    const y0 = Math.floor((row * gray.height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * gray.height) / rows));
    for (let col = 0; col < cols; col += 1) {
      const x0 = Math.floor((col * gray.width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * gray.width) / cols));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < gray.height; y += 1) {
        for (let x = x0; x < x1 && x < gray.width; x += 1) {
          sum += gray.data[y * gray.width + x];
          count += 1;
        }
      }
      cells.push(sum / count);
    }
  }
  return cells;
}

/** 0 と 1 の並びを 4 ビットずつ 16 進に変えます。 */
function bitsToHex(bits: string): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/** 16 文字の 16 進を、64 ビットの 0 と 1 の並びに変えます。形式が不正なら例外にします。 */
function hexToBits(hash: string): string {
  if (!HASH_PATTERN.test(hash)) {
    throw new ImageInputError(IMAGE_FEATURE_STRINGS.invalidHash);
  }
  let bits = '';
  for (const digit of hash) {
    bits += Number.parseInt(digit, 16).toString(2).padStart(4, '0');
  }
  return bits;
}
