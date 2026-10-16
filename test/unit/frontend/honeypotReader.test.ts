import { describe, expect, it } from 'vitest';
import { SUBMIT_DEV_ERRORS } from '../../../src/config/strings/submit';
import { HoneypotReader } from '../../../src/frontend/lib/submit/honeypotReader';

describe('HoneypotReader（ハニーポット欄の読み取り）', () => {
  it('参照が null のときは、空として送らず例外にする', () => {
    expect(() => new HoneypotReader().read({ current: null })).toThrow(SUBMIT_DEV_ERRORS.honeypotMissing);
  });

  it('欄があれば、その値をそのまま返す（空でも、値があっても）', () => {
    const reader = new HoneypotReader();
    expect(reader.read({ current: { value: '' } })).toBe('');
    expect(reader.read({ current: { value: 'http://spam.example' } })).toBe('http://spam.example');
  });
});
