import { API_ENDPOINTS } from '../core/api/paths';

/**
 * デバッグのトレースで使える name とフィールド名の許可リスト。
 * 任意の文字列（IP・Cookie・投稿者の入力など）を name やフィールド名に入れられないようにする。
 * 新しいトレースが必要になったら、ここへ追加する。
 */
export const TRACE_NAMES = [
  'submission.checked',
  'check.focus',
  'check.exposure',
  'check.duplicate',
  'submission.stored',
  'submission.rejected',
  'classifier.called',
  'classifier.skipped',
  'classifier.recordFailed',
  'cron.reset.started',
  'cron.reset.finished',
  'cron.reset.failed',
  'request.handled',
  'image.exif_read_failed',
] as const;

export const TRACE_FIELD_NAMES = [
  'passCount',
  'blurScore',
  'flag',
  'count',
  /** 1 回の実行で batch に渡した文の数。 */
  'queryCount',
  'byteLength',
  'durationMs',
  'estimatedCost',
  'method',
  'route',
  'status',
  'requestId',
  /** 失敗の種類の番号（0 その他、1 Error、2 TypeError、3 RangeError）。メッセージは入れない。 */
  'errorKind',
] as const;

export type TraceName = (typeof TRACE_NAMES)[number];
export type TraceFieldName = (typeof TRACE_FIELD_NAMES)[number];

/** 要求 ID（crypto.randomUUID() の形式）。ラベルの許可リストではなく、この形式で検査する。 */
export const TRACE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 要求のトレースで、経路が登録のどれにも一致しなかったときの固定の名前。 */
export const TRACE_ROUTE_UNMATCHED = 'unmatched';

/** 要求のメソッドのうち、トレースに残す名前。これ以外のメソッドは OTHER にする。 */
export const TRACE_METHOD_LABELS = ['GET', 'HEAD', 'PUT', 'POST', 'OTHER'] as const;

/**
 * トレースの値として使える文字列（既定の名前）の許可リスト。
 * 経路は、実際の ID を含まないテンプレート（paths.ts の :id のまま）だけを使う。
 */
export const TRACE_LABELS = [
  ...TRACE_METHOD_LABELS,
  ...Object.values(API_ENDPOINTS).map((endpoint) => endpoint.path),
  TRACE_ROUTE_UNMATCHED,
] as const;

export type TraceLabel = (typeof TRACE_LABELS)[number];
