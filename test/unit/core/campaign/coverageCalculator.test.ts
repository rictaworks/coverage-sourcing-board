import { describe, expect, it } from 'vitest';
import type { Campaign } from '../../../../src/core/campaign/campaign';
import { CoverageCalculator } from '../../../../src/core/campaign/coverageCalculator';
import type { CampaignInput } from '../../../../src/core/campaign/defineCampaign';
import { defineCampaign } from '../../../../src/core/campaign/defineCampaign';
import { CampaignError } from '../../../../src/core/campaign/period';
import {
  ACCEPT_RULE_INPUT,
  CAMPAIGN_INPUTS,
  CELL_ORDER_TWO_TOWNS,
  REQUIRED_ENTRIES_GAP,
  SEASON_KEYS,
} from '../../../fixtures/campaign-inputs';

const CAMPAIGN_ID = 'campaign-002';

const campaignWith = (required: CampaignInput['required']): Campaign =>
  defineCampaign(
    {
      name: CAMPAIGN_INPUTS.name,
      areas: CAMPAIGN_INPUTS.areasWithTwoTowns,
      seasons: [SEASON_KEYS.spring, SEASON_KEYS.winter],
      required,
      rule: ACCEPT_RULE_INPUT,
    },
    () => CAMPAIGN_ID,
  );

const cellIdAt = (campaign: Campaign, area: string, season: string): string =>
  campaign.cell(area, season as 'spring' | 'winter').id;

const errorCodeOf = (action: () => unknown): string => {
  try {
    action();
  } catch (error) {
    if (error instanceof CampaignError) {
      return error.code;
    }
    throw error;
  }
  throw new Error('no error was thrown');
};

