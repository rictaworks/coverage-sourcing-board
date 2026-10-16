import type { MySubmissionsResponse } from '../../../core/api/contract';
import type { CampaignDetailView } from '../api/campaignApi';

/**
 * 再投稿の初期値（Issue #17）。元の投稿は mine API の応答から ID で引きます。
 * 応答が持つのは cellId までで、撮影月は持ちません。撮影月は推測せず、空のままにします（SPEC/screen-submit.md）。
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

  /** 撮影月。mine API の応答に無いため、初期値は常に空（null）です。 */
  monthOf(): null {
    return null;
  }
}
