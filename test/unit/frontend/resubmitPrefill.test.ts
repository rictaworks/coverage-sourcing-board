import { describe, expect, it } from 'vitest';
import type { MySubmissionsResponse } from '../../../src/core/api/contract';
import { ResubmitPrefill } from '../../../src/frontend/lib/submit/resubmitPrefill';

const CAMPAIGN = {
  cells: [
    { cellId: 'cell-a-spring', areaId: 'area-a', periodId: 'p1', required: 3 },
    { cellId: 'cell-b-summer', areaId: 'area-b', periodId: 'p2', required: 3 },
  ],
};

function mine(items: Array<{ id: string; cellId: string }>): MySubmissionsResponse {
  return {
    items: items.map((item) => ({ ...item, status: 'returned', createdAt: '2026-10-16T00:00:00Z', returnInfo: null })),
  } as MySubmissionsResponse;
}

describe('ResubmitPrefill（再投稿の初期値）', () => {
  it('元の投稿の ID で引き、マスの区分を初期値にする', () => {
    const response = mine([
      { id: 's1', cellId: 'cell-a-spring' },
      { id: 's2', cellId: 'cell-b-summer' },
    ]);
    expect(new ResubmitPrefill().areaIdOf(response, CAMPAIGN, 's2')).toBe('area-b');
  });

  it('応答に元の投稿が無いときは、推測せず null にする', () => {
    expect(new ResubmitPrefill().areaIdOf(mine([{ id: 's1', cellId: 'cell-a-spring' }]), CAMPAIGN, 'other')).toBeNull();
  });

  it('マスがキャンペーンに無いときは、推測せず null にする', () => {
    expect(new ResubmitPrefill().areaIdOf(mine([{ id: 's1', cellId: 'unknown' }]), CAMPAIGN, 's1')).toBeNull();
  });

  it('撮影月は応答に無いため、初期値を返さない（空のまま）', () => {
    expect('shotMonth' in mine([{ id: 's1', cellId: 'cell-a-spring' }]).items[0]).toBe(false);
    expect(new ResubmitPrefill().monthOf()).toBeNull();
  });
});
