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
  'cron.reset',
] as const;

export const TRACE_FIELD_NAMES = [
  'passCount',
  'blurScore',
  'flag',
  'count',
  'byteLength',
  'durationMs',
  'estimatedCost',
] as const;

export type TraceName = (typeof TRACE_NAMES)[number];
export type TraceFieldName = (typeof TRACE_FIELD_NAMES)[number];
