import { describe, expect, it } from 'vitest';
import { toGrayscale } from '../../../../src/core/image/grayscale';
import { laplacianVariance } from '../../../../src/core/image/laplacian';
import { ImageInputError } from '../../../../src/core/image/rgbaImage';
import { boxBlur, checkerboardImage, solidImage } from '../../../helpers/syntheticImage';

describe('laplacianVariance', () => {
  it('returns 0 for a uniform image', () => {
    const gray = toGrayscale(solidImage(16, 16, [128, 128, 128]));
    expect(laplacianVariance(gray)).toBe(0);
  });

  it('returns a large value for a sharp black and white checkerboard', () => {
    const gray = toGrayscale(checkerboardImage(32, 32, 1, [0, 0, 0], [255, 255, 255]));
    expect(laplacianVariance(gray)).toBeGreaterThan(100_000);
  });

  it('returns a smaller value for a blurred checkerboard than for the sharp one', () => {
    const sharp = toGrayscale(checkerboardImage(32, 32, 1, [0, 0, 0], [255, 255, 255]));
    const blurred = toGrayscale(
      boxBlur(checkerboardImage(32, 32, 1, [0, 0, 0], [255, 255, 255]), 2),
    );
    expect(laplacianVariance(blurred)).toBeLessThan(laplacianVariance(sharp));
  });

  it('rejects an image smaller than 3 x 3', () => {
    const gray = toGrayscale(solidImage(2, 2, [0, 0, 0]));
    expect(() => laplacianVariance(gray)).toThrow(ImageInputError);
  });

  it('does not modify the input', () => {
    const gray = toGrayscale(checkerboardImage(8, 8, 1, [0, 0, 0], [255, 255, 255]));
    const before = Uint8Array.from(gray.data);
    laplacianVariance(gray);
    expect(gray.data).toEqual(before);
  });

  it('never returns a negative variance because of rounding errors', () => {
    const width = 40;
    const height = 40;
    const data = new Uint8Array(width * height).fill(137);
    data[5 * width + 5] = 138;
    const value = laplacianVariance({ width, height, data });
    expect(value).toBeGreaterThanOrEqual(0);
  });
});
