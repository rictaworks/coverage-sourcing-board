import { describe, expect, it } from 'vitest';
import { resolveAppEnv } from '../../../src/config/env';
import { COMMON_STRINGS } from '../../../src/config/strings/common';

describe('resolveAppEnv（APP_ENV の判定）', () => {
  it('development と production は受け付けます', () => {
    expect(resolveAppEnv('development')).toBe('development');
    expect(resolveAppEnv('production')).toBe('production');
  });

  it.each([undefined, '', 'staging', 'Production', ' production', 'test'])(
    '不正な値 %j は例外にします（フォールバックしません）',
    (raw) => {
      expect(() => resolveAppEnv(raw)).toThrow(COMMON_STRINGS.errorInvalidAppEnv);
    },
  );
});
