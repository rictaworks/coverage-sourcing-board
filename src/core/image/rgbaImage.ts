import { IMAGE_FEATURE_STRINGS } from '../../config/strings/image';

/**
 * 画素の配列（RGBA、1 画素 4 バイト、行優先）。ブラウザの ImageData と同じ構造です。
 */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

/** 画像の入力が不正なときの例外です。 */
export class ImageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageInputError';
  }
}

/** 幅と高さが 1 以上の整数であることを確かめます。 */
export function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new ImageInputError(IMAGE_FEATURE_STRINGS.invalidDimensions);
  }
}

/** RGBA の画像が、幅と高さに合う長さのデータを持つことを確かめます。 */
export function assertRgbaImage(image: RgbaImage): void {
  assertDimensions(image.width, image.height);
  if (image.data.length !== image.width * image.height * 4) {
    throw new ImageInputError(IMAGE_FEATURE_STRINGS.dataLengthMismatch);
  }
}
