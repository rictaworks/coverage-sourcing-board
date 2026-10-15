import { ALLOWED_MARKERS, MARKER, isRstMarker, isStandaloneMarker } from './markers';

/**
 * 許可リスト（markers.ts の ALLOWED_MARKERS）にないセグメント（APP1・APP2・APP13・COM など）を、
 * バイト列のまま取り除きます。画素は変えず、再エンコードもしません（圧縮データは 1 バイトも変わりません）。
 * Canvas の JPEG には ICC の APP2 が入るため、B4 の検査（jpegInspector）に通すために使います。
 *
 * 構造が不正（SOI が無い、途中で切れている、EOI が無い）なときは null を返します（推定で補いません）。
 * EOI の後ろの余分なバイトは含めません。
 */
export function stripDisallowedSegments(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== MARKER.SOI) {
    return null;
  }
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let pos = 2;
  for (;;) {
    if (pos + 1 >= bytes.length || bytes[pos] !== 0xff) {
      return null;
    }
    const code = bytes[pos + 1];
    if (code === 0xff) {
      pos += 1;
      continue;
    }
    if (code === MARKER.EOI) {
      kept.push(bytes.subarray(pos, pos + 2));
      return concat(kept);
    }
    if (isStandaloneMarker(code)) {
      kept.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (pos + 4 > bytes.length) {
      return null;
    }
    const segmentEnd = pos + 2 + ((bytes[pos + 2] << 8) | bytes[pos + 3]);
    if (segmentEnd > bytes.length || segmentEnd < pos + 4) {
      return null;
    }
    if (code === MARKER.SOS) {
      const next = findNextMarkerInScan(bytes, segmentEnd);
      if (next < 0) {
        return null;
      }
      kept.push(bytes.subarray(pos, next));
      pos = next;
      continue;
    }
    if (ALLOWED_MARKERS.has(code)) {
      kept.push(bytes.subarray(pos, segmentEnd));
    }
    pos = segmentEnd;
  }
}

/** SOS の後の圧縮データを読み飛ばし、次のマーカーの位置を返す（FF 00 と RST はデータの一部）。無ければ -1。 */
function findNextMarkerInScan(bytes: Uint8Array, start: number): number {
  let index = start;
  while (index + 1 < bytes.length) {
    if (bytes[index] !== 0xff) {
      index += 1;
      continue;
    }
    const next = bytes[index + 1];
    if (next === 0x00 || isRstMarker(next)) {
      index += 2;
    } else if (next === 0xff) {
      index += 1;
    } else {
      return index;
    }
  }
  return -1;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
