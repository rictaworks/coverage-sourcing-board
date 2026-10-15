import { describe, expect, it } from 'vitest';
import { colorStats } from '../../../../src/core/image/colorStats';
import { ImageInputError } from '../../../../src/core/image/rgbaImage';
import { checkerboardImage, solidImage } from '../../../helpers/syntheticImage';

describe('colorStats', () => {
  it('returns saturation 0 for a gray image', () => {
    const stats = colorStats(solidImage(8, 8, [128, 128, 128]));
    expect(stats.meanSaturation).toBe(0);
    expect(stats.lumaStdDev).toBe(0);
  });

  it.each([
    ['red', [255, 0, 0]],
    ['green', [0, 255, 0]],
    ['blue', [0, 0, 255]],
  ] as const)('returns saturation 1 for pure %s', (_name, color) => {
    expect(colorStats(solidImage(8, 8, [...color])).meanSaturation).toBeCloseTo(1, 6);
  });

  it('returns the population standard deviation of luma for a black and white checkerboard', () => {
    const stats = colorStats(checkerboardImage(8, 8, 4, [0, 0, 0], [255, 255, 255]));
    expect(stats.meanSaturation).toBe(0);
    expect(stats.lumaStdDev).toBeCloseTo(127.5, 6);
  });

  it('rejects an image whose data length does not match its size', () => {
    const broken = { width: 2, height: 2, data: new Uint8ClampedArray(15) };
    expect(() => colorStats(broken)).toThrow(ImageInputError);
  });

  it('does not modify the input', () => {
    const image = solidImage(2, 2, [200, 100, 50]);
    const before = Uint8ClampedArray.from(image.data);
    colorStats(image);
    expect(image.data).toEqual(before);
  });
});
