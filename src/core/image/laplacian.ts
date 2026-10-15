import { IMAGE_FEATURE_STRINGS } from '../../config/strings/image';
import type { GrayImage } from './grayscale';
import { assertDimensions, ImageInputError } from './rgbaImage';

/**
 * 3 × 3 のラプラシアン（中心 -4、上下左右 1）の応答の分散（母分散）を返します。
 * 画像の縮小は行いません。512 px への縮小は呼び出し側（D3）で行います。
 * 端の画素は応答を計算しません（内側の画素だけを使います）。
 */
export function laplacianVariance(gray: GrayImage): number {
  assertDimensions(gray.width, gray.height);
  if (gray.width < 3 || gray.height < 3) {
    throw new ImageInputError(IMAGE_FEATURE_STRINGS.laplacianTooSmall);
  }
  if (gray.data.length !== gray.width * gray.height) {
    throw new ImageInputError(IMAGE_FEATURE_STRINGS.dataLengthMismatch);
  }
  const { width, height, data } = gray;
  let count = 0;
  let sum = 0;
  let sumOfSquares = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const response =
        data[index - width] +
        data[index + width] +
        data[index - 1] +
        data[index + 1] -
        4 * data[index];
      count += 1;
      sum += response;
      sumOfSquares += response * response;
    }
  }
  const mean = sum / count;
  return sumOfSquares / count - mean * mean;
}
