import { IMAGE_FEATURE_STRINGS } from '../../config/strings/image';
import type { GrayImage } from './grayscale';
import { assertDimensions, ImageInputError } from './rgbaImage';

/** グレースケールの平均輝度（0〜255）を返します。 */
export function meanLuma(gray: GrayImage): number {
  assertDimensions(gray.width, gray.height);
  if (gray.data.length !== gray.width * gray.height) {
    throw new ImageInputError(IMAGE_FEATURE_STRINGS.dataLengthMismatch);
  }
  let sum = 0;
  for (let i = 0; i < gray.data.length; i += 1) {
    sum += gray.data[i];
  }
  return sum / gray.data.length;
}
