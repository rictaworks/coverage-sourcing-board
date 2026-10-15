import { describe, expect, it } from 'vitest';
import { CHECK_ITEM_LABELS, CHECK_REASON_TEXT, CHECK_ERRORS, SEASON_LABELS } from '../../../../src/config/strings/checks';
import { REASON } from '../../../../src/core/validation/reasonCodes';
import type { CheckItem } from '../../../../src/core/types';
import { VALIDATION_FIXTURES } from '../../../fixtures/validation-inputs';

const ALL_CHECK_ITEMS: readonly CheckItem[] = [
  'format',
  'orientation_ratio',
  'resolution',
  'jpeg_quality',
  'focus',
  'shoot_location',
  'shoot_month_season',
  'daytime',
  'processing',
  'declaration',
  'duplicate_image',
  'duplicate_spot',
  'subject_kind',
];

describe('理由のコードと文言（reasonCodes.ts と checks.ts の対応）', () => {
  it('reasonCodes の全コードに、理由と修正方法の文言があります', () => {
    const codes = Object.values(REASON);
    expect(Object.keys(CHECK_REASON_TEXT).sort()).toEqual([...codes].sort());
  });

  it('理由と修正方法の文言は、空ではなく、です・ます調で終わります', () => {
    for (const text of Object.values(CHECK_REASON_TEXT)) {
      expect(text.message.length).toBeGreaterThan(0);
      expect(text.fix.length).toBeGreaterThan(0);
      expect(text.message.endsWith(VALIDATION_FIXTURES.sentenceEnd)).toBe(true);
      expect(text.fix.endsWith(VALIDATION_FIXTURES.sentenceEnd)).toBe(true);
    }
  });

  it('理由のコードはすべて異なり、英小文字と下線だけで書かれています', () => {
    const codes = Object.values(REASON);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[a-z_]+$/);
    }
  });

  it('判定の項目名は、requirements 3.3 の項目すべてと補助の項目を含みます', () => {
    expect(Object.keys(CHECK_ITEM_LABELS).sort()).toEqual([...ALL_CHECK_ITEMS].sort());
    for (const label of Object.values(CHECK_ITEM_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('季節の表示名は春・夏・秋・冬です', () => {
    expect(Object.values(SEASON_LABELS)).toEqual(VALIDATION_FIXTURES.seasonLabels);
  });

  it('入力の誤りの文言（撮影月）があります', () => {
    expect(CHECK_ERRORS.invalidMonth.endsWith(VALIDATION_FIXTURES.sentenceEnd)).toBe(true);
  });
});
