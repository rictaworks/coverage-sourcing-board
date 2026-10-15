import { describe, expect, it } from 'vitest';
import { shouldLoadAnalytics } from '../../../src/frontend/lib/appEnv';

describe('shouldLoadAnalytics（GA4 を読み込むかの判定）', () => {
  it('APP_ENV が production のときだけ読み込みます', () => {
    expect(shouldLoadAnalytics('production')).toBe(true);
  });

  it.each([undefined, '', 'development', 'Production', ' production', 'staging'])(
    'APP_ENV が %j のときは読み込みません',
    (raw) => {
      expect(shouldLoadAnalytics(raw)).toBe(false);
    },
  );
});
