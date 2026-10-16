import { describe, expect, it } from 'vitest';
import { SUBMIT_QUERY_KEYS } from '../../../src/config/strings/submit';

describe('投稿の画面の query 名', () => {
  it('再投稿は D5 の導線と同じ resubmit を読む', () => {
    expect(SUBMIT_QUERY_KEYS.resubmit).toBe('resubmit');
  });
});
