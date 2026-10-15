import type { CheckItem } from '../core/types';
import { LIMITS } from './limits';
import { RULE_DEFAULTS } from './defaults';

/**
 * 投稿の受け取り（C3）の設定。数値と並びはここに置き、コードへ直書きしない。
 * 上限の数値は LIMITS と RULE_DEFAULTS から引く（ブラウザと Worker で同じ値）。
 */
export const SUBMISSION_CONFIG = {
  /**
   * 要求の本文の上限（バイト）。保存用の JPEG・分類用の縮小 JPEG・メタ情報の合計に、余白を足した値。
   * 余白（multipart の境界とメタ情報）は仮の値です。
   */
  bodyMaxBytes: RULE_DEFAULTS.savedMaxBytes + LIMITS.classifyImageMaxBytes + 100_000,
  /** 判定結果（ブラウザが送る）の件数の上限。 */
  checksMax: 40,
  /** ID（投稿・マス・再投稿の元）の文字数の上限。テンプレートから複製した ID（UUID と接頭辞）を含むため、余裕を持たせる。 */
  idMaxChars: 128,
  /** 16 文字の 16 進（64 ビットの知覚ハッシュ）。 */
  phashPattern: /^[0-9a-f]{16}$/i,
  /** 1 行の文字列に含めてはいけない制御文字（改行・タブを含む）。 */
  controlCharPattern: /[\u0000-\u001f\u007f-\u009f]/,
  /** 保存する JPEG の長辺の上限（px）。 */
  savedLongEdgePx: RULE_DEFAULTS.savedLongEdgePx,
  /** 保存する JPEG のバイト数の上限。 */
  savedMaxBytes: RULE_DEFAULTS.savedMaxBytes,
  /** 分類用の縮小 JPEG の長辺の上限（px）。 */
  classifyImageEdgePx: RULE_DEFAULTS.classifyImageEdgePx,
  /** 分類用の縮小 JPEG のバイト数の上限。 */
  classifyImageMaxBytes: LIMITS.classifyImageMaxBytes,
  /** セッションごとの 1 日（UTC）の上限。 */
  dailySubmissionsPerSession: LIMITS.dailySubmissionsPerSession,
  /** 保存中の投稿の総数の上限。超えたら新規の投稿を一時停止する。 */
  maxSavedSubmissions: LIMITS.maxSavedSubmissions,
  /** 保存した投稿の判定結果で、被写体の推定が無いときに残す理由（check_result.reason）。 */
  subjectNoneReason: 'none',
} as const;

/**
 * ブラウザが判定して送る項目（requirements 3.3 の一次判定）。
 * 重複（duplicate_image・duplicate_spot）と被写体（subject_kind）は Worker が判定するため、ここには含めない。
 */
export const BROWSER_CHECK_ITEMS = [
  'format',
  'orientation_ratio',
  'resolution',
  'jpeg_quality',
  'focus',
  'shoot_location',
  'shoot_month_season',
  'daytime',
  'processing',
  'declaration',
] as const satisfies readonly CheckItem[];

/** ブラウザが送ってよい判定の結果の値（合格・要確認・不合格）。 */
export const BROWSER_VERDICTS = ['pass', 'review', 'fail'] as const;
