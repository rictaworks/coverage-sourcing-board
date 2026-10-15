import { describe, expect, it } from 'vitest';
import { toGrayscale } from '../../../../src/core/image/grayscale';
import { dHash, hammingDistance } from '../../../../src/core/image/dhash';
import { ImageInputError } from '../../../../src/core/image/rgbaImage';
import {
  createRgbaImage,
  mirrorHorizontal,
  patternImage,
  shiftBrightness,
  solidImage,
} from '../../../helpers/syntheticImage';

describe('dHash', () => {
  it('returns 16 lowercase hexadecimal characters', () => {
    const hash = dHash(toGrayscale(patternImage(64, 48)));
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns the same hash for the same image (distance 0)', () => {
    const gray = toGrayscale(patternImage(64, 48));
    expect(hammingDistance(dHash(gray), dHash(gray))).toBe(0);
  });

  it('keeps the distance at 4 or less for a slightly brighter image', () => {
    const original = toGrayscale(patternImage(64, 48));
    const brighter = toGrayscale(shiftBrightness(patternImage(64, 48), 5));
    expect(hammingDistance(dHash(original), dHash(brighter))).toBeLessThanOrEqual(4);
  });

  it('gives a distance greater than 8 for a left-right mirrored image', () => {
    const original = toGrayscale(patternImage(64, 48));
    const mirrored = toGrayscale(mirrorHorizontal(patternImage(64, 48)));
    expect(hammingDistance(dHash(original), dHash(mirrored))).toBeGreaterThan(8);
  });

  it('sets a bit when the left cell is darker than the right cell', () => {
    // A brightness ramp that rises from left to right makes every horizontal comparison true.
    const ramp = toGrayscale(
      createRgbaImage(72, 48, (x) => {
        const value = x * 3;
        return [value, value, value];
      }),
    );
    expect(dHash(ramp)).toBe('ffffffffffffffff');
  });

  it('rejects a grayscale image whose data length does not match its size', () => {
    const broken = { width: 9, height: 8, data: new Uint8Array(10) };
    expect(() => dHash(broken)).toThrow(ImageInputError);
  });

  it('works on an image smaller than the 9 x 8 grid', () => {
    const hash = dHash(toGrayscale(solidImage(2, 2, [90, 90, 90])));
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance('0123456789abcdef', '0123456789abcdef')).toBe(0);
  });

  it('returns 64 for the all-zero and all-one hashes', () => {
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('counts one differing bit as 1', () => {
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
  });

  it('rejects a hash that is not 16 hexadecimal characters', () => {
    expect(() => hammingDistance('0000000000000000', '00000000')).toThrow(ImageInputError);
    expect(() => hammingDistance('000000000000000g', '0000000000000000')).toThrow(ImageInputError);
  });
});
