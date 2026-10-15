import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ERROR_MESSAGES } from '../../../../src/config/strings/campaign';
import type { CampaignInput } from '../../../../src/core/campaign/defineCampaign';
import { defineCampaign } from '../../../../src/core/campaign/defineCampaign';
import { CampaignError } from '../../../../src/core/campaign/period';
import {
  ACCEPT_RULE_INPUT,
  CAMPAIGN_INPUTS,
  CELL_ORDER_FULL,
  REQUIRED_ENTRIES_ALL,
  REQUIRED_ENTRIES_DUPLICATE,
  REQUIRED_ENTRIES_PARTIAL,
  REQUIRED_ENTRIES_UNKNOWN,
  SEASON_KEYS,
} from '../../../fixtures/campaign-inputs';

const fixedId = (): string => 'campaign-001';

const baseInput = (overrides: Partial<CampaignInput> = {}): CampaignInput => ({
  name: CAMPAIGN_INPUTS.name,
  areas: CAMPAIGN_INPUTS.areas,
  seasons: [SEASON_KEYS.spring, SEASON_KEYS.winter],
  required: 2,
  rule: ACCEPT_RULE_INPUT,
  ...overrides,
});

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

describe('defineCampaign（キャンペーンの定義）', () => {
  it('ID、名称、区分値、季節、マスの一覧を返します', () => {
    const campaign = defineCampaign(baseInput(), fixedId);
    expect(campaign.id).toBe('campaign-001');
    expect(campaign.name).toBe(CAMPAIGN_INPUTS.name);
    expect(campaign.areas.map((area) => area.label)).toEqual(CAMPAIGN_INPUTS.areas);
    expect(campaign.periods.map((period) => period.season)).toEqual(['spring', 'winter']);
    expect(campaign.cells).toHaveLength(CAMPAIGN_INPUTS.areas.length * 2);
  });

  it('マスの順は区分値の並び順、その中で季節の並び順になります', () => {
    const campaign = defineCampaign(baseInput(), fixedId);
    expect(campaign.cells.map((cell) => `${cell.area.label}/${cell.period.season}`)).toEqual(CELL_ORDER_FULL);
  });

  it('複合地域を分割せず、1 つの区分値として保ちます', () => {
    const campaign = defineCampaign(baseInput({ areas: [CAMPAIGN_INPUTS.compoundSpaced] }), fixedId);
    expect(campaign.areas.map((area) => area.label)).toEqual([CAMPAIGN_INPUTS.compound]);
  });

  it('全角と半角の違いだけの区分値を重複として拒否します', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ areas: CAMPAIGN_INPUTS.duplicateAreas }), fixedId))).toBe(
      'AREA_DUPLICATE',
    );
  });

  it('空白の位置だけが違う複合地域を重複として拒否します', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ areas: CAMPAIGN_INPUTS.duplicateCompound }), fixedId))).toBe(
      'AREA_DUPLICATE',
    );
  });

  it('区分値が 1 つもなければ拒否します（AREA_NONE）', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ areas: [] }), fixedId))).toBe('AREA_NONE');
  });

  it('名称が空なら拒否します（NAME_EMPTY）', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ name: CAMPAIGN_INPUTS.blankName }), fixedId))).toBe(
      'NAME_EMPTY',
    );
  });

  it('名称に制御文字・ゼロ幅の文字・双方向の制御文字があれば拒否します（NAME_INVALID）', () => {
    for (const name of ['A\u0007B', 'A\u200BB', 'A\u202EB']) {
      expect(errorCodeOf(() => defineCampaign(baseInput({ name }), fixedId))).toBe('NAME_INVALID');
    }
  });

  it('季節が 1 つもなければ拒否します（SEASON_NONE）', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ seasons: [] }), fixedId))).toBe('SEASON_NONE');
  });

  it('季節に当たらない値は拒否します（SEASON_INVALID）', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ seasons: ['monsoon' as never] }), fixedId))).toBe(
      'SEASON_INVALID',
    );
  });

  it('同じ季節の重複は拒否します（SEASON_DUPLICATE）', () => {
    expect(
      errorCodeOf(() => defineCampaign(baseInput({ seasons: [SEASON_KEYS.spring, SEASON_KEYS.spring] }), fixedId)),
    ).toBe('SEASON_DUPLICATE');
  });

  it.each([0, 1.5, -1, Number.NaN])('一律の必要数 %s は拒否します（REQUIRED_INVALID）', (required) => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ required }), fixedId))).toBe('REQUIRED_INVALID');
  });

  it('個別の必要数は、マスごとの値になります', () => {
    const campaign = defineCampaign(baseInput({ required: REQUIRED_ENTRIES_ALL }), fixedId);
    expect(campaign.cells.map((cell) => cell.required)).toEqual([1, 4, 2, 3, 5, 6, 7, 8]);
  });

  it('個別の必要数で、指定のないマスがあれば拒否します（REQUIRED_MISSING）', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ required: REQUIRED_ENTRIES_PARTIAL }), fixedId))).toBe(
      'REQUIRED_MISSING',
    );
  });

  it('個別の必要数で、同じマスが重複すれば拒否します（REQUIRED_DUPLICATE）', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ required: REQUIRED_ENTRIES_DUPLICATE }), fixedId))).toBe(
      'REQUIRED_DUPLICATE',
    );
  });

  it('個別の必要数で、キャンペーンにないマスは拒否します（REQUIRED_UNKNOWN_CELL）', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput({ required: REQUIRED_ENTRIES_UNKNOWN }), fixedId))).toBe(
      'REQUIRED_UNKNOWN_CELL',
    );
  });

  it('個別の必要数の値が不正なら拒否します（REQUIRED_INVALID）', () => {
    const required = [{ area: CAMPAIGN_INPUTS.minamiTown, season: SEASON_KEYS.spring, required: 0 }];
    expect(errorCodeOf(() => defineCampaign(baseInput({ required }), fixedId))).toBe('REQUIRED_INVALID');
  });

  it('受入条件の値が範囲外なら拒否します（RULE_INVALID）', () => {
    const cases = [
      { ...ACCEPT_RULE_INPUT, ratio: 0 },
      { ...ACCEPT_RULE_INPUT, tolerance: -0.1 },
      { ...ACCEPT_RULE_INPUT, tolerance: 1 },
      { ...ACCEPT_RULE_INPUT, minShortPx: 0 },
      { ...ACCEPT_RULE_INPUT, minShortPx: 800.5 },
      { ...ACCEPT_RULE_INPUT, blurMin: -1 },
      { ...ACCEPT_RULE_INPUT, dupDistance: -1 },
      { ...ACCEPT_RULE_INPUT, maxInputBytes: 0 },
      { ...ACCEPT_RULE_INPUT, maxPixels: 0 },
      { ...ACCEPT_RULE_INPUT, formats: [] },
    ];
    for (const rule of cases) {
      expect(errorCodeOf(() => defineCampaign(baseInput({ rule }), fixedId))).toBe('RULE_INVALID');
    }
  });

  it('ID の生成が空の文字列を返したら拒否します（ID_INVALID）', () => {
    expect(errorCodeOf(() => defineCampaign(baseInput(), () => ''))).toBe('ID_INVALID');
  });

  it('Campaign.cell は、表記ゆれを含む区分値と季節からマスを返します', () => {
    const campaign = defineCampaign(baseInput(), fixedId);
    const cell = campaign.cell(`${CAMPAIGN_INPUTS.paddedSpaces}${CAMPAIGN_INPUTS.compoundSpaced}`, SEASON_KEYS.winter);
    expect(cell.area.label).toBe(CAMPAIGN_INPUTS.compound);
    expect(cell.period.season).toBe(SEASON_KEYS.winter);
  });

  it('Campaign.cell は、キャンペーンにないマスを拒否します（CELL_NOT_FOUND）', () => {
    const campaign = defineCampaign(baseInput(), fixedId);
    expect(errorCodeOf(() => campaign.cell(CAMPAIGN_INPUTS.anan, SEASON_KEYS.spring))).toBe('CELL_NOT_FOUND');
  });

  it('Campaign.cell は、不正な季節を拒否します（SEASON_INVALID）', () => {
    const campaign = defineCampaign(baseInput(), fixedId);
    expect(errorCodeOf(() => campaign.cell(CAMPAIGN_INPUTS.anan, 'monsoon'))).toBe('SEASON_INVALID');
  });

  it('例外のコードに対応する表示用の文言が、設定にあります', () => {
    expect(CAMPAIGN_ERROR_MESSAGES.AREA_DUPLICATE.length).toBeGreaterThan(0);
    expect(CAMPAIGN_ERROR_MESSAGES.RULE_INVALID.length).toBeGreaterThan(0);
    expect(CAMPAIGN_ERROR_MESSAGES.REQUIRED_MISSING.length).toBeGreaterThan(0);
  });
});
