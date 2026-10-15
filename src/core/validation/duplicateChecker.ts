/**
 * 重複の判定（requirements 3.4）。外部に依存しない純粋なクラスです。
 *
 * 比較の対象は同じセッション内の投稿だけです（requirements 2.3）。
 * 同一画像は知覚ハッシュの距離で判定し、距離 4 以下は不合格、5〜8 は要確認です（3.0）。
 * 同一地点は、同じ市町村×同じ季節で、地点名を正規化して一致したら要確認です。地点名が空なら判定しません。
 */
import { RULE_DEFAULTS } from '../../config/defaults';
import { IMAGE_FEATURE_STRINGS } from '../../config/strings/image';
import { hammingDistance } from '../image/dhash';
import { ImageInputError } from '../image/rgbaImage';
import { normalizeText } from '../text/normalize';
import type { AcceptRule, CheckResult, Verdict } from '../types';
import { REASON, type ReasonCodeValue } from './reasonCodes';
import type { Season } from './validator';

/** 16 進の 16 文字（64 ビット）のハッシュ。 */
const HASH_PATTERN = /^[0-9a-fA-F]{16}$/;

/** 重複の判定に使う投稿の情報。画像の中身や位置情報は含みません。 */
export interface SubmissionForDuplicate {
  readonly id: string;
  readonly sessionId: string;
  /** 市町村（マス）。境界データは未確定のため、申告の値を使います。 */
  readonly municipality: string;
  readonly season: Season;
  /** 地点名（投稿者の入力）。空欄なら同一地点の判定を行いません。 */
  readonly spotName: string;
  /** 知覚ハッシュ（16 文字の 16 進）。 */
  readonly phash: string;
}

/** 重複の判定の結果。candidateIds は、要確認の表示のために比較した既存の投稿の ID です。 */
export interface DuplicateOutcome {
  readonly checks: CheckResult[];
  readonly candidateIds: readonly string[];
}

/** 重複の判定。 */
export class DuplicateChecker {
  constructor(private readonly rule: AcceptRule) {}

  /** 同じセッションの既存の投稿と比べます。 */
  check(submission: SubmissionForDuplicate, existing: readonly SubmissionForDuplicate[]): DuplicateOutcome {
    if (!HASH_PATTERN.test(submission.phash)) {
      throw new ImageInputError(IMAGE_FEATURE_STRINGS.invalidHash);
    }
    const sameSession = existing.filter((other) => other.sessionId === submission.sessionId && other.id !== submission.id);
    const candidateIds = new Set<string>();
    const checks: CheckResult[] = [this.checkImage(submission, sameSession, candidateIds)];
    const spotCheck = this.checkSpot(submission, sameSession, candidateIds);
    if (spotCheck !== null) {
      checks.push(spotCheck);
    }
    return { checks, candidateIds: [...candidateIds] };
  }

  private checkImage(
    submission: SubmissionForDuplicate,
    others: readonly SubmissionForDuplicate[],
    candidateIds: Set<string>,
  ): CheckResult {
    let verdict: Verdict = 'pass';
    for (const other of others) {
      const distance = hammingDistance(submission.phash, other.phash);
      if (distance <= this.rule.dupDistance) {
        verdict = 'fail';
        candidateIds.add(other.id);
      } else if (distance <= RULE_DEFAULTS.phashReviewMax) {
        if (verdict === 'pass') {
          verdict = 'review';
        }
        candidateIds.add(other.id);
      }
    }
    const reasonCode: ReasonCodeValue =
      verdict === 'fail'
        ? REASON.DUPLICATE_IMAGE_REJECT
        : verdict === 'review'
          ? REASON.DUPLICATE_IMAGE_REVIEW
          : REASON.PASSED;
    return { item: 'duplicate_image', verdict, reasonCode };
  }

  /** 地点名が空欄なら null（判定しない）を返します。 */
  private checkSpot(
    submission: SubmissionForDuplicate,
    others: readonly SubmissionForDuplicate[],
    candidateIds: Set<string>,
  ): CheckResult | null {
    const spotKey = normalizeText(submission.spotName);
    if (spotKey === '') {
      return null;
    }
    const municipalityKey = normalizeText(submission.municipality);
    const matches = others.filter(
      (other) =>
        other.season === submission.season &&
        normalizeText(other.municipality) === municipalityKey &&
        normalizeText(other.spotName) === spotKey,
    );
    if (matches.length === 0) {
      return { item: 'duplicate_spot', verdict: 'pass', reasonCode: REASON.PASSED };
    }
    for (const match of matches) {
      candidateIds.add(match.id);
    }
    return { item: 'duplicate_spot', verdict: 'review', reasonCode: REASON.DUPLICATE_SPOT_REVIEW };
  }
}
