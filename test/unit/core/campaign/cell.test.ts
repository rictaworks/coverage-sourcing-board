import { describe, expect, it } from 'vitest';
import { Area } from '../../../../src/core/campaign/area';
import { Cell } from '../../../../src/core/campaign/cell';
import { CampaignError, Period } from '../../../../src/core/campaign/period';
import { CAMPAIGN_INPUTS, SEASON_KEYS } from '../../../fixtures/campaign-inputs';

const makeCell = (required: number): Cell =>
  new Cell(Area.fromLabel(CAMPAIGN_INPUTS.minamiTown), Period.fromSeason(SEASON_KEYS.spring), required);

describe('Cell.isFull（募集終了の判定）', () => {
  it('採用数が必要数未満なら募集中です', () => {
    expect(makeCell(3).isFull(2)).toBe(false);
  });

  it('採用数が必要数と同数なら募集終了です', () => {
    expect(makeCell(3).isFull(3)).toBe(true);
  });

  it('採用数が必要数を超えていても募集終了です', () => {
    expect(makeCell(3).isFull(4)).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN])('採用数 %s は例外にします（コードは COUNT_INVALID）', (count) => {
    try {
      makeCell(3).isFull(count);
      expect.fail('an error should be thrown');
    } catch (error) {
      expect((error as CampaignError).code).toBe('COUNT_INVALID');
    }
  });
});

describe('Cell（マスの値）', () => {
  it.each([0, -1, 1.5, Number.NaN])('必要数 %s は例外にします（コードは REQUIRED_INVALID）', (required) => {
    try {
      makeCell(required);
      expect.fail('an error should be thrown');
    } catch (error) {
      expect((error as CampaignError).code).toBe('REQUIRED_INVALID');
    }
  });

  it('同じ区分値と季節から作ったマスは、同じ ID になります', () => {
    expect(makeCell(1).id).toBe(makeCell(5).id);
  });
});
