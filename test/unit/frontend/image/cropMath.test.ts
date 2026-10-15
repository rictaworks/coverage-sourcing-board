import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  cropRectAt,
  positionFromPointer,
  requiresCrop,
  type CropRect,
} from '../../../../src/frontend/lib/image/cropMath';

/** 枠が画像の中に収まり、比率が 4:3（±1%）になることを確かめる。 */
function expectInsideAndRatio(rect: CropRect, width: number, height: number): void {
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(width);
  expect(rect.y + rect.height).toBeLessThanOrEqual(height);
  const ratio = rect.width / rect.height;
  expect(Math.abs(ratio - 4 / 3) / (4 / 3)).toBeLessThanOrEqual(0.01);
}

describe('cropMath（トリミング枠の計算、純粋な関数）', () => {
  it('4:3（±1%）の画像は、トリミングを必要としません', () => {
    expect(requiresCrop(1600, 1200)).toBe(false);
    expect(requiresCrop(1608, 1200)).toBe(false);
    expect(requiresCrop(1200, 900)).toBe(false);
  });

  it('比率が許容の外なら、トリミングを必要とします', () => {
    expect(requiresCrop(1500, 1000)).toBe(true);
    expect(requiresCrop(1920, 1080)).toBe(true);
    expect(requiresCrop(1000, 1000)).toBe(true);
  });

  it('3:2 の画像では、中央（位置 0.5）の 4:3 の枠を横に決めます', () => {
    const rect = cropRectAt(1500, 1000, 0.5);
    expect(rect).toEqual({ x: 84, y: 0, width: 1333, height: 1000 });
    expectInsideAndRatio(rect, 1500, 1000);
  });

  it('16:9 の画像では、中央の 4:3 の枠を決めます（上下は全部）', () => {
    const rect = cropRectAt(1920, 1080, 0.5);
    expect(rect.y).toBe(0);
    expect(rect.height).toBe(1080);
    expect(rect.width).toBe(1440);
    expect(rect.x).toBe(240);
    expectInsideAndRatio(rect, 1920, 1080);
  });

  it('1:1 の画像では、縦方向の 4:3 の枠を中央に決めます（横の幅は全部）', () => {
    const rect = cropRectAt(1000, 1000, 0.5);
    expect(rect.x).toBe(0);
    expect(rect.width).toBe(1000);
    expect(rect.height).toBe(750);
    expect(rect.y).toBe(125);
    expectInsideAndRatio(rect, 1000, 1000);
  });

  it('位置を 0 と 1 にすると、枠は左端と右端に寄ります', () => {
    expect(cropRectAt(1500, 1000, 0).x).toBe(0);
    expect(cropRectAt(1500, 1000, 1).x).toBe(1500 - 1333);
  });

  it('範囲の外の位置は、画像の中に収まるように丸めます（枠は画像の外に出ません）', () => {
    expectInsideAndRatio(cropRectAt(1500, 1000, -3), 1500, 1000);
    expectInsideAndRatio(cropRectAt(1500, 1000, 7), 1500, 1000);
    expect(clampPosition(-3)).toBe(0);
    expect(clampPosition(7)).toBe(1);
  });

  it('トリミングが不要な画像では、枠は画像の全体になります', () => {
    expect(cropRectAt(1600, 1200, 0.2)).toEqual({ x: 0, y: 0, width: 1600, height: 1200 });
  });

  it('ポインターの x から、枠の位置（0〜1）を求めます（枠の幅を考慮します）', () => {
    // 表示の幅 300、枠の幅 200 のとき、枠の中心の x を 100 から 200 まで動かせる（x はポインターの位置）。
    expect(positionFromPointer(0, 300, 200)).toBe(0);
    expect(positionFromPointer(150, 300, 200)).toBe(0.5);
    expect(positionFromPointer(300, 300, 200)).toBe(1);
    expect(positionFromPointer(-40, 300, 200)).toBe(0);
  });
});
