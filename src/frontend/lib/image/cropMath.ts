import { RULE_DEFAULTS } from '../../../config/defaults';

/** トリミング枠（画像の画素の座標、整数）。 */
export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 4:3 の比率（幅 ÷ 高さ）。 */
const TARGET_RATIO = RULE_DEFAULTS.aspectRatio.width / RULE_DEFAULTS.aspectRatio.height;

/** 枠の位置の範囲（0 が左端・上端、1 が右端・下端）。 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 比率が 4:3 の許容（±1%）の外なら true です。画像の向きは判定しません（横向きの判定は別に行います）。 */
export function requiresCrop(width: number, height: number): boolean {
  const ratio = width / height;
  return Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO > RULE_DEFAULTS.aspectTolerance;
}

/** 位置の値を 0〜1 に丸めます（範囲の外の値は端に寄せます）。 */
export function clampPosition(position: number): number {
  return clamp01(position);
}

/**
 * 枠の位置（0〜1）から、トリミング枠を求めます。
 * 比率が幅の広い画像（3:2 など）は、横方向に枠を動かします。比率が 4:3 より縦長の横向き（5:4 など）は、縦方向に動かします。
 * トリミングが不要な画像では、画像の全体を枠にします。
 */
export function cropRectAt(width: number, height: number, position: number): CropRect {
  if (!requiresCrop(width, height)) {
    return { x: 0, y: 0, width, height };
  }
  const place = clamp01(position);
  if (width / height > TARGET_RATIO) {
    const cropWidth = Math.min(width, Math.round(height * TARGET_RATIO));
    return { x: Math.round((width - cropWidth) * place), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.min(height, Math.round(width / TARGET_RATIO));
  return { x: 0, y: Math.round((height - cropHeight) * place), width, height: cropHeight };
}

/**
 * ポインターの x（枠の中心の位置、トラックの左端からの px）から、枠の位置（0〜1）を求めます。
 * 枠は中心がポインターに合うように動き、トラックの端で止まります。
 */
export function positionFromPointer(pointerX: number, trackLength: number, frameLength: number): number {
  const movable = trackLength - frameLength;
  if (movable <= 0) {
    return 0;
  }
  return clamp01((pointerX - frameLength / 2) / movable);
}
