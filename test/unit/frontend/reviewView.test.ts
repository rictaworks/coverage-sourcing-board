import { describe, expect, it } from 'vitest';
import { RULE_DEFAULTS } from '../../../src/config/defaults';
import { CHECK_ITEM_LABELS, CHECK_REASON_TEXT } from '../../../src/config/strings/checks';
import { RETURN_REASON_LABELS } from '../../../src/config/strings/returnReasons';
import { SUBJECT_HINT_STRINGS, SUBJECT_KIND_LABELS } from '../../../src/config/strings/subjectHint';
import { STATUS_LABELS } from '../../../src/config/strings/status';
import { REVIEW_QUEUE_STRINGS } from '../../../src/config/strings/reviewQueue';
import { TEXT_SEPARATORS } from '../../../src/config/strings/common';
import { LIMITS } from '../../../src/config/limits';
import { ReturnFormValidator, ReviewViewBuilder } from '../../../src/frontend/lib/api/reviewApi';
import type { ReviewQueueView } from '../../../src/core/review/reviewService';
import type { SubjectHintResult } from '../../../src/core/types';

/** 確認キューの応答を作る。候補の ID は、待ちの投稿か採用済みの投稿を指す。 */
function queueWith(subject: SubjectHintResult, candidateIds: readonly string[] = []): ReviewQueueView {
  return {
    items: [
      {
        id: 'pending-1',
        cellId: 'cell-1',
        shotMonth: 4,
        spotName: 'Spot A',
        caption: 'caption A',
        checks: [{ item: 'focus', verdict: 'review', reasonCode: 'focus_borderline' }],
        subject,
        candidateIds,
      },
      {
        id: 'pending-2',
        cellId: 'cell-1',
        shotMonth: 5,
        spotName: 'Spot A',
        caption: 'caption B',
        checks: [],
        subject: { status: 'none' },
        candidateIds: ['pending-1'],
      },
    ],
    accepted: [
      { id: 'accepted-1', cellId: 'cell-1', shotMonth: 4, spotName: 'Spot A', caption: 'caption C', overQuota: true },
    ],
  };
}

const CELL_LABELS: ReadonlyMap<string, string> = new Map([['cell-1', 'Area A / Spring']]);
const builder = new ReviewViewBuilder();

