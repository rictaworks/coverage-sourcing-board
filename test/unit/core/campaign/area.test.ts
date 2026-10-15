import { describe, expect, it } from 'vitest';
import { Area } from '../../../../src/core/campaign/area';
import { CampaignError } from '../../../../src/core/campaign/period';
import { LIMITS } from '../../../../src/config/limits';
import { CAMPAIGN_INPUTS, FORBIDDEN_AREA_LABELS } from '../../../fixtures/campaign-inputs';

describe('Area（区分値。複合地域を 1 つの値として扱う）', () => {
  it('複合地域を分割せず、1 つの区分値として保ちます', () => {
    const area = Area.fromLabel(CAMPAIGN_INPUTS.compoundSpaced);
    expect(area.label).toBe(CAMPAIGN_INPUTS.compound);
  });

  it('複合地域の構成要素を、区切りの順に持ちます', () => {
    expect(Area.fromLabel(CAMPAIGN_INPUTS.compound).components).toEqual([
      CAMPAIGN_INPUTS.minamiTown,
      CAMPAIGN_INPUTS.kaiyoTown,
    ]);
  });

  it('複合地域のどちらの町の名前でも一致と判定します', () => {
    const area = Area.fromLabel(CAMPAIGN_INPUTS.compound);
    expect(area.matchesPlace(CAMPAIGN_INPUTS.minamiTown)).toBe(true);
    expect(area.matchesPlace(CAMPAIGN_INPUTS.kaiyoTown)).toBe(true);
    expect(area.matchesPlace(CAMPAIGN_INPUTS.compound)).toBe(true);
  });

  it('複合地域に含まれない町は一致と判定しません', () => {
    const area = Area.fromLabel(CAMPAIGN_INPUTS.compound);
    expect(area.matchesPlace(CAMPAIGN_INPUTS.mugiTown)).toBe(false);
    expect(area.matchesPlace('')).toBe(false);
  });

  it('全角の空白を含む地名も、正規化してから一致を判定します', () => {
    expect(Area.fromLabel(CAMPAIGN_INPUTS.mugi).matchesPlace(CAMPAIGN_INPUTS.paddedMugi)).toBe(true);
  });

  it('空の区分値は例外にします（コードは AREA_INVALID）', () => {
    expect(() => Area.fromLabel(CAMPAIGN_INPUTS.blankName)).toThrow(CampaignError);
  });

  it('構成要素が空になる区分値（先頭の区切りだけ）は例外にします', () => {
    try {
      Area.fromLabel(CAMPAIGN_INPUTS.leadingSeparator);
      expect.fail('an error should be thrown');
    } catch (error) {
      expect((error as CampaignError).code).toBe('AREA_INVALID');
    }
  });

  it.each(FORBIDDEN_AREA_LABELS)('%s を含む区分値は拒否します（AREA_INVALID）', (_name, raw) => {
    expect(() => Area.fromLabel(raw)).toThrowError(expect.objectContaining({ code: 'AREA_INVALID' }));
  });

  it('長さの上限ちょうどの区分値は受け付け、超えたら拒否します（AREA_TOO_LONG）', () => {
    const max = LIMITS.areaLabelMaxChars;
    expect(Area.fromLabel(CAMPAIGN_INPUTS.longUnit.repeat(max)).label).toHaveLength(max);
    expect(() => Area.fromLabel(CAMPAIGN_INPUTS.longUnit.repeat(max + 1))).toThrowError(
      expect.objectContaining({ code: 'AREA_TOO_LONG' }),
    );
  });
});
