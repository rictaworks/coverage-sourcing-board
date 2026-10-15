import { describe, expect, it } from 'vitest';
import { encodeWithinLimit, longSideScale, stripBlobMetadata } from '../../../../src/frontend/lib/image/canvasEncoder';
import { inspectJpeg } from '../../../../src/core/jpeg/jpegInspector';
import { app2Icc, buildJpeg } from '../../../helpers/jpegBytes';

/** 品質ごとに決まったバイト数の Blob を返す偽のエンコーダ。呼んだ品質を記録する。 */
function fakeEncoder(sizeByQuality: Record<number, number>): { encode: (q: number) => Promise<Blob | null>; calls: number[] } {
  const calls: number[] = [];
  const encode = async (quality: number): Promise<Blob | null> => {
    calls.push(quality);
    const size = sizeByQuality[quality];
    return new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
  };
  return { encode, calls };
}

describe('canvasEncoder（保存用の JPEG の品質の選び方と縮小の計算、純粋な関数）', () => {
  it('上限以下になった最初の品質を採用します（高い品質から順に試します）', async () => {
    const { encode, calls } = fakeEncoder({ 0.92: 2_500_000, 0.85: 2_000_000, 0.78: 1_800_000, 0.7: 1_500_000, 0.6: 1_200_000 });
    const result = await encodeWithinLimit(encode, [0.92, 0.85, 0.78, 0.7, 0.6], 1_900_000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quality).toBe(0.78);
      expect(result.blob.size).toBe(1_800_000);
    }
    expect(calls).toEqual([0.92, 0.85, 0.78]);
  });

  it('上限ちょうどの大きさは採用します', async () => {
    const { encode } = fakeEncoder({ 0.92: 1_900_000 });
    const result = await encodeWithinLimit(encode, [0.92], 1_900_000);
    expect(result.ok).toBe(true);
  });

  it('下限の品質でも上限を超えるときは、保存しない（save_too_large で不合格）にします', async () => {
    const { encode, calls } = fakeEncoder({ 0.92: 3_000_000, 0.85: 2_900_000, 0.6: 2_000_000 });
    const result = await encodeWithinLimit(encode, [0.92, 0.85, 0.6], 1_900_000);
    expect(result).toEqual({ ok: false, reason: 'save_too_large' });
    expect(calls).toEqual([0.92, 0.85, 0.6]);
  });

  it('エンコーダが Blob を返さなかったときは、encode_failed にします', async () => {
    const result = await encodeWithinLimit(async () => null, [0.92], 1_900_000);
    expect(result).toEqual({ ok: false, reason: 'encode_failed' });
  });

  it('長辺を 1,600 px 以下にする縮小率を求めます（小さい画像は拡大しません）', () => {
    expect(longSideScale(3000, 2000, 1600)).toBeCloseTo(1600 / 3000, 10);
    expect(longSideScale(1200, 900, 1600)).toBe(1);
    expect(longSideScale(1600, 1200, 1600)).toBe(1);
  });
});

describe('stripBlobMetadata（toBlob の結果から ICC の APP2 などを取り除く）', () => {
  it('ICC の APP2 を含む Blob が、B4 の検査に合格する Blob になります', async () => {
    const blob = new Blob([buildJpeg({ extraSegments: [app2Icc()] }) as BlobPart], { type: 'image/jpeg' });
    const stripped = await stripBlobMetadata(blob);
    expect(stripped).not.toBeNull();
    expect(stripped?.type).toBe('image/jpeg');
    expect(inspectJpeg(new Uint8Array(await (stripped as Blob).arrayBuffer())).ok).toBe(true);
  });

  it('JPEG として読めない Blob は null にします', async () => {
    expect(await stripBlobMetadata(new Blob([new Uint8Array([1, 2, 3, 4])]))).toBeNull();
  });
});
