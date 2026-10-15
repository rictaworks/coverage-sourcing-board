import { describe, expect, it } from 'vitest';
import { toGrayscale } from '../../../../src/core/image/grayscale';
import { ImageInputError } from '../../../../src/core/image/rgbaImage';
import { solidImage } from '../../../helpers/syntheticImage';

describe('toGrayscale', () => {
  it('uses the ITU-R BT.601 weights for the primary colors', () => {
    // 0.299 x 255 = 76.2, 0.587 x 255 = 149.7, 0.114 x 255 = 29.1
    expect(toGrayscale(solidImage(1, 1, [255, 0, 0])).data[0]).toBe(76);
    expect(toGrayscale(solidImage(1, 1, [0, 255, 0])).data[0]).toBe(150);
    expect(toGrayscale(solidImage(1, 1, [0, 0, 255])).data[0]).toBe(29);
  });

  it('maps white to 255 and black to 0', () => {
    expect(toGrayscale(solidImage(2, 2, [255, 255, 255])).data.every((v) => v === 255)).toBe(true);
    expect(toGrayscale(solidImage(2, 2, [0, 0, 0])).data.every((v) => v === 0)).toBe(true);
  });

  it('keeps width and height and returns one value per pixel', () => {
    const gray = toGrayscale(solidImage(5, 3, [10, 20, 30]));
    expect(gray.width).toBe(5);
    expect(gray.height).toBe(3);
    expect(gray.data.length).toBe(15);
  });

  it('rejects data whose length does not match width x height x 4', () => {
    const broken = { width: 2, height: 2, data: new Uint8ClampedArray(15) };
    expect(() => toGrayscale(broken)).toThrow(ImageInputError);
  });

  it('rejects zero, negative, or non-integer dimensions', () => {
    const empty = { width: 0, height: 1, data: new Uint8ClampedArray(0) };
    const fraction = { width: 1.5, height: 1, data: new Uint8ClampedArray(6) };
    expect(() => toGrayscale(empty)).toThrow(ImageInputError);
    expect(() => toGrayscale(fraction)).toThrow(ImageInputError);
  });

  it('does not modify the input image', () => {
    const image = solidImage(2, 2, [200, 100, 50]);
    const before = Uint8ClampedArray.from(image.data);
    toGrayscale(image);
    expect(image.data).toEqual(before);
  });
});
