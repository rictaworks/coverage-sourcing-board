import { describe, expect, it } from 'vitest';
import { FeatureExtractor } from '../../../../src/frontend/lib/image/featureExtractor';
import { checkerboardImage, solidImage } from '../../../helpers/syntheticImage';
import { dHash } from '../../../../src/core/image/dhash';
import { toGrayscale } from '../../../../src/core/image/grayscale';
import { laplacianVariance } from '../../../../src/core/image/laplacian';
import { meanLuma } from '../../../../src/core/image/luma';
import { colorStats } from '../../../../src/core/image/colorStats';

const extractor = new FeatureExtractor();

describe('FeatureExtractor（特徴量。B2 の関数を呼びます）', () => {
  it('B2 の関数と同じ値を、ImageFeatures にまとめます', () => {
    const image = checkerboardImage(512, 384, 16, [200, 80, 40], [30, 120, 220]);
    const features = extractor.extract(image, { width: 1600, height: 1200, format: 'jpeg', quality: 88 });
    const gray = toGrayscale(image);
    const stats = colorStats(image);
    expect(features.width).toBe(1600);
    expect(features.height).toBe(1200);
    expect(features.format).toBe('jpeg');
    expect(features.quality).toBe(88);
    expect(features.blurScore).toBeCloseTo(laplacianVariance(gray), 10);
    expect(features.meanLuma).toBeCloseTo(meanLuma(gray), 10);
    expect(features.phash).toBe(dHash(gray));
    expect(features.saturation).toBeCloseTo(stats.meanSaturation, 10);
    expect(features.contrast).toBeCloseTo(stats.lumaStdDev / 255, 10);
  });

  it('PNG の入力では、JPEG の品質を持ちません（quality を省きます）', () => {
    const features = extractor.extract(solidImage(64, 48, [10, 10, 10]), { width: 64, height: 48, format: 'png' });
    expect(features).not.toHaveProperty('quality');
    expect(features.format).toBe('png');
  });

  it('一様な画像は、ピントの値が 0 で、コントラストが 0 です', () => {
    const features = extractor.extract(solidImage(40, 30, [120, 120, 120]), { width: 40, height: 30, format: 'png' });
    expect(features.blurScore).toBe(0);
    expect(features.contrast).toBe(0);
    expect(features.saturation).toBe(0);
  });

  it('画素の配列が寸法と合わないときは、B2 の例外をそのまま投げます', () => {
    const broken = { width: 4, height: 4, data: new Uint8ClampedArray(10) };
    expect(() => extractor.extract(broken, { width: 4, height: 4, format: 'png' })).toThrow();
  });
});
