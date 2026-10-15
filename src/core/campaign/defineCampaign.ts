import { normalizeText } from '../text/normalize';
import type { AcceptRule } from '../types';
import { Area } from './area';
import { Campaign } from './campaign';
import { Cell } from './cell';
import { CampaignError, Period, type Season } from './period';

/** 個別の必要数の 1 件（区分値・季節・必要数）。 */
export interface RequiredEntry {
  readonly area: string;
  readonly season: Season;
  readonly required: number;
}

/** キャンペーンの入力（requirements 3.1）。 */
export interface CampaignInput {
  readonly name: string;
  readonly areas: readonly string[];
  readonly seasons: readonly Season[];
  /** 一律の必要数、または全マスの個別の必要数。 */
  readonly required: number | readonly RequiredEntry[];
  readonly rule: AcceptRule;
}

const IMAGE_FORMATS: readonly string[] = ['jpeg', 'png'];

/** キャンペーンを検証して作ります。ID は引数の生成関数から受け取ります（外部に依存しないため）。 */
export class CampaignDefiner {
  private readonly newId: () => string;

  constructor(newId: () => string) {
    this.newId = newId;
  }

  define(input: CampaignInput): Campaign {
    const name = normalizeText(input.name);
    if (name === '') {
      throw new CampaignError('NAME_EMPTY');
    }
    CampaignDefiner.assertRule(input.rule);
    const id = this.newId();
    if (typeof id !== 'string' || id === '') {
      throw new CampaignError('ID_INVALID');
    }
    const areas = CampaignDefiner.buildAreas(input.areas);
    const periods = CampaignDefiner.buildPeriods(input.seasons);
    const cells = CampaignDefiner.buildCells(areas, periods, input.required);
    return new Campaign(id, name, areas, periods, input.rule, cells);
  }

  private static buildAreas(raws: readonly string[]): Area[] {
    if (raws.length === 0) {
      throw new CampaignError('AREA_NONE');
    }
    const areas = raws.map((raw) => Area.fromLabel(raw));
    if (new Set(areas.map((area) => area.label)).size !== areas.length) {
      throw new CampaignError('AREA_DUPLICATE');
    }
    return areas;
  }

  private static buildPeriods(seasons: readonly Season[]): Period[] {
    if (seasons.length === 0) {
      throw new CampaignError('SEASON_NONE');
    }
    const periods = seasons.map((season) => Period.fromSeason(season));
    if (new Set(periods.map((period) => period.season)).size !== periods.length) {
      throw new CampaignError('SEASON_DUPLICATE');
    }
    return periods;
  }

  private static buildCells(
    areas: readonly Area[],
    periods: readonly Period[],
    required: number | readonly RequiredEntry[],
  ): Cell[] {
    if (typeof required === 'number') {
      return areas.flatMap((area) => periods.map((period) => new Cell(area, period, required)));
    }
    const requiredById = CampaignDefiner.indexRequiredEntries(required);
    const knownIds = new Set(areas.flatMap((area) => periods.map((period) => Cell.idOf(area.label, period.season))));
    for (const id of requiredById.keys()) {
      if (!knownIds.has(id)) {
        throw new CampaignError('REQUIRED_UNKNOWN_CELL');
      }
    }
    if (knownIds.size !== requiredById.size) {
      throw new CampaignError('REQUIRED_MISSING');
    }
    return areas.flatMap((area) =>
      periods.map((period) => {
        const value = requiredById.get(Cell.idOf(area.label, period.season));
        if (value === undefined) {
          throw new CampaignError('REQUIRED_MISSING');
        }
        return new Cell(area, period, value);
      }),
    );
  }

  private static indexRequiredEntries(entries: readonly RequiredEntry[]): Map<string, number> {
    const index = new Map<string, number>();
    for (const entry of entries) {
      const id = Cell.idOf(normalizeText(entry.area), entry.season);
      if (index.has(id)) {
        throw new CampaignError('REQUIRED_DUPLICATE');
      }
      if (!Number.isInteger(entry.required) || entry.required < 1) {
        throw new CampaignError('REQUIRED_INVALID');
      }
      index.set(id, entry.required);
    }
    return index;
  }

  private static assertRule(rule: AcceptRule): void {
    const isPositiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0;
    const isNonNegativeInteger = (value: number): boolean => Number.isInteger(value) && value >= 0;
    const valid =
      Number.isFinite(rule.ratio) &&
      rule.ratio > 0 &&
      Number.isFinite(rule.tolerance) &&
      rule.tolerance >= 0 &&
      rule.tolerance < 1 &&
      rule.orientation === 'landscape' &&
      rule.formats.length > 0 &&
      rule.formats.every((format) => IMAGE_FORMATS.includes(format)) &&
      isPositiveInteger(rule.minShortPx) &&
      Number.isFinite(rule.blurMin) &&
      rule.blurMin >= 0 &&
      isNonNegativeInteger(rule.dupDistance) &&
      typeof rule.daytimeRequired === 'boolean' &&
      isPositiveInteger(rule.maxInputBytes) &&
      isPositiveInteger(rule.maxPixels);
    if (!valid) {
      throw new CampaignError('RULE_INVALID');
    }
  }
}

/** キャンペーンを定義します（requirements 3.1）。検証に失敗すると CampaignError を投げます。 */
export function defineCampaign(input: CampaignInput, newId: () => string): Campaign {
  return new CampaignDefiner(newId).define(input);
}
