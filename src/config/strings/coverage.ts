/** 採用数と必要数の区切り。 */
const COVERAGE_STRINGS_SEPARATOR = '／';

/**
 * 充足マップの画面の文言（日本語のみ）。画面の文章は、です・ます調で書きます。
 * 文言は仮置きで、公開前に確定します（requirements 4.2）。
 */
export const COVERAGE_STRINGS = {
  lead: 'エリアと季節ごとに、採用された写真の数と必要な数を示します。必要な数に届いていない場所を、優先して探してください。',
  campaignNamePrefix: 'キャンペーン：',
  reloadLabel: '最新の状態を読み込む',
  tableCaption: 'エリアと季節ごとの採用数と必要数',
  tableRegionLabel: '充足マップの表（横にスクロールできます）',
  columnArea: 'エリア',
  columnPrefecture: '県',
  countSeparator: COVERAGE_STRINGS_SEPARATOR,
  pendingCount: (count: number): string => `確認待ち ${count} 件`,
  unfilledBadge: '未充足',
  closedBadge: '募集終了',
  legendHeading: '表の見方',
  legendCount: '「採用数／必要数」の形で示します。確認待ちの投稿は、枠に含みません。',
  legendUnfilled: '未充足：採用数が必要数に届いていません。',
  legendClosed: '募集終了：採用数が必要数に達しました。新しい投稿は受け付けません。',
  wantedHeading: 'いま求めている場所',
  wantedDescription: '充足率の低い順に並べています。同じ充足率なら、必要数との差が大きい場所が先になります。',
  wantedCount: (accepted: number, required: number, remaining: number): string =>
    `${accepted}${COVERAGE_STRINGS_SEPARATOR}${required}（あと ${remaining} 件）`,
  wantedTitle: (areaLabel: string, seasonLabel: string): string => `${areaLabel}・${seasonLabel}`,
  wantedSubmitLabel: (areaLabel: string, seasonLabel: string): string => `${areaLabel}・${seasonLabel}に投稿する`,
  wantedEmpty: '求めている場所はありません。すべての場所が募集終了です。',
  campaignNotFoundHeading: 'キャンペーンがありません',
  campaignNotFoundBody: 'キャンペーン設定の画面で、テンプレートを読み込んでから、もう一度開いてください。',
  campaignLinkLabel: 'キャンペーン設定へ',
  campaignLinkHref: '/campaign',
  fetchFailed: '充足マップを読み込めませんでした。通信の状態を確かめて、もう一度お試しください。',
  viewMismatch: '充足マップの組み立てで、マスの対応が見つかりませんでした。',
} as const;

/** 充足の API の経路と、キャンペーンが無いときの code。 */
export const COVERAGE_API_PATHS = {
  campaign: '/api/campaign',
  coverage: '/api/coverage',
} as const;

export const COVERAGE_API_CODES = {
  campaignNotFound: 'campaign_not_found',
} as const;

/** 投稿の画面へ移るリンクの形（投稿の画面が、エリアと季節を初期値にするために読む）。 */
export const COVERAGE_SUBMIT_LINK = {
  path: '/submit',
  areaParam: 'area',
  periodParam: 'period',
} as const;
