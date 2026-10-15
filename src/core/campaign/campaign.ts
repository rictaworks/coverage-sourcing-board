import { normalizeText } from '../text/normalize';
import type { AcceptRule } from '../types';
import type { Area } from './area';
import { Cell } from './cell';
import { CampaignError, Period } from './period';

/** キャンペーン。区分値・季節・マスと受入条件を持ちます。作成は defineCampaign で行います。 */
export class Campaign {
  readonly id: string;
  readonly name: string;
  readonly areas: readonly Area[];
  readonly periods: readonly Period[];
  readonly rule: AcceptRule;
  /** マスの一覧（区分値の並び順、その中で季節の並び順）。 */
  readonly cells: readonly Cell[];
  private readonly cellsById: ReadonlyMap<string, Cell>;

  constructor(
    id: string,
    name: string,
    areas: readonly Area[],
    periods: readonly Period[],
    rule: AcceptRule,
    cells: readonly Cell[],
  ) {
    this.id = id;
    this.name = name;
    this.areas = areas;
    this.periods = periods;
    this.rule = rule;
    this.cells = cells;
    this.cellsById = new Map(cells.map((cell) => [cell.id, cell]));
  }

  /** 区分値（表記ゆれを含んでよい）と季節からマスを返します。無ければ例外にします。 */
  cell(areaLabel: string, season: string): Cell {
    const cell = this.cellsById.get(Cell.idOf(normalizeText(areaLabel), Period.fromSeason(season).season));
    if (cell === undefined) {
      throw new CampaignError('CELL_NOT_FOUND');
    }
    return cell;
  }
}
