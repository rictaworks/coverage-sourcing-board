import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../../src/config/limits';
import { ReviewError, ReviewService } from '../../../src/core/review/reviewService';
import type { ReturnRequest } from '../../../src/core/review/reviewService';
import { ACCEPT_RULE_INPUT, CAMPAIGN_INPUTS } from '../../fixtures/campaign-inputs';
import type { SubmissionStatus } from '../../../src/core/types';

const ALL_STATUSES: readonly SubmissionStatus[] = ['checking', 'pending_review', 'accepted', 'returned'];

function returnRequest(overrides: Partial<ReturnRequest> = {}): ReturnRequest {
  return { reasonCode: 'ratio', freeText: 'note', resubmittable: true, ...overrides };
}

function errorCodeOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof ReviewError) {
      return error.code;
    }
    throw error;
  }
  throw new Error('no error was thrown');
}

describe('ReviewService（最終確認の状態遷移）', () => {
  const service = new ReviewService();

  describe('採用（accept）', () => {
    it('pending_review で枠内なら採用し、超過採用の記録は立てません', () => {
      expect(service.accept('pending_review', true, false)).toEqual({ status: 'accepted', overQuota: false });
    });

    it('枠を超えるときは、確認の印が無ければ拒否します（over_quota_confirmation_required）', () => {
      expect(errorCodeOf(() => service.accept('pending_review', false, false))).toBe('over_quota_confirmation_required');
    });

    it('枠を超えても、確認の印があれば超過採用として採用します', () => {
      expect(service.accept('pending_review', false, true)).toEqual({ status: 'accepted', overQuota: true });
    });

    it('枠内なら、確認の印があっても超過採用にはしません', () => {
      expect(service.accept('pending_review', true, true)).toEqual({ status: 'accepted', overQuota: false });
    });

    it('pending_review 以外からは採用できません（invalid_transition）', () => {
      for (const status of ALL_STATUSES.filter((status) => status !== 'pending_review')) {
        expect(errorCodeOf(() => service.accept(status, true, true))).toBe('invalid_transition');
      }
    });
  });

  describe('差し戻し（returnSubmission）', () => {
    it('pending_review を差し戻し、理由と再投稿の可否を持つ returned にします', () => {
      expect(service.returnSubmission('pending_review', returnRequest())).toEqual({
        status: 'returned',
        returnInfo: { reasonCode: 'ratio', freeText: 'note', resubmittable: true },
      });
    });

    it('再投稿不可の差し戻しも作れます', () => {
      expect(service.returnSubmission('pending_review', returnRequest({ resubmittable: false })).returnInfo.resubmittable).toBe(false);
    });

    it('pending_review 以外からは差し戻せません（invalid_transition）', () => {
      for (const status of ALL_STATUSES.filter((status) => status !== 'pending_review')) {
        expect(errorCodeOf(() => service.returnSubmission(status, returnRequest()))).toBe('invalid_transition');
      }
    });

    it('理由のコードが一覧に無いと拒否します（reason_code_invalid）', () => {
      expect(errorCodeOf(() => service.returnSubmission('pending_review', returnRequest({ reasonCode: 'unknown' })))).toBe(
        'reason_code_invalid',
      );
    });

    it('自由記述が上限ちょうどなら受け付け、1 字でも超えると拒否します（free_text_too_long）', () => {
      const atLimit = 'a'.repeat(LIMITS.returnReasonMaxChars);
      expect(service.returnSubmission('pending_review', returnRequest({ freeText: atLimit })).returnInfo.freeText).toBe(atLimit);
      const overLimit = `${atLimit}a`;
      expect(errorCodeOf(() => service.returnSubmission('pending_review', returnRequest({ freeText: overLimit })))).toBe(
        'free_text_too_long',
      );
    });

    it('「その他」は自由記述が必要です（free_text_required）', () => {
      expect(errorCodeOf(() => service.returnSubmission('pending_review', returnRequest({ reasonCode: 'other', freeText: '  ' })))).toBe(
        'free_text_required',
      );
    });

    it('自由記述の制御文字と双方向の制御文字を拒否します（free_text_invalid）', () => {
      const bad = ['a\u0000b', 'a\tb', 'a\nb', 'a\u007Fb', 'a\u009Fb', 'a\u202Eb', 'a\u202Ab', 'a\u2066b', 'a\u2069b'];
      for (const freeText of bad) {
        expect(errorCodeOf(() => service.returnSubmission('pending_review', returnRequest({ freeText })))).toBe('free_text_invalid');
      }
    });

    it('自由記述は、前後の空白を除いて保存します（HTML として扱わない文字列のまま）', () => {
      const markup = '  <b>x</b>  ';
      expect(service.returnSubmission('pending_review', returnRequest({ freeText: markup })).returnInfo.freeText).toBe('<b>x</b>');
    });
  });

  describe('採用の取り消し（revoke）', () => {
    it('accepted だけを取り消し、returned（差し戻し扱い）にします', () => {
      expect(service.revoke('accepted', returnRequest({ reasonCode: 'subject' }))).toEqual({
        status: 'returned',
        returnInfo: { reasonCode: 'subject', freeText: 'note', resubmittable: true },
      });
    });

    it('accepted 以外からは取り消せません（invalid_transition）', () => {
      for (const status of ALL_STATUSES.filter((status) => status !== 'accepted')) {
        expect(errorCodeOf(() => service.revoke(status, returnRequest()))).toBe('invalid_transition');
      }
    });
  });

  describe('枠の判定（isCellOpen。B1 の CoverageCalculator を使う）', () => {
    const base = {
      areaLabel: CAMPAIGN_INPUTS.minamiTown,
      season: 'spring' as const,
      rule: ACCEPT_RULE_INPUT,
    };

    it('採用数が必要数未満なら募集中です', () => {
      expect(service.isCellOpen({ ...base, required: 2, accepted: 1 })).toBe(true);
    });

    it('採用数が必要数に達したら募集終了です', () => {
      expect(service.isCellOpen({ ...base, required: 1, accepted: 1 })).toBe(false);
    });

    it('採用数が 0 なら、必要数 1 のマスでも募集中です', () => {
      expect(service.isCellOpen({ ...base, required: 1, accepted: 0 })).toBe(true);
    });
  });

  describe('差し戻しの理由の保存形式（reason 列）', () => {
    it('理由のコードと自由記述を往復できます', () => {
      const info = { reasonCode: 'other' as const, freeText: 'text', resubmittable: false };
      expect(ReviewService.decodeReason(ReviewService.encodeReason(info))).toEqual({ reasonCode: 'other', freeText: 'text' });
    });

    it('形の違う値は例外にします', () => {
      expect(() => ReviewService.decodeReason('not-json')).toThrow();
    });
  });

  describe('被写体の推定（補助）の読み取り（subjectFrom）', () => {
    it('区分と確信度とモデルがあれば、推定ありとします', () => {
      expect(
        ReviewService.subjectFrom({ item: 'subject_kind', verdict: 'info', reason: 'closeup', confidence: 0.9, model: 'm' }),
      ).toEqual({ status: 'estimated', kind: 'closeup', confidence: 0.9, model: 'm' });
    });

    it('行が無い、または区分が想定外なら、推定なしとします', () => {
      expect(ReviewService.subjectFrom(null)).toEqual({ status: 'none' });
      expect(ReviewService.subjectFrom({ item: 'subject_kind', verdict: 'info', reason: 'unknown', confidence: 0.9, model: 'm' })).toEqual({
        status: 'none',
      });
    });
  });
});
