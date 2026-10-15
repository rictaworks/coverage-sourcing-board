import { describe, expect, it } from 'vitest';
import { DuplicateChecker, type SubmissionForDuplicate } from '../../../../src/core/validation/duplicateChecker';
import { defaultAcceptRule } from '../../../../src/core/validation/validator';
import { REASON } from '../../../../src/core/validation/reasonCodes';
import { VALIDATION_FIXTURES } from '../../../fixtures/validation-inputs';

/** 基準のハッシュ（すべてのビットが 0）。ここから立てるビットの数で、距離を作ります。 */
const BASE_HASH = '0000000000000000';
/** 距離 4：下位 4 ビット（0xf）。 */
const DISTANCE_4 = '000000000000000f';
/** 距離 5：下位 5 ビット（0x1f）。 */
const DISTANCE_5 = '000000000000001f';
/** 距離 8：下位 8 ビット（0xff）。 */
const DISTANCE_8 = '00000000000000ff';
/** 距離 9：下位 9 ビット（0x1ff）。 */
const DISTANCE_9 = '00000000000001ff';

/** 投稿の既定の値。テストごとに一部だけを変えます。 */
function submission(overrides: Partial<SubmissionForDuplicate> = {}): SubmissionForDuplicate {
  return {
    id: 'new',
    sessionId: 'session-a',
    municipality: VALIDATION_FIXTURES.spotMinamiAwa,
    season: 'summer',
    spotName: VALIDATION_FIXTURES.spotMinamiAwa,
    phash: BASE_HASH,
    ...overrides,
  };
}

const checker = new DuplicateChecker(defaultAcceptRule());

describe('DuplicateChecker（同一画像：距離 4 以下は不合格、5〜8 は要確認、9 以上は合格）', () => {
  it.each([
    [DISTANCE_4, 'fail', REASON.DUPLICATE_IMAGE_REJECT],
    [DISTANCE_5, 'review', REASON.DUPLICATE_IMAGE_REVIEW],
    [DISTANCE_8, 'review', REASON.DUPLICATE_IMAGE_REVIEW],
    [DISTANCE_9, 'pass', REASON.PASSED],
  ])('距離の違うハッシュ %s の判定は %s です', (hash, verdict, reason) => {
    const outcome = checker.check(submission(), [{ id: 'old', sessionId: 'session-a', municipality: VALIDATION_FIXTURES.spotMinamiAwa, season: 'winter', spotName: VALIDATION_FIXTURES.spotOther, phash: hash }]);
    const image = outcome.checks.find((check) => check.item === 'duplicate_image');
    expect(image).toMatchObject({ verdict, reasonCode: reason });
  });

  it('同じセッションの投稿だけを比較します（別のセッションの同じ画像は対象外）', () => {
    const outcome = checker.check(submission(), [
      { id: 'other', sessionId: 'session-b', municipality: VALIDATION_FIXTURES.spotMinamiAwa, season: 'summer', spotName: VALIDATION_FIXTURES.spotOther, phash: BASE_HASH },
    ]);
    expect(outcome.checks.find((check) => check.item === 'duplicate_image')?.verdict).toBe('pass');
    expect(outcome.candidateIds).toEqual([]);
  });

  it('要確認の結果には、比較した既存の投稿の ID を含めます', () => {
    const outcome = checker.check(submission(), [
      { id: 'near', sessionId: 'session-a', municipality: VALIDATION_FIXTURES.spotKaiyo, season: 'autumn', spotName: VALIDATION_FIXTURES.spotOther, phash: DISTANCE_5 },
      { id: 'far', sessionId: 'session-a', municipality: VALIDATION_FIXTURES.spotKaiyo, season: 'autumn', spotName: VALIDATION_FIXTURES.spotOther, phash: DISTANCE_9 },
    ]);
    expect(outcome.candidateIds).toEqual(['near']);
  });

  it('不正な形式のハッシュは例外にします', () => {
    expect(() => checker.check(submission({ phash: 'not-a-hash' }), [])).toThrow();
  });
});

describe('DuplicateChecker（同一地点：同じ市町村×同じ季節で、地点名が正規化して一致したら要確認）', () => {
  it('同じ市町村・同じ季節・同じ地点名（表記ゆれを含む）は要確認です', () => {
    const outcome = checker.check(submission({ spotName: VALIDATION_FIXTURES.spotPaddedMinamiAwa }), [
      { id: 'old', sessionId: 'session-a', municipality: VALIDATION_FIXTURES.spotMinamiAwa, season: 'summer', spotName: VALIDATION_FIXTURES.spotMinamiAwa, phash: DISTANCE_9 },
    ]);
    const spot = outcome.checks.find((check) => check.item === 'duplicate_spot');
    expect(spot).toMatchObject({ verdict: 'review', reasonCode: REASON.DUPLICATE_SPOT_REVIEW });
    expect(outcome.candidateIds).toEqual(['old']);
  });

  it('季節が違えば、同じ地点名でも対象にしません', () => {
    const outcome = checker.check(submission({ season: 'summer' }), [
      { id: 'old', sessionId: 'session-a', municipality: VALIDATION_FIXTURES.spotMinamiAwa, season: 'winter', spotName: VALIDATION_FIXTURES.spotMinamiAwa, phash: DISTANCE_9 },
    ]);
    expect(outcome.checks.find((check) => check.item === 'duplicate_spot')?.verdict).toBe('pass');
  });

  it('市町村が違えば、同じ地点名でも対象にしません', () => {
    const outcome = checker.check(submission({ municipality: VALIDATION_FIXTURES.spotKaiyo }), [
      { id: 'old', sessionId: 'session-a', municipality: VALIDATION_FIXTURES.spotMinamiAwa, season: 'summer', spotName: VALIDATION_FIXTURES.spotMinamiAwa, phash: DISTANCE_9 },
    ]);
    expect(outcome.checks.find((check) => check.item === 'duplicate_spot')?.verdict).toBe('pass');
  });

  it('地点名が空欄なら、この判定を行いません（結果を返さない）', () => {
    const outcome = checker.check(submission({ spotName: VALIDATION_FIXTURES.spotEmpty }), [
      { id: 'old', sessionId: 'session-a', municipality: VALIDATION_FIXTURES.spotMinamiAwa, season: 'summer', spotName: VALIDATION_FIXTURES.spotEmpty, phash: DISTANCE_9 },
    ]);
    expect(outcome.checks.some((check) => check.item === 'duplicate_spot')).toBe(false);
  });

  it('空白だけの地点名も空欄として扱い、判定を行いません', () => {
    const outcome = checker.check(submission({ spotName: VALIDATION_FIXTURES.spotBlank }), [
      { id: 'old', sessionId: 'session-a', municipality: VALIDATION_FIXTURES.spotMinamiAwa, season: 'summer', spotName: VALIDATION_FIXTURES.spotBlank, phash: DISTANCE_9 },
    ]);
    expect(outcome.checks.some((check) => check.item === 'duplicate_spot')).toBe(false);
  });

  it('同じセッションの既存の投稿だけを比較します', () => {
    const outcome = checker.check(submission(), [
      { id: 'old', sessionId: 'session-b', municipality: VALIDATION_FIXTURES.spotMinamiAwa, season: 'summer', spotName: VALIDATION_FIXTURES.spotMinamiAwa, phash: DISTANCE_9 },
    ]);
    expect(outcome.checks.find((check) => check.item === 'duplicate_spot')?.verdict).toBe('pass');
  });
});
