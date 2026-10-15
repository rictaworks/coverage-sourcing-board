/**
 * 自分の投稿の画面の文言（日本語のみ。です・ます調）。文言は仮置きで、公開前に確定します（requirements 4.2）。
 * 状態の文言・採用（デモ）の注記・差し戻しの理由の文言は、status.ts と returnReasons.ts を使います。
 */
export const MINE_STRINGS = {
  lead: 'ご自身が投稿した写真の状態を確かめられます。差し戻しの理由を確かめて、再投稿できる場合は、そのまま投稿の画面へ移れます。',
  listLabel: '自分の投稿の一覧',
  reloadLabel: '最新の状態を読み込む',
  fetchFailed: '投稿の一覧を読み込めませんでした。通信の状態を確かめて、もう一度お試しください。',
  empty: '投稿はまだありません。写真を投稿すると、ここに状態が表示されます。',
  emptyLinkLabel: '投稿の画面へ',
  imageAlt: '投稿した写真の縮小画像',
  shotMonthLabel: (month: number): string => `撮影月：${month}月`,
  spotNameLabel: '地点名',
  captionLabel: '説明文',
  emptyValue: '（未入力）',
  returnReasonLabel: '差し戻しの理由',
  freeTextLabel: '自由記述',
  noFreeText: '（自由記述はありません）',
  resubmitLabel: '再投稿する',
  resubmitAvailable: 'この投稿は再投稿できます。',
  resubmitUnavailable: 'この投稿は再投稿できません。',
  viewMismatch: '自分の投稿の一覧で、投稿の状態が想定と違いました。',
} as const;

/** 自分の投稿の API の経路。 */
export const MINE_API_PATHS = {
  mine: '/api/submissions/mine',
} as const;

/** 再投稿の導線（投稿の画面が、元の投稿の ID を読むための query）。 */
export const MINE_SUBMIT_LINK = {
  path: '/submit',
  resubmitParam: 'resubmit',
} as const;
