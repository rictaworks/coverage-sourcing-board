import type { ApiErrorCode } from '../../core/api/contract';

// 仮置き：「5 MB」「03:00」は直書きの値です。LIMITS との連動は後続の Issue で行います。
/** API のエラーの文言（です・ます調）。修正の方法が分かるものは、修正の方法を示します。 */
export const API_ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  invalid_request: '入力の内容を確認してください。入力できる形式や文字数を超えています。',
  unsupported_image: '投稿できる画像は JPEG 形式だけです。画像の形式を確認して、選び直してください。',
  metadata_not_allowed: '画像に位置情報や機種情報などのデータが含まれています。画像を読み込み直して、もう一度投稿してください。',
  trailing_bytes: '画像のデータが正しくありません。画像を読み込み直して、もう一度投稿してください。',
  payload_too_large: 'ファイルが大きすぎます。5 MB 以下の画像を選んでください。',
  declaration_required: 'すべての申告にチェックを入れてから、投稿してください。',
  rate_limited: '操作が続いています。少し時間をおいてから、もう一度お試しください。',
  daily_limit_reached: '本日の投稿の上限に達しました。データは毎日 03:00（日本時間）に消去されます。明日の投稿をお待ちしています。',
  storage_paused: '現在、新しい投稿を受け付けていません。しばらくたってから、もう一度お試しください。',
  cell_closed: 'この場所の募集は終了しました。別の場所を選んでください。',
  submission_rejected: '画像が条件を満たしていません。理由と修正方法を確認して、撮り直すか選び直してください。',
  not_found: '対象が見つかりません。ページを読み込み直してください。',
  invalid_state: 'この操作は、現在の状態では行えません。画面を読み込み直してください。',
  internal_error: '処理中に問題が起きました。しばらくたってから、もう一度お試しください。',
};
