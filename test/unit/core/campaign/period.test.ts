import { describe, expect, it } from 'vitest';
import { CampaignError, Period } from '../../../../src/core/campaign/period';

describe('Period.fromMonth（月から季節を導出）', () => {
  it.each([
    [3, 'spring'],
    [5, 'spring'],
    [6, 'summer'],
    [8, 'summer'],
    [9, 'autumn'],
    [11, 'autumn'],
    [12, 'winter'],
    [1, 'winter'],
    [2, 'winter'],
  ])('%i 月は %s になります', (month, season) => {
    expect(Period.fromMonth(month).season).toBe(season);
  });

  it('境界の月（2 と 3、5 と 6、8 と 9、11 と 12）で季節が切り替わります', () => {
    expect(Period.fromMonth(2).season).toBe('winter');
    expect(Period.fromMonth(3).season).toBe('spring');
    expect(Period.fromMonth(8).season).toBe('summer');
    expect(Period.fromMonth(9).season).toBe('autumn');
    expect(Period.fromMonth(11).season).toBe('autumn');
    expect(Period.fromMonth(12).season).toBe('winter');
  });

  it('冬は年をまたいでも同じ季節です（12 月と 1 月と 2 月は同一の季節）', () => {
    const december = Period.fromMonth(12);
    const january = Period.fromMonth(1);
    expect(january.season).toBe(december.season);
    expect(january.label).toBe(december.label);
    expect(january.months).toEqual(december.months);
  });

  it('各季節は決まった月の一覧を持ちます', () => {
    expect(Period.fromMonth(4).months).toEqual([3, 4, 5]);
    expect(Period.fromMonth(7).months).toEqual([6, 7, 8]);
    expect(Period.fromMonth(10).months).toEqual([9, 10, 11]);
    expect(Period.fromMonth(12).months).toEqual([1, 2, 12]);
  });

  it.each([0, 13, -1, 1.5, Number.NaN])('月の値 %s は例外にします（コードは MONTH_INVALID）', (month) => {
    expect(() => Period.fromMonth(month)).toThrow(CampaignError);
    try {
      Period.fromMonth(month);
    } catch (error) {
      expect((error as CampaignError).code).toBe('MONTH_INVALID');
    }
  });
});

describe('Period.fromSeason（季節から時間軸の値を作る）', () => {
  it('季節の値から、その季節の Period を作ります', () => {
    expect(Period.fromSeason('autumn').months).toEqual([9, 10, 11]);
  });

  it('季節に当たらない値は例外にします（コードは SEASON_INVALID）', () => {
    expect(() => Period.fromSeason('monsoon' as never)).toThrow(CampaignError);
  });
});
