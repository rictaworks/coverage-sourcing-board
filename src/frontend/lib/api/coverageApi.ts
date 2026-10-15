import { PREFECTURE_CODES, type CampaignResponse, type CellCoverage, type CoverageResponse, type PrefectureCode } from '../../../core/api/contract';
import { PREFECTURE_NAMES } from '../../../config/strings/prefectures';
import { COVERAGE_API_CODES, COVERAGE_API_PATHS, COVERAGE_STRINGS } from '../../../config/strings/coverage';
import { ApiClient, ApiError } from '../apiClient';

/** マスの状態。募集中（未充足）か募集終了か。画面では採用数から計算せず、API の closed を使う。 */
export type CellState = 'unfilled' | 'closed';

export interface SeasonColumnView {
  readonly id: string;
  readonly label: string;
}

export interface CoverageCellView {
  readonly cellId: string;
  readonly state: CellState;
  readonly accepted: number;
  readonly pendingReview: number;
  readonly required: number;
}

export interface CoverageRowView {
  readonly areaId: string;
  readonly areaLabel: string;
  readonly cells: readonly CoverageCellView[];
}

export interface PrefectureGroupView {
  readonly prefecture: PrefectureCode;
  readonly label: string;
  readonly rows: readonly CoverageRowView[];
}

/** いま求めている場所の 1 件。並びは API の priority の順のまま。 */
export interface WantedItemView {
  readonly cellId: string;
  readonly areaId: string;
  readonly areaLabel: string;
  readonly periodId: string;
  readonly seasonLabel: string;
  readonly accepted: number;
  readonly required: number;
  readonly remaining: number;
}

export interface CoverageView {
  readonly seasons: readonly SeasonColumnView[];
  readonly groups: readonly PrefectureGroupView[];
  readonly wanted: readonly WantedItemView[];
}

/** 充足マップの読み込みの結果。キャンペーンが無いときは notFound。 */
export type CoverageLoadResult =
  | { readonly kind: 'ready'; readonly campaignName: string; readonly view: CoverageView }
  | { readonly kind: 'notFound' };

/** マスの ID（区分値の ID と期間の ID の組）から、応答の 1 件を引くための鍵。 */
function cellKey(areaId: string, periodId: string): string {
  return JSON.stringify([areaId, periodId]);
}

/**
 * 充足の API の応答から、画面の表と一覧の形を作ります。
 * 並び順（県・季節・いま求めている場所）と、募集終了の判定は API の値をそのまま使い、画面では計算しません。
 * 対応が取れない応答は、代わりの値を作らず例外にします。
 */
export class CoverageViewBuilder {
  build(campaign: Pick<CampaignResponse, 'areas' | 'periods'>, coverage: CoverageResponse): CoverageView {
    const seasons = this.seasonsOf(campaign);
    const cellByKey = new Map<string, CellCoverage>(
      coverage.cells.map((cell) => [cellKey(cell.areaId, cell.periodId), cell]),
    );
    const expectedCount = campaign.areas.length * campaign.periods.length;
    if (coverage.cells.length !== expectedCount || cellByKey.size !== expectedCount) {
      throw new Error(COVERAGE_STRINGS.viewMismatch);
    }
    const areaLabelById = new Map(campaign.areas.map((area) => [area.id, area.label]));
    const seasonLabelById = new Map(campaign.periods.map((period) => [period.id, period.label]));

    const groups = PREFECTURE_CODES.map((prefecture) => {
      const rows = campaign.areas
        .filter((area) => area.prefecture === prefecture)
        .map((area) => ({
          areaId: area.id,
          areaLabel: area.label,
          cells: seasons.map((season) => {
            const cell = this.cellOf(cellByKey, area.id, season.id);
            return {
              cellId: cell.cellId,
              state: cell.closed ? ('closed' as const) : ('unfilled' as const),
              accepted: cell.accepted,
              pendingReview: cell.pendingReview,
              required: cell.required,
            };
          }),
        }));
      return { prefecture, label: PREFECTURE_NAMES[prefecture], rows };
    }).filter((group) => group.rows.length > 0);

    const wanted = coverage.priority.map((cellId) => {
      const cell = coverage.cells.find((candidate) => candidate.cellId === cellId);
      if (cell === undefined) {
        throw new Error(COVERAGE_STRINGS.viewMismatch);
      }
      const areaLabel = areaLabelById.get(cell.areaId);
      const seasonLabel = seasonLabelById.get(cell.periodId);
      if (areaLabel === undefined || seasonLabel === undefined) {
        throw new Error(COVERAGE_STRINGS.viewMismatch);
      }
      return {
        cellId,
        areaId: cell.areaId,
        areaLabel,
        periodId: cell.periodId,
        seasonLabel,
        accepted: cell.accepted,
        required: cell.required,
        remaining: cell.required - cell.accepted,
      };
    });

    return { seasons, groups, wanted };
  }

  /** 季節の列は、期間の最初の月の順（3 月に始まる春・夏・秋・冬）。期間の ID は決め打ちしません。 */
  private seasonsOf(campaign: Pick<CampaignResponse, 'periods'>): SeasonColumnView[] {
    return campaign.periods
      .map((period) => {
        const firstMonth = period.months[0];
        if (firstMonth === undefined) {
          throw new Error(COVERAGE_STRINGS.viewMismatch);
        }
        return { id: period.id, label: period.label, firstMonth };
      })
      .sort((a, b) => a.firstMonth - b.firstMonth)
      .map(({ id, label }) => ({ id, label }));
  }

  private cellOf(cellByKey: ReadonlyMap<string, CellCoverage>, areaId: string, periodId: string): CellCoverage {
    const cell = cellByKey.get(cellKey(areaId, periodId));
    if (cell === undefined) {
      throw new Error(COVERAGE_STRINGS.viewMismatch);
    }
    return cell;
  }
}

/** 充足マップの API を読みます。キャンペーンが無いときだけ notFound を返し、ほかの失敗は例外のまま外に出します。 */
export class CoverageApi {
  constructor(
    private readonly client: ApiClient = new ApiClient(),
    private readonly builder: CoverageViewBuilder = new CoverageViewBuilder(),
  ) {}

  async load(): Promise<CoverageLoadResult> {
    try {
      const campaign = await this.client.get<CampaignResponse>(COVERAGE_API_PATHS.campaign);
      const coverage = await this.client.get<CoverageResponse>(COVERAGE_API_PATHS.coverage);
      return { kind: 'ready', campaignName: campaign.name, view: this.builder.build(campaign, coverage) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === COVERAGE_API_CODES.campaignNotFound) {
        return { kind: 'notFound' };
      }
      throw error;
    }
  }
}
