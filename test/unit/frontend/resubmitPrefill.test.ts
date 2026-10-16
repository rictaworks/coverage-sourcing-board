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

  it('応答が shotMonth を返していれば、元の投稿の撮影月を初期値にする', () => {
    const response = {
      items: [
        { id: 's1', cellId: 'cell-a-spring', shotMonth: 4 },
        { id: 's2', cellId: 'cell-b-summer', shotMonth: 7 },
      ],
    } as unknown as MySubmissionsResponse;
    expect(new ResubmitPrefill().monthOf(response, 's2')).toBe(7);
  });

  it('応答に shotMonth が無いときは、推測せず null（空のまま）にする', () => {
    expect(new ResubmitPrefill().monthOf(mine([{ id: 's1', cellId: 'cell-a-spring' }]), 's1')).toBeNull();
  });

  it('元の投稿が無いとき、または shotMonth が 1 から 12 の整数でないときは null にする', () => {
    const bad = (shotMonth: unknown): MySubmissionsResponse =>
      ({ items: [{ id: 's1', cellId: 'cell-a-spring', shotMonth }] }) as unknown as MySubmissionsResponse;
    const prefill = new ResubmitPrefill();
    expect(prefill.monthOf(bad(4), 'other')).toBeNull();
    expect(prefill.monthOf(bad(0), 's1')).toBeNull();
    expect(prefill.monthOf(bad(13), 's1')).toBeNull();
    expect(prefill.monthOf(bad(4.5), 's1')).toBeNull();
    expect(prefill.monthOf(bad('4'), 's1')).toBeNull();
  });
});
