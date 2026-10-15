import { describe, expect, it } from 'vitest';
import { NORMALIZE_EXPECTED_FROM_INPUT, NORMALIZE_INPUTS } from '../../fixtures/normalize-inputs';
import { normalizeText } from '../../../src/core/text/normalize';

describe('normalizeText（表記ゆれの正規化）', () => {
  it('全角の英数字を半角にします', () => {
    expect(normalizeText(NORMALIZE_INPUTS.fullWidthAlnum)).toBe('ABC123');
  });

  it('全角の空白と前後の空白を除き、連続する空白を 1 つにします', () => {
    expect(normalizeText(NORMALIZE_INPUTS.paddedPlace)).toBe(NORMALIZE_EXPECTED_FROM_INPUT.paddedPlace);
    expect(normalizeText(NORMALIZE_INPUTS.multiSpacePlace)).toBe(NORMALIZE_EXPECTED_FROM_INPUT.multiSpacePlace);
  });

  it('「・」区切りの複合表記は、前後の空白の有無にかかわらず同じ値になります', () => {
    expect(normalizeText(NORMALIZE_INPUTS.compound)).toBe(normalizeText(NORMALIZE_INPUTS.compoundTrailingSpace));
    expect(normalizeText(NORMALIZE_INPUTS.compoundSpaced)).toBe(NORMALIZE_EXPECTED_FROM_INPUT.compound);
  });

  it('半角の中点（U+FF65）も「・」として扱います', () => {
    expect(normalizeText(NORMALIZE_INPUTS.compoundHalfWidthDot)).toBe(NORMALIZE_EXPECTED_FROM_INPUT.compound);
  });

  it('複合表記を分割せず、1 つの値として保ちます', () => {
    expect(normalizeText(NORMALIZE_INPUTS.compound)).toBe(NORMALIZE_EXPECTED_FROM_INPUT.compound);
  });

  it('異なる地名は同じ値にしません', () => {
    expect(normalizeText(NORMALIZE_INPUTS.placeA)).not.toBe(normalizeText(NORMALIZE_INPUTS.placeB));
    expect(normalizeText(NORMALIZE_INPUTS.compound)).not.toBe(normalizeText(NORMALIZE_INPUTS.placeA));
  });

  it('空の文字列は空のままです', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(NORMALIZE_INPUTS.onlyFullWidthSpace)).toBe('');
  });
});
