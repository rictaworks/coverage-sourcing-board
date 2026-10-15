/**
 * キャンペーンの API の設定（入力の上限と既定値）。数値はここに置き、コードへ直書きしない。
 * 「仮の値」は requirements に数値がないため暫定で置いたものです。人が決めて、SPEC/api-campaign.md の記録を更新します。
 */
export const CAMPAIGN_API_CONFIG = {
  /** 読み込むテンプレートの ID（data/templates の id と一致させる）。要求の templateId はこの値だけを受け付けます。 */
  defaultTemplateId: 'shikoku-landscape',
  /** キャンペーンの名称の上限（文字数。仮の値）。 */
  nameMaxChars: 40,
  /** 区分値の追加で作るマスの既定の必要数（仮の値。テンプレートの既定と同じ 2）。 */
  addedAreaRequiredPerCell: 2,
  /** 区分値（エリア）の件数の上限。四国のテンプレートの 21 件を十分に超える値（仮の値）。 */
  areasMax: 50,
  /** 必要数（1 マスあたり）の上限（仮の値）。下限は 1（CAMPAIGN_ERROR_MESSAGES.REQUIRED_INVALID）。 */
  requiredMax: 999,
  /** 区分値の追加の 1 回の要求で追加する件数（1 件だけ）。 */
  areasPerRequest: 1,
} as const;
