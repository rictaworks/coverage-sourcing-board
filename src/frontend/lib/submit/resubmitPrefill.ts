import type { MySubmissionItem, MySubmissionsResponse } from '../../../core/api/contract';
import type { CampaignDetailView } from '../api/campaignApi';

/**
 * 再投稿の初期値（Issue #17）。元の投稿は mine API の応答から ID で引きます。
 * Worker の mine API は、契約の項目に加えて shotMonth（撮影月）を返します（src/worker/routes/review.ts の MySubmissionView）。
 * 撮影月は応答が返した値だけを使い、無いとき・範囲外のときは推測せず、空のままにします。
 */
export class ResubmitPrefill {
  /** 元の投稿のマスの区分の ID。元の投稿またはマスが見つからなければ null（推測しません）。 */
  areaIdOf(response: MySubmissionsResponse, campaign: Pick<CampaignDetailView, 'cells'>, submissionId: string): string | null {
    const origin = response.items.find((item) => item.id === submissionId);
    if (origin === undefined) {
      return null;
    }
    const cell = campaign.cells.find((candidate) => candidate.cellId === origin.cellId);
    return cell === undefined ? null : cell.areaId;
  }

  /** 撮影月の初期値。応答に shotMonth（1〜12 の整数）があるときだけ返し、無ければ null（空のまま）です。 */
  monthOf(response: MySubmissionsResponse, submissionId: string): number | null {
    const origin: (MySubmissionItem & { readonly shotMonth?: unknown }) | undefined = response.items.find(
      (item) => item.id === submissionId,
    );
    if (origin === undefined) {
      return null;
    }
    const month = origin.shotMonth;
    return typeof month === 'number' && Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
  }
}
