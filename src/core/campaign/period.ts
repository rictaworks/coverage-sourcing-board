import { CAMPAIGN_ERROR_MESSAGES, type CampaignErrorCode, SEASON_LABELS } from '../../config/strings/campaign';

/** 季節（時間軸の値）。表示名は config の SEASON_LABELS にある。 */
export type Season = keyof typeof SEASON_LABELS;

export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** 季節ごとの月（requirements 3.1）。冬は 12・1・2 月で、年をまたいでも同じ季節です。 */
const SEASON_MONTHS: Readonly<Record<Season, readonly number[]>> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [1, 2, 12],
};

/**
 * キャンペーンのドメインの例外。コードだけを持ち、文言は CAMPAIGN_ERROR_MESSAGES から引く。
 * src/core/campaign のすべてのクラスが、この例外を使う。
 */
export class CampaignError extends Error {
  readonly code: CampaignErrorCode;

  constructor(code: CampaignErrorCode) {
    super(code);
    this.name = 'CampaignError';
    this.code = code;
    if (CAMPAIGN_ERROR_MESSAGES[code] === undefined) {
      throw new Error(`unknown campaign error code: ${code}`);
    }
  }
}

/** 時間軸の値（季節と、その季節の月）。 */
export class Period {
  readonly season: Season;
  readonly label: string;
  readonly months: readonly number[];

  private constructor(season: Season) {
    this.season = season;
    this.label = SEASON_LABELS[season];
    this.months = SEASON_MONTHS[season];
  }

  /** 季節の値（spring など）から Period を作ります。 */
  static fromSeason(season: string): Period {
    if (!(SEASONS as readonly string[]).includes(season)) {
      throw new CampaignError('SEASON_INVALID');
    }
    return new Period(season as Season);
  }

  /** 月（1〜12）から、その月を含む季節の Period を作ります。1〜12 以外は例外にします。 */
  static fromMonth(month: number): Period {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new CampaignError('MONTH_INVALID');
    }
    const season = SEASONS.find((candidate) => SEASON_MONTHS[candidate].includes(month));
    if (season === undefined) {
      throw new CampaignError('MONTH_INVALID');
    }
    return new Period(season);
  }
}
