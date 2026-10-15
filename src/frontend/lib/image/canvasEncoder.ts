/// <reference lib="dom" />
import { PREPARE_DEFAULTS, RULE_DEFAULTS } from '../../../config/defaults';
import { LIMITS } from '../../../config/limits';
import { stripDisallowedSegments } from '../../../core/jpeg/segmentStripper';
import type { CropRect } from './cropMath';

/** 再エンコードの失敗の理由。文言は src/config/strings/prepare.ts が持ちます。 */
export type EncodeReason = 'save_too_large' | 'encode_failed';

/** 再エンコードの結果。 */
export type EncodeOutcome =
  | { readonly ok: true; readonly blob: Blob; readonly quality: number }
  | { readonly ok: false; readonly reason: EncodeReason };

/** 長辺を maxLongSide 以下にする縮小率を求めます。小さい画像は拡大しません。 */
export function longSideScale(width: number, height: number, maxLongSide: number): number {
  return Math.min(1, maxLongSide / Math.max(width, height));
}

/**
 * 品質の候補を高い方から順に試し、上限以下になった最初の結果を返します。
 * 下限の品質でも上限を超えるときは save_too_large を返します（品質を下げ続けても保存しません）。
 * 純粋な関数です。エンコーダは外から渡します（テストで確かめられるようにするため）。
 */
export async function encodeWithinLimit(
  encode: (quality: number) => Promise<Blob | null>,
  qualities: readonly number[],
  maxBytes: number,
): Promise<EncodeOutcome> {
  for (const quality of qualities) {
    const blob = await encode(quality);
    if (blob === null) {
      return { ok: false, reason: 'encode_failed' };
    }
    if (blob.size <= maxBytes) {
      return { ok: true, blob, quality };
    }
  }
  return { ok: false, reason: 'save_too_large' };
}

/**
 * Canvas で切り抜き・縮小し、JPEG に再エンコードします（EXIF は残りません）。
 * DOM に依存するため、テストは Playwright の実際のブラウザで行います。
 */
export class CanvasEncoder {
  /** 枠の範囲を、長辺 longSide 以下の canvas に描きます。作れないときは null です。 */
  drawCrop(source: CanvasImageSource, crop: CropRect, longSide: number): HTMLCanvasElement | null {
    const scale = longSideScale(crop.width, crop.height, longSide);
    const width = Math.max(1, Math.round(crop.width * scale));
    const height = Math.max(1, Math.round(crop.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    return canvas;
  }

  /** 保存用の JPEG を作ります（品質の候補と上限は src/config の既定値）。 */
  async encodeSaved(canvas: HTMLCanvasElement): Promise<EncodeOutcome> {
    return encodeWithinLimit(
      (quality) => toJpegBlob(canvas, quality),
      PREPARE_DEFAULTS.saveQualities,
      RULE_DEFAULTS.savedMaxBytes,
    );
  }

  /** 分類用の縮小 JPEG を作ります。保存はしません。上限を超えたら encode_failed にします。 */
  async encodeClassify(canvas: HTMLCanvasElement): Promise<EncodeOutcome> {
    const outcome = await encodeWithinLimit(
      (quality) => toJpegBlob(canvas, quality),
      [PREPARE_DEFAULTS.classifyQuality],
      LIMITS.classifyImageMaxBytes,
    );
    return outcome.ok ? outcome : { ok: false, reason: 'encode_failed' };
  }

  /** 分類用の画像の RGBA を読みます（特徴量の計算に使う）。 */
  readPixels(canvas: HTMLCanvasElement): ImageData | null {
    const context = canvas.getContext('2d');
    if (context === null) {
      return null;
    }
    return context.getImageData(0, 0, canvas.width, canvas.height);
  }
}

/**
 * toBlob の結果から、許可リスト以外のセグメント（Chromium が付ける ICC の APP2 など）を取り除きます。
 * バイト単位の処理で、画素は変えません（再エンコードはしません）。読めない Blob は null です。
 */
export async function stripBlobMetadata(blob: Blob): Promise<Blob | null> {
  const stripped = stripDisallowedSegments(new Uint8Array(await blob.arrayBuffer()));
  return stripped === null ? null : new Blob([stripped as BlobPart], { type: 'image/jpeg' });
}

async function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), 'image/jpeg', quality);
  });
  return blob === null ? null : stripBlobMetadata(blob);
}
