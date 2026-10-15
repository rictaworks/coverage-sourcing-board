import type { MySubmissionItem, ReturnInfo } from '../../../core/api/contract';
import type { SubmissionStatus } from '../../../core/types';
import { RETURN_REASON_LABELS } from '../../../config/strings/returnReasons';
import { STATUS_LABELS, STATUS_NOTICES } from '../../../config/strings/status';
import { MINE_API_PATHS, MINE_STRINGS, MINE_SUBMIT_LINK } from '../../../config/strings/mine';
import { ApiClient } from '../apiClient';

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
  build(response: MineSubmissionsResponse): MineView {
    const items = [...response.items].reverse().map((entry) => this.itemOf(entry));
    return { items };
  }

  private itemOf(entry: MineSubmissionItemResponse): MineItemView {
    if (entry.status === 'checking') {
      throw new Error(MINE_STRINGS.viewMismatch);
    }
    this.assertReturnInfo(entry);
    return {
      id: entry.id,
      status: entry.status,
      statusLabel: STATUS_LABELS[entry.status],
      acceptedNotice: entry.status === 'accepted' ? STATUS_NOTICES.noRealTransaction : null,
      shotMonthLabel: MINE_STRINGS.shotMonthLabel(entry.shotMonth),
      spotName: entry.spotName,
      caption: entry.caption,
      imageSrc: imageSrcOf(entry.id),
      returnView: entry.returnInfo === null ? null : this.returnViewOf(entry.id, entry.returnInfo),
    };
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
    return this.builder.build(response);
  }
}
