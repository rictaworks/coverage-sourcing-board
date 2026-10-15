import { type RgbaImage, assertRgbaImage } from './rgbaImage';

/** 1 画素 1 バイト（0〜255）の輝度の画像です。 */
export interface GrayImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** ITU-R BT.601 の係数による輝度（0〜255 の実数）です。アルファは使いません。 */
export function bt601Luma(red: number, green: number, blue: number): number {
  return 0.299 * red + 0.587 * green + 0.114 * blue;
}

/** RGBA の画像を、BT.601 の輝度のグレースケールにします。入力は書き換えません。 */
export function toGrayscale(image: RgbaImage): GrayImage {
  assertRgbaImage(image);
  const pixelCount = image.width * image.height;
  const data = new Uint8Array(pixelCount);
  for (let p = 0; p < pixelCount; p += 1) {
    const offset = p * 4;
    const luma = bt601Luma(image.data[offset], image.data[offset + 1], image.data[offset + 2]);
    data[p] = Math.round(luma);
  }
  return { width: image.width, height: image.height, data };
}
