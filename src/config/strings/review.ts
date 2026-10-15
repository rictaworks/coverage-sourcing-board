import { LIMITS } from '../limits';

/** 最終確認の API の文言（日本語のみ。です・ます調）。API の共通の文言は apiErrors.ts にある。 */
export const REVIEW_ERROR_MESSAGES = {
  over_quota_confirmation_required:
    'この場所は、必要数に達しています。超過して採用する場合は、確認の画面で「超過して採用」を選んでください。',
  reason_code_invalid: '差し戻しの理由が選ばれていません。一覧から理由を選んでください。',
  free_text_required: 'その他の理由を選んだときは、自由記述を入力してください。',
  free_text_invalid: '自由記述に使えない文字が含まれています。文字を入力し直してください。',
  body_too_large: `要求が大きすぎます。${LIMITS.reviewBodyMaxBytes} バイト以内にしてください。`,
  free_text_too_long: `自由記述は ${LIMITS.returnReasonMaxChars} 字以内で入力してください。`,
} as const;

export type ReviewErrorMessageCode = keyof typeof REVIEW_ERROR_MESSAGES;

/** 開発者向けの例外の文言（応答には含めず、ログに残す）。 */
export const REVIEW_DEV_MESSAGES = {
  errorRuleMissing: '受入条件の行が無いのに、投稿の審査が行われました（キャンペーンの行を確認してください）。',
  errorCellMissing: '投稿のマスの行が見つかりません（投稿とマスの対応を確認してください）。',
  errorStoredReasonInvalid: '差し戻しの理由の保存形式が正しくありません（review 行の reason を確認してください）。',
  errorStateUpdateMissed: '状態の更新が 1 件も行われませんでした（直前に別の操作が行われた可能性があります）。',
  /** 枠の判定のための内部の名前（応答には出ない）。 */
  internalCampaignName: 'review',
} as const;
