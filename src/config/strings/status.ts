import type { SubmissionStatus } from '../../core/types';

/** 投稿の状態の表示（確認待ち・採用（デモ）・差し戻し）。 */
export const STATUS_LABELS: Record<Exclude<SubmissionStatus, 'checking'>, string> = {
  pending_review: '確認待ち',
  accepted: '採用（デモ）',
  returned: '差し戻し',
};

/** 状態の注記。 */
export const STATUS_NOTICES = {
  noRealTransaction: '実際の買取や権利の移転は行いません。',
} as const;
