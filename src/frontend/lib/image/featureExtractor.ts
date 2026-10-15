import { IMAGE_FEATURE_DEFAULTS } from '../../../config/image';
import { colorStats } from '../../../core/image/colorStats';
import { dHash } from '../../../core/image/dhash';
import { toGrayscale } from '../../../core/image/grayscale';
import { laplacianVariance } from '../../../core/image/laplacian';
import { meanLuma } from '../../../core/image/luma';
import type { RgbaImage } from '../../../core/image/rgbaImage';
import type { ImageFeatures, ImageFormat } from '../../../core/types';

/** 特徴量の計算に必要な、元の画像の情報。 */
export interface FeatureSource {
  /** 元の画像の幅と高さ（表示の向きでの寸法）。 */
  readonly width: number;
  readonly height: number;
  readonly format: ImageFormat;
  /** 元が JPEG で、品質を推定できたときの値。それ以外は省きます。 */
  readonly quality?: number;
}

/**
 * 特徴量（B2 の関数）をまとめて求めます。画素の値そのものは結果に含めません。
 * 入力は長辺 512 px に縮小した画像（分類用と同じ）です。縮小は呼び出し側（CanvasEncoder）が行います。
 */
export class FeatureExtractor {
  extract(smallImage: RgbaImage, source: FeatureSource): ImageFeatures {
    const gray = toGrayscale(smallImage);
    const stats = colorStats(smallImage);
    const base = {
      width: source.width,
      height: source.height,
      format: source.format,
      blurScore: laplacianVariance(gray),
      meanLuma: meanLuma(gray),
      saturation: stats.meanSaturation,
      contrast: stats.lumaStdDev / CHANNEL_MAX,
      phash: dHash(gray),
    };
    return source.quality === undefined ? base : { ...base, quality: source.quality };
  }
}

/** 輝度の最大値（コントラストを 0〜1 にするための割る数）。 */
const CHANNEL_MAX = 255;

/** 特徴量の計算に使う縮小の長辺（px）。src/config/image.ts が正です。 */
export const FEATURE_DOWNSCALE_LONG_SIDE = IMAGE_FEATURE_DEFAULTS.focusDownscaleLongSide;
