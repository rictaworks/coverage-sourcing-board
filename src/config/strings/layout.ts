/**
 * 全画面の共通の要素（requirements 4.1）と、ページごとの名前とタイトルの文言。日本語のみ。
 * 文言は仮置きで、公開前に確定します（requirements 4.2）。
 */
export const LAYOUT_STRINGS = {
  amberNoticeDemo: 'これはデモ版です。データはサーバー再起動時にリセットされる場合があります。',
  amberNoticeErase: '本デモは毎日 03:00（日本時間）にもデータを消去します。',
  headerNavLabel: 'ヘッダーのナビゲーション',
  backToDemoList: '← デモ一覧へ',
  backToDemoListHref: 'https://rictaworks.jp/#demos',
  consultLabel: 'ご相談はこちら',
  consultHref: 'https://rictaworks.jp/',
  footerLegalLabel: '利用規約・免責事項',
  footerLegalHref: '/legal',
  pendingNotice: 'この画面は準備中です。',
  backToTop: 'トップへ戻る',
} as const;

/** 各画面の名前（見出しに使う）。 */
export const PAGE_NAMES = {
  coverage: '充足マップ',
  submit: '投稿',
  mine: '自分の投稿',
  campaign: 'キャンペーン設定',
  review: '確認キュー',
} as const;

/** 各画面の <title>。トップは APP_STRINGS.pageTitle を使う。 */
export const PAGE_TITLES = {
  coverage: '充足マップ｜風景写真の素材調達（デモ）',
  submit: '投稿｜風景写真の素材調達（デモ）',
  mine: '自分の投稿｜風景写真の素材調達（デモ）',
  campaign: 'キャンペーン設定｜風景写真の素材調達（デモ）',
  review: '確認キュー｜風景写真の素材調達（デモ）',
  notFound: 'ページが見つかりません｜風景写真の素材調達（デモ）',
} as const;

/** 同一オリジンの API クライアントの文言。 */
export const API_CLIENT_STRINGS = {
  invalidPath: 'API の呼び出しは、/api/ で始まる同一オリジンの相対パスだけです。',
} as const;
