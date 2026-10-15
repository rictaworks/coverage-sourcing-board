import { describe, expect, it } from 'vitest';
import { normalizeText } from '../../../src/core/text/normalize';

describe('normalizeText（表記ゆれの正規化）', () => {
  it('全角の英数字を半角にします', () => {
    expect(normalizeText('ＡＢＣ１２３')).toBe('ABC123'); // hardcode-allow: 入力データ
  });

  it('全角の空白と前後の空白を除き、連続する空白を 1 つにします', () => {
    expect(normalizeText('　美波町　')).toBe('美波町'); // hardcode-allow: 入力データ
    expect(normalizeText('高知県   安芸市')).toBe('高知県 安芸市'); // hardcode-allow: 入力データ
  });

  it('「・」区切りの複合表記は、前後の空白の有無にかかわらず同じ値になります', () => {
    expect(normalizeText('美波町・海陽町')).toBe(normalizeText('美波町・海陽町 ')); // hardcode-allow: 入力データ
    expect(normalizeText('美波町 ・ 海陽町')).toBe('美波町・海陽町'); // hardcode-allow: 入力データ
  });

  it('半角の中点（U+FF65）も「・」として扱います', () => {
    expect(normalizeText('美波町･海陽町')).toBe('美波町・海陽町'); // hardcode-allow: 入力データ
  });

  it('複合表記を分割せず、1 つの値として保ちます', () => {
    expect(normalizeText('美波町・海陽町')).toBe('美波町・海陽町'); // hardcode-allow: 入力データ
  });

  it('異なる地名は同じ値にしません', () => {
    expect(normalizeText('美波町')).not.toBe(normalizeText('海陽町')); // hardcode-allow: 入力データ
    expect(normalizeText('美波町・海陽町')).not.toBe(normalizeText('美波町')); // hardcode-allow: 入力データ
  });

  it('空の文字列は空のままです', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('　 ')).toBe(''); // hardcode-allow: 入力データ
  });
});
