import { ALLOWED_MARKERS, FRAME_MARKERS, MARKER, isStandaloneMarker } from './markers';

/**
 * 検査で不合格にする理由のコード。表示文字列は持たない（表示は呼び出し側が config から引く）。
 * - not_jpeg：SOI（FF D8 FF）で始まらない
 * - svg：SVG として扱えるテキスト（<svg または <?xml で始まる）
 * - forbidden_segment：許可リストにないマーカー（APP1・APP2〜APP15・COM など）
 * - malformed：マーカーの構造が不正（途中に現れる SOI、マーカーの位置にある FF 以外、長さが 2 未満、SOF の幅か高さが 0 など）
 * - trailing_bytes：EOI の後ろに余分なバイトがある
 * - truncated：途中で切れている（セグメントの長さが範囲外、EOI が無い、スキャンの途中で終わるなど）
 * - missing_frame：SOF が無い、または SOS が SOF より前にある
 * - missing_scan：SOS が無い
 */
export type RejectReason =
  | 'not_jpeg'
  | 'svg'
  | 'forbidden_segment'
  | 'malformed'
  | 'trailing_bytes'
  | 'truncated'
  | 'missing_frame'
  | 'missing_scan';

/**
 * 規約：offset は内部の診断用で、外部（API の応答・画面）には返さない。外部に出すのは reason だけ。
 * 合格のときは幅・高さ・プログレッシブかどうか。不合格のときは理由と、問題のあったバイト位置。 */
export type InspectionResult =
  | { ok: true; width: number; height: number; progressive: boolean }
  | { ok: false; reason: RejectReason; offset: number };

/** SVG かどうかを見るときに、先頭の空白として読み飛ばす文字（空白・タブ・改行）。 */
const WHITESPACE: ReadonlySet<number> = new Set<number>([0x20, 0x09, 0x0a, 0x0d]);

/** UTF-8 の BOM。SVG の先頭に付くことがあるため、読み飛ばす。 */
const UTF8_BOM = [0xef, 0xbb, 0xbf];

/** JFIF の APP0 の識別子 "JFIF\0"。 */
const JFIF_IDENTIFIER: readonly number[] = [0x4a, 0x46, 0x49, 0x46, 0x00];

/** 標準の JFIF の APP0 のセグメント長（長さ自身の 2 バイトを含む）。 */
const JFIF_SEGMENT_LENGTH = 16;

/**
 * JPEG の許可リスト検査。画像は再エンコードせず、マーカーの並びを 1 回の走査（O(n)）で読むだけです。
 * Worker は受信時にこの検査を使い、EXIF などを含むものを保存しません（CLAUDE.md 8、requirements 3.2）。
 */
export class JpegInspector {
  inspect(bytes: Uint8Array): InspectionResult {
    if (!this.startsWithSoi(bytes)) {
      return this.fail(this.isSvgText(bytes) ? 'svg' : 'not_jpeg', 0);
    }

    const length = bytes.length;
    let frameFound = false;
    let scanFound = false;
    let width = 0;
    let height = 0;
    let progressive = false;
    let pos = 2;

    for (;;) {
      if (pos + 1 >= length) {
        return this.fail('truncated', pos);
      }
      if (bytes[pos] !== 0xff) {
        return this.fail('malformed', pos);
      }
      const code = bytes[pos + 1];
      if (code === 0xff) {
        // フィル（連続する FF）は読み飛ばす。
        pos += 1;
        continue;
      }
      if (code === 0x00) {
        return this.fail('malformed', pos);
      }
      if (!ALLOWED_MARKERS.has(code)) {
        return this.fail('forbidden_segment', pos);
      }
      if (code === MARKER.SOI) {
        // 先頭の SOI は読み済み。途中の SOI（入れ子の画像など）は拒否する。
        return this.fail('malformed', pos);
      }
      if (code === MARKER.EOI) {
        if (pos + 2 !== length) {
          return this.fail('trailing_bytes', pos + 2);
        }
        if (!frameFound) {
          return this.fail('missing_frame', pos);
        }
        if (!scanFound) {
          return this.fail('missing_scan', pos);
        }
        return { ok: true, width, height, progressive };
      }
      if (isStandaloneMarker(code)) {
        pos += 2;
        continue;
      }

      if (pos + 4 > length) {
        return this.fail('truncated', pos);
      }
      const segmentLength = (bytes[pos + 2] << 8) | bytes[pos + 3];
      if (segmentLength < 2) {
        return this.fail('malformed', pos);
      }
      const segmentEnd = pos + 2 + segmentLength;
      if (segmentEnd > length) {
        return this.fail('truncated', pos);
      }

      if (code === MARKER.APP0 && !this.isPlainJfif(bytes, pos, segmentLength)) {
        // APP0 は SOI の直後に 1 つだけ、標準の JFIF（長さ 16、サムネイル 0x0）に限る。
        return this.fail('forbidden_segment', pos);
      }

      if (FRAME_MARKERS.has(code)) {
        if (frameFound || segmentLength < 8) {
          return this.fail('malformed', pos);
        }
        height = (bytes[pos + 5] << 8) | bytes[pos + 6];
        width = (bytes[pos + 7] << 8) | bytes[pos + 8];
        if (width === 0 || height === 0) {
          return this.fail('malformed', pos);
        }
        frameFound = true;
        progressive = code === MARKER.SOF2;
      }

      if (code === MARKER.SOS) {
        if (!frameFound) {
          return this.fail('missing_frame', pos);
        }
        scanFound = true;
        const next = this.findNextMarkerInScan(bytes, segmentEnd);
        if (next < 0) {
          return this.fail('truncated', length);
        }
        pos = next;
        continue;
      }

      pos = segmentEnd;
    }
  }

