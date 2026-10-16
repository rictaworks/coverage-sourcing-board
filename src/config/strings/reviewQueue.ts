import { STATUS_LABELS } from './status';

/**
 * 確認キューの画面の文言（日本語のみ。です・ます調）。画面に直書きせず、ここから引きます。
 * 文言は仮置きで、公開前に確定します（requirements 4.2）。
 */
export const REVIEW_QUEUE_STRINGS = {
  lead: '確認待ちの投稿を一覧します。要確認の理由と被写体の推定を見て、採用または差し戻しを選んでください。',
  reloadLabel: '最新の状態を読み込む',
  queueHeading: '確認待ちの投稿',
  queueEmpty: '確認待ちの投稿はありません。',
  acceptedHeading: '採用（デモ）の投稿',
  acceptedEmpty: '採用済みの投稿はありません。',
  acceptedNotice: '採用（デモ）は、デモの確認のための表示です。実際の買取や権利の移転は行いません。',
  overQuotaLabel: '超過採用',
  acceptedBadgeText: (overQuota: boolean): string => (overQuota ? `超過採用・${STATUS_LABELS.accepted}` : STATUS_LABELS.accepted),
  itemCellLabel: 'マス',
  itemMonthLabel: '撮影月',
  monthLabel: (month: number): string => `${month} 月`,
  itemSpotLabel: '地点名',
  itemCaptionLabel: '説明文',
  emptySpot: '（地点名は空欄です）',
  emptyCaption: '（説明文は空欄です）',
  imageAlt: (cellLabel: string, monthLabel: string): string => `投稿の画像：${cellLabel}・${monthLabel}`,
  checksHeading: '要確認の理由',
  checksEmpty: '要確認の項目はありません。',
  checkBadgeText: (label: string): string => `要確認：${label}`,
  checkFixPrefix: '修正の方法：',
  subjectHeading: '被写体の推定（補助）',
  subjectNotice: '補助の表示です。不合格や要確認の根拠にはしません。',
  subjectConfidencePrefix: '確信度：',
  subjectKindAndConfidence: (kind: string, confidence: string): string => `${kind}（${confidence}）`,
  duplicatesHeading: '重複の候補',
  duplicatesEmpty: '同じ画像・同じ地点の候補はありません。',
  duplicatePending: '確認待ち',
  duplicateCompareLabel: '重複の候補と並べて確認する',
  acceptButton: '採用する',
  returnButton: '差し戻す',
  revokeButton: '採用を取り消す',
  busy: '処理しています。しばらくお待ちください。',
  accepted: '採用しました。',
  returned: '差し戻しました。投稿者の画面に、理由が表示されます。',
  revoked: '採用を取り消しました。差し戻し扱いになり、マスが募集中に戻る場合があります。',
  overQuotaTitle: '超過採用の確認',
  overQuotaBody: 'この場所は、必要数に達しています。枠を超えて採用（超過採用）します。よろしいですか？',
  overQuotaConfirmButton: '超過して採用する',
  overQuotaCancelButton: 'やめる',
  returnTitle: '差し戻しの内容',
  returnReasonLegend: '差し戻しの理由（必須）',
  returnFreeTextLabel: '自由記述',
  returnFreeTextHelp: (maxChars: number): string => `${maxChars} 字以内で入力してください。「その他」を選んだときは必須です。`,
  returnResubmittableLegend: '再投稿で対応できますか（必須）',
  returnResubmittableYes: '再投稿で対応できます（投稿者が修正して、もう一度投稿できます）',
  returnResubmittableNo: '再投稿では対応できません',
  returnSubmitButton: '差し戻しを送る',
  revokeTitle: '採用の取り消し',
  revokeReturnNotice: '取り消すと、投稿は差し戻し扱いになります。取り消しの理由を選んで、送ってください。',
  revokeConfirmMessage: 'この投稿の採用を取り消し、差し戻し扱いにします。よろしいですか？',
  revokeConfirmLabel: '取り消しに進む',
  revokeConfirmDismissLabel: 'やめる',
  revokeSubmitButton: '取り消しを送る',
  dialogCancelButton: 'やめる',
  reasonMissing: '差し戻しの理由を選んでください。',
  freeTextMissing: '「その他」を選んだときは、自由記述を入力してください。',
  freeTextTooLong: (maxChars: number): string => `自由記述は ${maxChars} 字以内で入力してください。`,
  resubmittableMissing: '再投稿で対応できるかどうかを選んでください。',
  requestFailed: '通信に失敗しました。通信の状態を確かめて、もう一度お試しください。',
  viewMismatch: '確認キューの組み立てで、マスまたは投稿の対応が見つかりませんでした。',
} as const;

/** 確認キューの API の経路。 */
export const REVIEW_API_PATHS = {
  queue: '/api/review/queue',
  campaign: '/api/campaign',
  coverage: '/api/coverage',
  /** 画像の経路（投稿の ID を入れる）。 */
  image: (submissionId: string): string => `/api/submissions/${encodeURIComponent(submissionId)}/image`,
  /** 操作の経路（投稿の ID と操作名を入れる）。 */
  action: (submissionId: string, action: 'accept' | 'return' | 'revoke'): string =>
    `/api/review/${encodeURIComponent(submissionId)}/${action}`,
} as const;

/** 確認キューの API の応答の code（超過採用の確認が必要）。契約の API_ERROR_CODES には無いため、ここに置きます。 */
export const REVIEW_API_CODES = {
  overQuotaConfirmationRequired: 'over_quota_confirmation_required',
} as const;
