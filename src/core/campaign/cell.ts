import { CampaignError, type Period, type Season } from './period';
import type { Area } from './area';

/** マス（区分値 × 季節）。必要数を持ち、採用数から募集終了かを判定します。 */
export class Cell {
  readonly area: Area;
  readonly period: Period;
  readonly required: number;

  constructor(area: Area, period: Period, required: number) {
    if (!Number.isInteger(required) || required < 1) {
      throw new CampaignError('REQUIRED_INVALID');
    }
    this.area = area;
    this.period = period;
    this.required = required;
  }

  /** マスの ID。区分値（正規化済み）と季節から決まるので、同じ組み合わせは同じ ID になります。 */
  get id(): string {
    return Cell.idOf(this.area.label, this.period.season);
  }

  /** 採用数が必要数以上なら募集終了です。確認待ちは含めません。 */
  isFull(acceptedCount: number): boolean {
    Cell.assertCount(acceptedCount);
    return acceptedCount >= this.required;
  }

  static idOf(areaLabel: string, season: Season): string {
    return `${season}:${areaLabel}`;
  }

  /** 件数（0 以上の整数）を確かめます。違えば例外にします。 */
  static assertCount(value: number): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new CampaignError('COUNT_INVALID');
    }
  }
}