  /**
   * APP0 が、SOI の直後（位置 2）にある標準の JFIF か。
   * 識別子が "JFIF" と 0x00、セグメント長が 16、サムネイルの幅と高さが 0 のものだけを許す。
   * JFXX・複数の APP0・長さや中身が違うものは false。
   */
  private isPlainJfif(bytes: Uint8Array, pos: number, segmentLength: number): boolean {
    if (pos !== 2 || segmentLength !== JFIF_SEGMENT_LENGTH) {
      return false;
    }
    const body = pos + 4;
    if (!JFIF_IDENTIFIER.every((value, index) => bytes[body + index] === value)) {
      return false;
    }
    // 本体は、識別子 5 + 版 2 + 単位 1 + 密度 4 + サムネイルの幅と高さ 2 = 14 バイト。
    return bytes[body + 12] === 0 && bytes[body + 13] === 0;
  }

  /** 先頭が SOI（FF D8 FF）か。 */
  private startsWithSoi(bytes: Uint8Array): boolean {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === MARKER.SOI && bytes[2] === 0xff;
  }

  /** 先頭の空白（と BOM）を除いた後ろが、<svg または <?xml で始まるか（大文字と小文字は区別しない）。 */
  private isSvgText(bytes: Uint8Array): boolean {
    let start = 0;
    if (bytes.length >= 3 && UTF8_BOM.every((value, index) => bytes[index] === value)) {
      start = 3;
    }
    while (start < bytes.length && WHITESPACE.has(bytes[start])) {
      start += 1;
    }
    const head = String.fromCharCode(...bytes.subarray(start, start + 5)).toLowerCase();
    return head.startsWith('<svg') || head.startsWith('<?xml');
  }

  /**
   * SOS の後の圧縮データを読み飛ばし、次のマーカー（FF xx）の位置を返す。見つからなければ -1。
   * FF 00（スタッフィング）と RST0〜RST7 は、データの一部として読み飛ばす。
   */
  private findNextMarkerInScan(bytes: Uint8Array, start: number): number {
    const length = bytes.length;
    let index = start;
    while (index < length) {
      if (bytes[index] !== 0xff) {
        index += 1;
        continue;
      }
      if (index + 1 >= length) {
        return -1;
      }
      const next = bytes[index + 1];
      if (next === 0x00 || (next >= MARKER.RST0 && next <= MARKER.RST7)) {
        index += 2;
        continue;
      }
      if (next === 0xff) {
        // フィルの FF は、次の FF から判定する。
        index += 1;
        continue;
      }
      return index;
    }
    return -1;
  }

  private fail(reason: RejectReason, offset: number): InspectionResult {
    return { ok: false, reason, offset };
  }
}

/** JPEG のバイト列を検査する。例外は投げず、合格か不合格（理由つき）を返す。 */
export function inspectJpeg(bytes: Uint8Array): InspectionResult {
  return new JpegInspector().inspect(bytes);
}
