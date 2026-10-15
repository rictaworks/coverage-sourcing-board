import { describe, expect, it } from 'vitest';
import { APP_STRINGS } from '../../src/config/strings';

describe('node project smoke', () => {
  it('reads a TypeScript module under src/ and returns the Japanese page title', () => {
    expect(APP_STRINGS.pageTitle).toBe('風景写真の素材調達（デモ）');
  });
});
