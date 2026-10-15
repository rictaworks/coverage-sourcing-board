import { SUBMISSION_CONFIG } from '../../config/submission';
import { inspectJpeg, type RejectReason } from '../../core/jpeg/jpegInspector';
import { REASON, type ReasonCodeValue } from '../../core/validation/reasonCodes';
import type { AcceptRule } from '../../core/types';
import type { ApiErrorCode, RejectionReason } from '../../core/api/contract';
import { SubmissionFailure } from './failure';

/** JPEG の検査の理由を、API のエラーのコードに対応づける（画像の内容は含めない）。 */
const INSPECTION_CODES: Record<RejectReason, ApiErrorCode> = {
  not_jpeg: 'unsupported_image',
  svg: 'unsupported_image',
  malformed: 'unsupported_image',
  truncated: 'unsupported_image',
  missing_frame: 'unsupported_image',
  missing_scan: 'unsupported_image',
  forbidden_segment: 'metadata_not_allowed',
  trailing_bytes: 'trailing_bytes',
};

/** 浮動小数の誤差を吸収する小さな値（比率の境界の比較）。 */
const EPSILON = 1e-9;

/** 寸法（SOF から読んだ幅と高さ）。 */
interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Worker が受け取った画像の検査（再エンコードはしない。CLAUDE.md 8）。
 * - 保存用の JPEG：JPEG の検査（B4）、バイト数、長辺、横向き、4:3 の比率、最小短辺。
 *   横向き・比率・短辺は、投稿者がその場で直せる項目のため、理由つきの submission_rejected にする。
 * - 分類用の縮小 JPEG：JPEG の検査、長辺、バイト数（保存しない）。
 */
export class SubmissionImageGate {
  constructor(private readonly rule: AcceptRule) {}

  /** 保存用の JPEG を検査し、寸法を返す。不合格は SubmissionFailure を投げる。 */
  checkSaved(bytes: Uint8Array): Dimensions {
    if (bytes.byteLength > SUBMISSION_CONFIG.savedMaxBytes) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    const { width, height } = this.inspect(bytes);
    if (Math.max(width, height) > SUBMISSION_CONFIG.savedLongEdgePx) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    const reasons = this.dimensionReasons(width, height);
    if (reasons.length > 0) {
      throw new SubmissionFailure('submission_rejected', 400, reasons);
    }
    return { width, height };
  }

  /** 分類用の縮小 JPEG を検査する（保存しない）。不合格は SubmissionFailure を投げる。 */
  checkThumb(bytes: Uint8Array): void {
    if (bytes.byteLength > SUBMISSION_CONFIG.classifyImageMaxBytes) {
      throw new SubmissionFailure('invalid_request', 400);
    }
    const { width, height } = this.inspect(bytes);
    if (Math.max(width, height) > SUBMISSION_CONFIG.classifyImageEdgePx) {
      throw new SubmissionFailure('invalid_request', 400);
    }
  }

  private inspect(bytes: Uint8Array): Dimensions {
    const result = inspectJpeg(bytes);
    if (!result.ok) {
      throw new SubmissionFailure(INSPECTION_CODES[result.reason], 400);
    }
    return { width: result.width, height: result.height };
  }

  /** 横向き・比率・最小短辺の理由を集める。縦向きのときは比率を判定しない（回転しないため）。 */
  private dimensionReasons(width: number, height: number): RejectionReason[] {
    const reasons: RejectionReason[] = [];
    const add = (item: RejectionReason['item'], reason: ReasonCodeValue): void => {
      reasons.push({ item, reasonCode: reason });
    };
    if (height > width) {
      add('orientation_ratio', REASON.ORIENTATION_PORTRAIT);
    } else {
      const deviation = Math.abs(width / height - this.rule.ratio) / this.rule.ratio;
      if (deviation > this.rule.tolerance + EPSILON) {
        add('orientation_ratio', REASON.RATIO_OUT_OF_RANGE);
      }
    }
    if (Math.min(width, height) < this.rule.minShortPx) {
      add('resolution', REASON.SHORT_SIDE_TOO_SMALL);
    }
    return reasons;
  }
}
