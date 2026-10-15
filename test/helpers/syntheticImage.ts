import type { RgbaImage } from '../../src/core/image/rgbaImage';

/** RGB の 3 つの値（0〜255）。 */
export type Rgb = readonly [number, number, number];

/** 画素ごとに色を決めて、RGBA の画像を作ります（alpha は 255）。 */
export function createRgbaImage(
  width: number,
  height: number,
  colorAt: (x: number, y: number) => Rgb,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = colorAt(x, y);
      const index = (y * width + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 全面が同じ色の画像です。 */
export function solidImage(width: number, height: number, color: Rgb): RgbaImage {
  return createRgbaImage(width, height, () => color);
}

/** 正方形のマスを交互に塗った市松模様です。cellSize はマスの一辺（px）です。 */
export function checkerboardImage(
  width: number,
  height: number,
  cellSize: number,
  first: Rgb,
  second: Rgb,
): RgbaImage {
  return createRgbaImage(width, height, (x, y) =>
    (Math.floor(x / cellSize) + Math.floor(y / cellSize)) % 2 === 0 ? first : second,
  );
}

/** 位置から決定的に決まる模様です。値は 0〜200 の範囲に収めます（明るさを +5 しても飽和しません）。 */
export function patternImage(width: number, height: number): RgbaImage {
  return createRgbaImage(width, height, (x, y) => {
    const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    const value = hash % 201;
    return [value, (value * 7) % 201, (value * 13) % 201];
  });
}

/** 指定した画素の色を返します。 */
export function pixelAt(image: RgbaImage, x: number, y: number): Rgb {
  const index = (y * image.width + x) * 4;
  return [image.data[index], image.data[index + 1], image.data[index + 2]];
}

/** 左右を反転した画像です。 */
export function mirrorHorizontal(image: RgbaImage): RgbaImage {
  return createRgbaImage(image.width, image.height, (x, y) =>
    pixelAt(image, image.width - 1 - x, y),
  );
}

/** 各チャンネルに delta を足した画像です（0〜255 に収めます）。 */
export function shiftBrightness(image: RgbaImage, delta: number): RgbaImage {
  const clamp = (value: number): number => Math.min(255, Math.max(0, value));
  return createRgbaImage(image.width, image.height, (x, y) => {
    const [r, g, b] = pixelAt(image, x, y);
    return [clamp(r + delta), clamp(g + delta), clamp(b + delta)];
  });
}

/** 半径 radius の正方形の範囲で平均を取る、ぼかしの画像です（端は範囲内の画素だけで平均します）。 */
export function boxBlur(image: RgbaImage, radius: number): RgbaImage {
  return createRgbaImage(image.width, image.height, (x, y) => {
    const sums = [0, 0, 0];
    let count = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
          continue;
        }
        const [r, g, b] = pixelAt(image, nx, ny);
        sums[0] += r;
        sums[1] += g;
        sums[2] += b;
        count += 1;
      }
    }
    return [
      Math.round(sums[0] / count),
      Math.round(sums[1] / count),
      Math.round(sums[2] / count),
    ];
  });
}
