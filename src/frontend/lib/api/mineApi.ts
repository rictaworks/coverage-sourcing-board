import type { AreaView, MySubmissionItem, PeriodView, ReturnInfo } from '../../../core/api/contract';
import type { SubmissionStatus } from '../../../core/types';
import { RETURN_REASON_LABELS } from '../../../config/strings/returnReasons';
import { STATUS_LABELS, STATUS_NOTICES } from '../../../config/strings/status';
import { MINE_API_PATHS, MINE_STRINGS, MINE_SUBMIT_LINK } from '../../../config/strings/mine';
import { COVERAGE_API_CODES } from '../../../config/strings/coverage';
import { ApiClient, ApiError } from '../apiClient';

/** 自分の投稿の 1 件（契約の MySubmissionItem に、一覧の表示に要る項目を加えた応答）。 */
export interface MineSubmissionItemResponse extends MySubmissionItem {
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
  readonly overQuota: boolean;
}

/** 自分の投稿の一覧の応答（API は作成の古い順で返す）。 */
export interface MineSubmissionsResponse {
  readonly items: readonly MineSubmissionItemResponse[];
}

/** 市町村・季節を引くための、キャンペーンの応答（GET /api/campaign の一部）。 */
export interface MineCampaignLookup {
  readonly areas: readonly AreaView[];
  readonly periods: readonly PeriodView[];
  readonly cells: readonly { readonly cellId: string; readonly areaId: string; readonly periodId: string }[];
}

/** 差し戻しの表示。再投稿できないときは resubmitHref を null にし、理由の文字で示す。 */
export interface MineReturnView {
  readonly reasonLabel: string;
  readonly freeText: string;
  readonly resubmittable: boolean;
  readonly resubmitHref: string | null;
  readonly resubmitNotice: string;
}

/** 一覧の 1 件の表示。文字列はそのままテキストとして描画する（HTML にしない）。 */
export interface MineItemView {
  readonly id: string;
  readonly status: Exclude<SubmissionStatus, 'checking'>;
  readonly statusLabel: string;
  readonly acceptedNotice: string | null;
  readonly areaLabel: string | null;
  readonly seasonLabel: string | null;
  /** マスを引けなかったときの明示的な文言（引けたときは null）。 */
  readonly cellUnknownNotice: string | null;
  readonly shotMonthLabel: string;
  readonly spotName: string;
  readonly caption: string;
  readonly imageSrc: string;
  readonly returnView: MineReturnView | null;
}

export interface MineView {
  readonly items: readonly MineItemView[];
}

/** 再投稿のリンク（/submit?resubmit=<投稿の ID>）。 */
function resubmitHrefOf(id: string): string {
  return `${MINE_SUBMIT_LINK.path}?${MINE_SUBMIT_LINK.resubmitParam}=${encodeURIComponent(id)}`;
}

/** 画像の経路（本人の投稿だけを返す。一覧では CSS で縮小して表示する）。 */
function imageSrcOf(id: string): string {
  return `/api/submissions/${encodeURIComponent(id)}/image`;
}

/**
 * 自分の投稿の API の応答から、画面の一覧の形を作ります。
 * 並びは API の逆順（新しい順）にします。対応が取れない応答は、代わりの値を作らず例外にします。
 */
export class MineViewBuilder {
  build(response: MineSubmissionsResponse, campaign: MineCampaignLookup): MineView {
    const items = [...response.items].reverse().map((entry) => this.itemOf(entry, campaign));
    return { items };
  }

  private itemOf(entry: MineSubmissionItemResponse, campaign: MineCampaignLookup): MineItemView {
    if (entry.status === 'checking') {
      throw new Error(MINE_STRINGS.viewMismatch);
    }
    this.assertReturnInfo(entry);
    const place = this.placeOf(entry.cellId, campaign);
    return {
      id: entry.id,
      status: entry.status,
      statusLabel: STATUS_LABELS[entry.status],
      acceptedNotice: entry.status === 'accepted' ? STATUS_NOTICES.noRealTransaction : null,
      areaLabel: place?.areaLabel ?? null,
      seasonLabel: place?.seasonLabel ?? null,
      cellUnknownNotice: place === null ? MINE_STRINGS.cellUnknown : null,
      shotMonthLabel: MINE_STRINGS.shotMonthLabel(entry.shotMonth),
      spotName: entry.spotName,
      caption: entry.caption,
      imageSrc: imageSrcOf(entry.id),
      returnView: entry.returnInfo === null ? null : this.returnViewOf(entry.id, entry.returnInfo),
    };
  }

  /** cellId から市町村と季節の表示名を引く。引けないときは null（代わりの値は作らない）。 */
  private placeOf(cellId: string, campaign: MineCampaignLookup): { areaLabel: string; seasonLabel: string } | null {
    const cell = campaign.cells.find((candidate) => candidate.cellId === cellId);
    const area = cell === undefined ? undefined : campaign.areas.find((candidate) => candidate.id === cell.areaId);
    const period = cell === undefined ? undefined : campaign.periods.find((candidate) => candidate.id === cell.periodId);
    if (area === undefined || period === undefined) {
      return null;
    }
    return { areaLabel: area.label, seasonLabel: period.label };
  }

  /** 差し戻しの内容は、差し戻しの状態のときだけ付く（状態と内容の対応が取れない応答は例外）。 */
  private assertReturnInfo(entry: MineSubmissionItemResponse): void {
    const isReturned = entry.status === 'returned';
    if (isReturned !== (entry.returnInfo !== null)) {
      throw new Error(MINE_STRINGS.viewMismatch);
    }
  }

  private returnViewOf(id: string, info: ReturnInfo): MineReturnView {
    const reasonLabel = RETURN_REASON_LABELS[info.reasonCode];
    if (reasonLabel === undefined) {
      throw new Error(MINE_STRINGS.viewMismatch);
    }
    return {
      reasonLabel,
      freeText: info.freeText,
      resubmittable: info.resubmittable,
      resubmitHref: info.resubmittable ? resubmitHrefOf(id) : null,
      resubmitNotice: info.resubmittable ? MINE_STRINGS.resubmitAvailable : MINE_STRINGS.resubmitUnavailable,
    };
  }
}

/** 自分の投稿の一覧を読みます。通信の失敗は例外のまま外に出します（代わりの一覧は作りません）。 */
export class MineApi {
  constructor(
    private readonly client: ApiClient = new ApiClient(),
    private readonly builder: MineViewBuilder = new MineViewBuilder(),
  ) {}

  async load(): Promise<MineView> {
    const response = await this.client.get<MineSubmissionsResponse>(MINE_API_PATHS.mine);
    const campaign = await this.loadCampaign();
    return this.builder.build(response, campaign);
  }

  /**
   * キャンペーンが無いとき（404）は、空の対応表として扱う。投稿が無ければ一覧は空の案内になり、
   * 投稿があれば、マスを引けなかった旨の文言が出る（代わりの値は作らない）。
   */
  private async loadCampaign(): Promise<MineCampaignLookup> {
    try {
      return await this.client.get<MineCampaignLookup>(MINE_API_PATHS.campaign);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === COVERAGE_API_CODES.campaignNotFound) {
        return { areas: [], periods: [], cells: [] };
      }
      throw error;
    }
  }
}