describe('確認キューの表示の組み立て（D7）', () => {
  it('確信度が 0.59 のときは「判定が確かでない」を添え、0.60 のときは添えない', () => {
    const low = builder.build(queueWith({ status: 'estimated', kind: 'landscape', confidence: 0.59, model: 'm' }), CELL_LABELS);
    const high = builder.build(queueWith({ status: 'estimated', kind: 'landscape', confidence: 0.6, model: 'm' }), CELL_LABELS);
    const lowSubject = low.items[0]?.subject;
    const highSubject = high.items[0]?.subject;
    expect(lowSubject).toMatchObject({ status: 'estimated', uncertain: true, uncertainMessage: SUBJECT_HINT_STRINGS.uncertainMessage });
    expect(highSubject).toMatchObject({ status: 'estimated', uncertain: false, uncertainMessage: null });
    expect(RULE_DEFAULTS.classifyConfidenceMin).toBe(0.6);
  });

  it('推定の区分は表示名に変換する（推定なしは「被写体の推定はありません」）', () => {
    const view = builder.build(queueWith({ status: 'estimated', kind: 'people', confidence: 0.9, model: 'm' }), CELL_LABELS);
    expect(view.items[0]?.subject).toMatchObject({ status: 'estimated', kindLabel: SUBJECT_KIND_LABELS.people });
    expect(view.items[1]?.subject).toEqual({ status: 'none', message: SUBJECT_HINT_STRINGS.noneMessage });
  });

  it('要確認の理由は、項目の名前と理由の文言に変換する', () => {
    const view = builder.build(queueWith({ status: 'none' }), CELL_LABELS);
    expect(view.items[0]?.checks).toEqual([
      {
        item: 'focus',
        label: CHECK_ITEM_LABELS.focus,
        message: CHECK_REASON_TEXT.focus_borderline.message,
        fix: CHECK_REASON_TEXT.focus_borderline.fix,
      },
    ]);
    expect(view.items[1]?.checks).toEqual([]);
  });

  it('マスの名前と画像の経路を付け、重複候補は待ちの投稿と採用済みの投稿から対応づける', () => {
    const view = builder.build(queueWith({ status: 'none' }, ['pending-2', 'accepted-1']), CELL_LABELS);
    const item = view.items[0];
    expect(item?.cellLabel).toBe('Area A / Spring');
    expect(item?.imageUrl).toBe('/api/submissions/pending-1/image');
    expect(item?.duplicates.map((duplicate) => duplicate.id)).toEqual(['pending-2', 'accepted-1']);
    expect(item?.duplicates[0]?.statusLabel).toBe(REVIEW_QUEUE_STRINGS.duplicatePending);
    expect(item?.duplicates[1]?.statusLabel).toBe(STATUS_LABELS.accepted);
    expect(view.accepted[0]).toMatchObject({ id: 'accepted-1', overQuota: true });
  });

  it('対応の取れない候補やマスは、代わりの値を作らず例外にする', () => {
    expect(() => builder.build(queueWith({ status: 'none' }, ['missing-id']), CELL_LABELS)).toThrow();
    expect(() => builder.build(queueWith({ status: 'none' }), new Map())).toThrow();
  });

  it('マスの名前は、キャンペーンの区分値と季節の名前から作る', () => {
    const labels = ReviewViewBuilder.cellLabels(
      {
        areas: [{ id: 'area-a', prefecture: 'tokushima', label: 'Area A' }],
        periods: [{ id: 'spring', label: 'Spring', months: [3, 4, 5] }],
      },
      {
        cells: [{ cellId: 'cell-1', areaId: 'area-a', periodId: 'spring', accepted: 0, pendingReview: 0, required: 1, closed: false }],
      },
    );
    expect(labels.get('cell-1')).toBe(`Area A${TEXT_SEPARATORS.compound}Spring`);
  });
});

describe('差し戻しの入力の検証（D7）', () => {
  const validator = new ReturnFormValidator();

  it('理由が選ばれていなければ、理由の文言を返す', () => {
    const result = validator.validate({ reasonCode: null, freeText: '', resubmittable: true });
    expect(result).toEqual({ ok: false, message: REVIEW_QUEUE_STRINGS.reasonMissing });
  });

  it('理由が「その他」のときは、自由記述が必要で、空白は除いて送る', () => {
    const missing = validator.validate({ reasonCode: 'other', freeText: '   ', resubmittable: false });
    expect(missing).toEqual({ ok: false, message: REVIEW_QUEUE_STRINGS.freeTextMissing });
    const ok = validator.validate({ reasonCode: 'other', freeText: '  text  ', resubmittable: false });
    expect(ok).toEqual({ ok: true, request: { reasonCode: 'other', freeText: 'text', resubmittable: false } });
  });

  it('自由記述が上限を超えるとき、再投稿の可否が未選択のとき、理由の選択肢の文言を使う', () => {
    const tooLong = validator.validate({
      reasonCode: 'ratio',
      freeText: 'a'.repeat(LIMITS.returnReasonMaxChars + 1),
      resubmittable: true,
    });
    expect(tooLong).toEqual({ ok: false, message: REVIEW_QUEUE_STRINGS.freeTextTooLong(LIMITS.returnReasonMaxChars) });
    const notChosen = validator.validate({ reasonCode: 'ratio', freeText: '', resubmittable: null });
    expect(notChosen).toEqual({ ok: false, message: REVIEW_QUEUE_STRINGS.resubmittableMissing });
    expect(RETURN_REASON_LABELS.ratio.length).toBeGreaterThan(0);
  });
});
