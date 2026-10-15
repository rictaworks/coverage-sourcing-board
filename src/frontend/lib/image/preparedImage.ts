import { RULE_DEFAULTS } from '../../../config/defaults';
import { PREPARE_ERROR_STRINGS } from '../../../config/strings/prepare';
import type { RgbaImage } from '../../../core/image/rgbaImage';
import { estimateJpegQuality } from '../../../core/image/jpegQuality';
import type { ExifSummary, ImageFeatures, ImageFormat } from '../../../core/types';
import { CanvasEncoder, type EncodeReason } from './canvasEncoder';
import { cropRectAt, requiresCrop, type CropRect } from './cropMath';
import { ExifReader } from './exifReader';
import { FeatureExtractor, FEATURE_DOWNSCALE_LONG_SIDE } from './featureExtractor';
import { ImageFileProbe, type ProbeReason } from './fileProbe';

/** 整形が不合格になった理由。文言は prepareErrorMessage が作ります。 */
export type PrepareReason = ProbeReason | EncodeReason | 'portrait' | 'decode_failed';

/** 整形の失敗の例外。reason で理由を判別し、message は利用者に見せられる日本語です。 */
export class ImagePrepareError extends Error {
  readonly reason: PrepareReason;

  constructor(reason: PrepareReason) {
    super(prepareErrorMessage(reason));
    this.name = 'ImagePrepareError';
    this.reason = reason;
  }
}

/** 理由の文言（src/config/strings/prepare.ts）に、既定値の数値を入れて返します。 */
export function prepareErrorMessage(reason: PrepareReason): string {
  switch (reason) {
    case 'unsupported_format':
      return PREPARE_ERROR_STRINGS.unsupported_format;
    case 'too_large':
      return PREPARE_ERROR_STRINGS.too_large(RULE_DEFAULTS.maxInputBytes / (1024 * 1024));
    case 'too_many_pixels':
      return PREPARE_ERROR_STRINGS.too_many_pixels(RULE_DEFAULTS.maxInputPixels / 10_000);
    case 'unreadable':
      return PREPARE_ERROR_STRINGS.unreadable;
    case 'decode_failed':
      return PREPARE_ERROR_STRINGS.decode_failed;
    case 'portrait':
      return PREPARE_ERROR_STRINGS.portrait;
    case 'save_too_large':
      return PREPARE_ERROR_STRINGS.save_too_large(Math.round(RULE_DEFAULTS.savedMaxBytes / 1_000_000 * 10) / 10);
    case 'encode_failed':
      return PREPARE_ERROR_STRINGS.encode_failed;
  }
}

/** 読み込みの結果（確定の前）。枠の位置は確定の時に決めます。 */
export interface SourceImage {
  /** 表示の向き（EXIF の Orientation を browser が適用した後）でデコードした画像。 */
  readonly bitmap: ImageBitmap;
  readonly format: ImageFormat;
  /** 表示の向きでの幅と高さ。 */
  readonly width: number;
  readonly height: number;
  /** JPEG の品質（推定できたときだけ）。 */
  readonly quality?: number;
  readonly exif: ExifSummary;
  /** 比率が 4:3 の許容の外のとき true。枠を表示して位置を決めます。 */
  readonly needsCrop: boolean;
}

/** 保存用または分類用の画像。 */
export interface PreparedBlob {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

/** 整形の結果。保存するのは saved だけです。classifyImage は分類に使い、保存しません。 */
export interface PreparedImage {
  readonly saved: PreparedBlob & { readonly bytes: number };
  readonly classifyImage: PreparedBlob;
  readonly features: ImageFeatures;
  readonly exif: ExifSummary;
  /** 切り抜いた範囲。トリミングが不要だったときは null（画像の全体）。 */
  readonly crop: CropRect | null;
}

/**
 * 画像の整形（requirements 3.2）。読み込み（形式・寸法・EXIF・デコード）と、確定（切り抜き・再エンコード・特徴量）の 2 段階で行います。
 * 処理はすべてブラウザで行い、画像をサーバーに送りません。
 */
export class ImagePreparer {
  constructor(
    private readonly probe: ImageFileProbe = new ImageFileProbe(),
    private readonly exifReader: ExifReader = new ExifReader(),
    private readonly encoder: CanvasEncoder = new CanvasEncoder(),
    private readonly extractor: FeatureExtractor = new FeatureExtractor(),
  ) {}