describe('CoverageCalculator.compute（充足計算）', () => {
  const calculator = new CoverageCalculator();

  it('採用が無いときは、すべてのマスが募集中になります', () => {
    const report = calculator.compute(campaignWith(2), []);
    expect(report.cells).toHaveLength(CELL_ORDER_TWO_TOWNS.length);
    expect(report.cells.every((cell) => cell.open)).toBe(true);
    expect(report.wanted).toHaveLength(CELL_ORDER_TWO_TOWNS.length);
  });

  it('確認待ちは枠に含めず、募集終了にもしません', () => {
    const campaign = campaignWith(2);
    const cellId = cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.spring);
    const report = calculator.compute(campaign, [{ campaignId: CAMPAIGN_ID, cellId, accepted: 0, pending: 9 }]);
    const status = report.cells.find((cell) => cell.cellId === cellId);
    expect(status?.open).toBe(true);
    expect(status?.accepted).toBe(0);
    expect(status?.pending).toBe(9);
  });

  it('採用数が必要数に達したマスは募集終了になり、「いま求めている場所」に含めません', () => {
    const campaign = campaignWith(2);
    const cellId = cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.spring);
    const report = calculator.compute(campaign, [{ campaignId: CAMPAIGN_ID, cellId, accepted: 2, pending: 0 }]);
    expect(report.cells.find((cell) => cell.cellId === cellId)?.open).toBe(false);
    expect(report.wanted.map((cell) => cell.cellId)).not.toContain(cellId);
  });

  it('採用数が必要数を超えたマスも募集終了です', () => {
    const campaign = campaignWith(2);
    const cellId = cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.spring);
    const report = calculator.compute(campaign, [{ campaignId: CAMPAIGN_ID, cellId, accepted: 3, pending: 0 }]);
    expect(report.cells.find((cell) => cell.cellId === cellId)?.open).toBe(false);
  });

  it('採用を取り消して採用数が減ると、マスは再び募集中に戻ります', () => {
    const campaign = campaignWith(2);
    const cellId = cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.spring);
    const full = calculator.compute(campaign, [{ campaignId: CAMPAIGN_ID, cellId, accepted: 2, pending: 0 }]);
    const revoked = calculator.compute(campaign, [{ campaignId: CAMPAIGN_ID, cellId, accepted: 1, pending: 0 }]);
    expect(full.wanted.map((cell) => cell.cellId)).not.toContain(cellId);
    expect(revoked.wanted.map((cell) => cell.cellId)).toContain(cellId);
  });

  it('充足率（採用数／必要数）の低い順に並べます', () => {
    const campaign = campaignWith(2);
    const half = cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.spring);
    const empty = cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.winter);
    const report = calculator.compute(campaign, [{ campaignId: CAMPAIGN_ID, cellId: half, accepted: 1, pending: 0 }]);
    expect(report.wanted[0].cellId).toBe(empty);
    expect(report.wanted[report.wanted.length - 1].cellId).toBe(half);
  });

  it('充足率が同じなら、必要数との差の大きい順に並べます', () => {
    const campaign = campaignWith(REQUIRED_ENTRIES_GAP);
    const report = calculator.compute(campaign, []);
    const order = report.wanted.map((cell) => cell.cellId);
    expect(order).toEqual([
      cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.winter),
      cellIdAt(campaign, CAMPAIGN_INPUTS.kaiyoTown, SEASON_KEYS.winter),
      cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.spring),
      cellIdAt(campaign, CAMPAIGN_INPUTS.kaiyoTown, SEASON_KEYS.spring),
    ]);
  });

  it('並び順は毎回同じになり、同率・同じ差のときは区分値の並び順になります', () => {
    const campaign = campaignWith(2);
    const first = calculator.compute(campaign, []);
    const second = calculator.compute(campaign, []);
    expect(second.wanted).toEqual(first.wanted);
    expect(first.wanted.map((cell) => cell.cellId)).toEqual(campaign.cells.map((cell) => cell.id));
  });

  it('キャンペーンにないマスの件数は拒否します（COUNT_UNKNOWN_CELL）', () => {
    const campaign = campaignWith(2);
    expect(errorCodeOf(() => calculator.compute(campaign, [{ campaignId: CAMPAIGN_ID, cellId: 'no-such-cell', accepted: 0, pending: 0 }]))).toBe(
      'COUNT_UNKNOWN_CELL',
    );
  });

  it('同じマスの件数が重複していれば拒否します（COUNT_DUPLICATE）', () => {
    const campaign = campaignWith(2);
    const cellId = cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.spring);
    expect(
      errorCodeOf(() =>
        calculator.compute(campaign, [
          { campaignId: CAMPAIGN_ID, cellId, accepted: 0, pending: 0 },
          { campaignId: CAMPAIGN_ID, cellId, accepted: 1, pending: 0 },
        ]),
      ),
    ).toBe('COUNT_DUPLICATE');
  });

  it('件数が負の数や小数なら拒否します（COUNT_INVALID）', () => {
    const campaign = campaignWith(2);
    const cellId = cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.spring);
    expect(errorCodeOf(() => calculator.compute(campaign, [{ campaignId: CAMPAIGN_ID, cellId, accepted: -1, pending: 0 }]))).toBe(
      'COUNT_INVALID',
    );
    expect(errorCodeOf(() => calculator.compute(campaign, [{ campaignId: CAMPAIGN_ID, cellId, accepted: 0, pending: 1.5 }]))).toBe(
      'COUNT_INVALID',
    );
  });

  it('件数のキャンペーン ID が一致しなければ拒否します（COUNT_CAMPAIGN_MISMATCH）', () => {
    const campaign = campaignWith(2);
    const cellId = cellIdAt(campaign, CAMPAIGN_INPUTS.minamiTown, SEASON_KEYS.spring);
    expect(
      errorCodeOf(() => calculator.compute(campaign, [{ campaignId: 'other-campaign', cellId, accepted: 1, pending: 0 }])),
    ).toBe('COUNT_CAMPAIGN_MISMATCH');
  });
});
