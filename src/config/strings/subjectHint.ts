import type { SubjectKind } from '../../core/types';

/** 被写体の推定の表示の文言（です・ます調）。確認画面に出す。 */
export const SUBJECT_HINT_STRINGS = {
  /** 推定できないとき（失敗・上限）の表示。 */
  noneMessage: '被写体の推定はありません',
  /** 確信度が低いときの表示。 */
  uncertainMessage: '判定が確かでない',
  /** 上限に達したときの表示（日本時間 9 時に、上限が数え直されます）。 */
  resumeMessage: '分類は日本時間の 9 時に再開します。',
} as const;

/** 推定区分の表示名。 */
export const SUBJECT_KIND_LABELS: Record<SubjectKind, string> = {
  landscape: '風景',
  closeup: '接写',
  people: '人物',
  other: 'その他',
};

/** 開発者向けの例外の文言（応答には含めず、種類の番号だけをトレースに残します）。 */
export const SUBJECT_HINT_ERRORS = {
  imageNotJpegDataUrl: '分類の画像は、JPEG の data URL でなければなりません。',
  imageInvalidJpeg: '分類の画像が、JPEG の検査に通りません。',
  captionTooLong: '説明文が、上限の文字数を超えています。',
  monthInvalid: '撮影月は 1 から 12 までの整数でなければなりません。',
  responseShape: '分類の応答の形が、想定と違います。',
  timeout: '分類の要求が、タイムアウトしました。',
} as const;
