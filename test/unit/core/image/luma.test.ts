import { describe, expect, it } from 'vitest';
import { toGrayscale } from '../../../../src/core/image/grayscale';
import { meanLuma } from '../../../../src/core/image/luma';
import { ImageInputError } from '../../../../src/core/image/rgbaImage';
import { checkerboardImage, solidImage } from '../../../helpers/syntheticImage';

describe('meanLuma', () => {
  it('returns 0 for an all-black image', () => {
    expect(meanLuma(toGrayscale(solidImage(4, 4, [0, 0, 0])))).toBe(0);
  });

  it('returns 255 for an all-white image', () => {
    expect(meanLuma(toGrayscale(solidImage(4, 4, [255, 255, 255])))).toBe(255);
  });

  it('returns the average for a half black and half white image', () => {
    const gray = toGrayscale(checkerboardImage(4, 4, 2, [0, 0, 0], [255, 255, 255]));
    expect(meanLuma(gray)).toBeCloseTo(127.5, 6);
  });

  it('rejects a grayscale image whose data length does not match its size', () => {
    expect(() => meanLuma({ width: 2, height: 2, data: new Uint8Array(3) })).toThrow(
      ImageInputError,
    );
  });
});
