import { bt601Luma } from './grayscale';
import { type RgbaImage, assertRgbaImage } from './rgbaImage';

/** 色の統計です。 */
export interface ColorStats {
  /** 平均彩度（HSV の S の画素ごとの平均。0〜1） */
  readonly meanSaturation: number;
  /** 輝度の標準偏差（母標準偏差。0〜255。コントラストの指標） */
  readonly lumaStdDev: number;
}

/**
 * RGBA の画像の平均彩度と、輝度の標準偏差を返します。アルファは使いません。入力は書き換えません。
 */
export function colorStats(image: RgbaImage): ColorStats {
  assertRgbaImage(image);
  const pixelCount = image.width * image.height;
  let saturationSum = 0;
  let lumaSum = 0;
  for (let p = 0; p < pixelCount; p += 1) {
    const offset = p * 4;
    const red = image.data[offset];
    const green = image.data[offset + 1];
    const blue = image.data[offset + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    saturationSum += max === 0 ? 0 : (max - min) / max;
    lumaSum += bt601Luma(red, green, blue);
  }
  // 誤差を抑えるため、平均を求めてから偏差の二乗の和を取ります（2 パス）。
  const meanLumaValue = lumaSum / pixelCount;
  let squaredDeviationSum = 0;
  for (let p = 0; p < pixelCount; p += 1) {
    const offset = p * 4;
    const deviation =
      bt601Luma(image.data[offset], image.data[offset + 1], image.data[offset + 2]) -
      meanLumaValue;
    squaredDeviationSum += deviation * deviation;
  }
  return {
    meanSaturation: saturationSum / pixelCount,
    lumaStdDev: Math.sqrt(squaredDeviationSum / pixelCount),
  };
}
