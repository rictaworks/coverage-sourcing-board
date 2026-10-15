import { RULE_DEFAULTS } from '../../../config/defaults';
import type { ImageFormat } from '../../../core/types';

/** 受け付けない理由の識別子。文言は src/config/strings/prepare.ts が持ちます。 */
export type ProbeReason = 'unsupported_format' | 'too_large' | 'too_many_pixels' | 'unreadable';

/** 先頭のバイトと寸法から求めた結果。ピクセルは読みません（デコードの前の判定）。 */
export type ProbeResult =
  | { readonly ok: true; readonly format: ImageFormat; readonly width: number; readonly height: number }
  | { readonly ok: false; readonly reason: ProbeReason };

const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SOI_PREFIX: readonly number[] = [0xff, 0xd8, 0xff];
const MARKER_SOS = 0xda;
const MARKER_SOF_LOW = 0xc0;
const MARKER_SOF_HIGH = 0xcf;
/** SOF の番号に含まれるが、フレームではない符号（DHT・JPG・DAC）。 */
const NOT_FRAME_MARKERS: ReadonlySet<number> = new Set([0xc4, 0xc8, 0xcc]);

/**
 * 投稿された画像のファイルを、拡張子や MIME ではなく先頭のバイトで判定します。
 * 大きさはファイルのサイズで、画素数は寸法（ヘッダー）で判定し、デコードしません。
 */
export class ImageFileProbe {
  /** ファイルの大きさを確かめます。読み込みの前に呼びます。 */
  checkByteSize(byteSize: number): ProbeReason | null {
    return byteSize > RULE_DEFAULTS.maxInputBytes ? 'too_large' : null;
  }

  /** 形式と寸法を確かめます。画素数が上限を超えるときは、デコードの前に止めます。 */
  probe(bytes: Uint8Array): ProbeResult {
    const format = this.detectFormat(bytes);
    if (format === null) {
      return { ok: false, reason: 'unsupported_format' };
    }
    const dimensions = format === 'jpeg' ? this.readJpegDimensions(bytes) : this.readPngDimensions(bytes);
    if (dimensions === null) {
      return { ok: false, reason: 'unreadable' };
    }
    if (dimensions.width * dimensions.height > RULE_DEFAULTS.maxInputPixels) {
      return { ok: false, reason: 'too_many_pixels' };
    }
    return { ok: true, format, width: dimensions.width, height: dimensions.height };
  }

  private detectFormat(bytes: Uint8Array): ImageFormat | null {
    if (startsWith(bytes, JPEG_SOI_PREFIX)) {
      return 'jpeg';
    }
    if (startsWith(bytes, PNG_SIGNATURE)) {
      return 'png';
    }
    return null;
  }

  /** SOF を探して寸法を読みます。SOS より前に SOF が無ければ null です。 */
  private readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
    let position = 2;
    while (position + 1 < bytes.length) {
      if (bytes[position] !== 0xff) {
        return null;
      }
      const marker = bytes[position + 1];
      if (marker === 0xff) {
        position += 1;
        continue;
      }
      if (marker === MARKER_SOS) {
        return null;
      }
      if (isStandalone(marker)) {
        position += 2;
        continue;
      }
      if (position + 3 >= bytes.length) {
        return null;
      }
      const length = (bytes[position + 2] << 8) | bytes[position + 3];
      if (length < 2) {
        return null;
      }
      if (isFrameMarker(marker)) {
        if (position + 8 >= bytes.length) {
          return null;
        }
        const height = (bytes[position + 5] << 8) | bytes[position + 6];
        const width = (bytes[position + 7] << 8) | bytes[position + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      position += 2 + length;
    }
    return null;
  }

  /** IHDR の幅と高さ（ビッグエンディアンの 4 バイト）を読みます。 */
  private readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
    if (bytes.length < 24) {
      return null;
    }
    const ihdr = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (ihdr !== 'IHDR') {
      return null;
    }
    const width = readUint32(bytes, 16);
    const height = readUint32(bytes, 20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }
  return prefix.every((value, index) => bytes[index] === value);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

/** 長さを持たないマーカー（SOI・EOI・RST・TEM）。 */
function isStandalone(marker: number): boolean {
  return marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function isFrameMarker(marker: number): boolean {
  return marker >= MARKER_SOF_LOW && marker <= MARKER_SOF_HIGH && !NOT_FRAME_MARKERS.has(marker);
}
