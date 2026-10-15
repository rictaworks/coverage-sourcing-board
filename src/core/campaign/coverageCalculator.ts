import { Cell } from './cell';
import type { Campaign } from './campaign';
import { CampaignError, type Season } from './period';

/** マスごとの件数（採用数と確認待ち数）。件数の無いマスは 0 として扱います。 */
export interface CellCount {
  /** 件数の持ち主のキャンペーン ID（compute に渡すキャンペーンと一致しなければ拒否する）。 */
  readonly campaignId: string;
  readonly cellId: string;
  readonly accepted: number;
  readonly pending: number;
}

/** マスの充足の状態。 */
export interface CellStatus {
  readonly cellId: string;
  readonly areaLabel: string;
  readonly season: Season;
  readonly accepted: number;
  readonly pending: number;
  readonly required: number;
  /** 募集中なら true（採用数が必要数未満）。 */
  readonly open: boolean;
  /** 充足率（採用数 ÷ 必要数）。 */
  readonly fillRatio: number;
  /** 必要数との差（必要数 − 採用数）。 */
  readonly gap: number;
}

/** 充足計算の結果。cells はマスの一覧の順、wanted は募集中のマスを「いま求めている場所」の順に並べたもの。 */
export interface CoverageReport {
  readonly cells: readonly CellStatus[];
  readonly wanted: readonly CellStatus[];
}

/** 充足計算（requirements 3.6）。外部に依存しない純粋な計算です。 */
export class CoverageCalculator {
  compute(campaign: Campaign, counts: readonly CellCount[]): CoverageReport {
    const countById = this.indexCounts(campaign, counts);
    const entries = campaign.cells.map((cell, index) => {
      const count = countById.get(cell.id);
      const accepted = count?.accepted ?? 0;
      const status: CellStatus = {
        cellId: cell.id,
        areaLabel: cell.area.label,
        season: cell.period.season,
        accepted,
        pending: count?.pending ?? 0,
        required: cell.required,
        open: !cell.isFull(accepted),
        fillRatio: accepted / cell.required,
        gap: cell.required - accepted,
      };
      return { status, index, cell };
    });
    const wanted = entries
      .filter((entry) => entry.status.open)
      .sort((a, b) => this.compareWanted(a, b))
      .map((entry) => entry.status);
    return { cells: entries.map((entry) => entry.status), wanted };
  }

  /** 充足率の低い順、同率なら必要数との差の大きい順、さらに同じならマスの並び順（決まった順になる）。 */
  private compareWanted(
    a: { status: CellStatus; index: number },
    b: { status: CellStatus; index: number },
  ): number {
    // 充足率の比較は割り算を使わず、掛け算で行う（丸めの誤差を避ける）。
    const byRatio = a.status.accepted * b.status.required - b.status.accepted * a.status.required;
    if (byRatio !== 0) {
      return byRatio;
    }
    const byGap = b.status.gap - a.status.gap;
    if (byGap !== 0) {
      return byGap;
    }
    return a.index - b.index;
  }

  private indexCounts(campaign: Campaign, counts: readonly CellCount[]): Map<string, CellCount> {
    const knownIds = new Set(campaign.cells.map((cell: Cell) => cell.id));
    const index = new Map<string, CellCount>();
    for (const count of counts) {
      if (count.campaignId !== campaign.id) {
        throw new CampaignError('COUNT_CAMPAIGN_MISMATCH');
      }
      if (!knownIds.has(count.cellId)) {
        throw new CampaignError('COUNT_UNKNOWN_CELL');
      }
      if (index.has(count.cellId)) {
        throw new CampaignError('COUNT_DUPLICATE');
      }
      Cell.assertCount(count.accepted);
      Cell.assertCount(count.pending);
      index.set(count.cellId, count);
    }
    return index;
  }
}