  /** 選ばれたファイルを読み、形式・寸法・EXIF を確かめます。不合格なら ImagePrepareError を投げます。 */
  async analyze(file: File): Promise<SourceImage> {
    const sizeReason = this.probe.checkByteSize(file.size);
    if (sizeReason !== null) {
      throw new ImagePrepareError(sizeReason);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const probed = this.probe.probe(bytes);
    if (!probed.ok) {
      throw new ImagePrepareError(probed.reason);
    }
    const exif = await this.exifReader.summarize(bytes);
    const quality = this.readQuality(probed.format, bytes);
    const bitmap = await this.decode(file);
    if (bitmap.height > bitmap.width) {
      bitmap.close();
      throw new ImagePrepareError('portrait');
    }
    return {
      bitmap,
      format: probed.format,
      width: bitmap.width,
      height: bitmap.height,
      ...(quality === undefined ? {} : { quality }),
      exif,
      needsCrop: requiresCrop(bitmap.width, bitmap.height),
    };
  }

  /** 枠の位置（0〜1）で切り抜き、保存用と分類用の画像と特徴量を作ります。 */
  async prepare(source: SourceImage, position: number): Promise<PreparedImage> {
    const crop = cropRectAt(source.width, source.height, position);
    const savedCanvas = this.encoder.drawCrop(source.bitmap, crop, RULE_DEFAULTS.savedLongEdgePx);
    if (savedCanvas === null) {
      throw new ImagePrepareError('encode_failed');
    }
    const savedOutcome = await this.encoder.encodeSaved(savedCanvas);
    if (!savedOutcome.ok) {
      throw new ImagePrepareError(savedOutcome.reason);
    }

    const smallCanvas = this.encoder.drawCrop(source.bitmap, crop, FEATURE_DOWNSCALE_LONG_SIDE);
    if (smallCanvas === null) {
      throw new ImagePrepareError('encode_failed');
    }
    const pixels = this.encoder.readPixels(smallCanvas);
    if (pixels === null) {
      throw new ImagePrepareError('encode_failed');
    }
    const rgba: RgbaImage = { width: pixels.width, height: pixels.height, data: pixels.data };
    const features = this.extractor.extract(rgba, {
      width: source.width,
      height: source.height,
      format: source.format,
      ...(source.quality === undefined ? {} : { quality: source.quality }),
    });

    const classifyOutcome = await this.encoder.encodeClassify(smallCanvas);
    if (!classifyOutcome.ok) {
      throw new ImagePrepareError(classifyOutcome.reason);
    }

    return {
      saved: {
        blob: savedOutcome.blob,
        width: savedCanvas.width,
        height: savedCanvas.height,
        bytes: savedOutcome.blob.size,
      },
      classifyImage: {
        blob: classifyOutcome.blob,
        width: smallCanvas.width,
        height: smallCanvas.height,
      },
      features,
      exif: source.exif,
      crop: source.needsCrop ? crop : null,
    };
  }

  /** 読み込んだ画像を解放します（画面の状態を変えるとき）。 */
  release(source: SourceImage): void {
    source.bitmap.close();
  }

  private readQuality(format: ImageFormat, bytes: Uint8Array): number | undefined {
    if (format !== 'jpeg') {
      return undefined;
    }
    const result = estimateJpegQuality(bytes);
    return result.status === 'estimated' ? result.quality : undefined;
  }

  private async decode(file: File): Promise<ImageBitmap> {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      throw new ImagePrepareError('decode_failed');
    }
  }
}
