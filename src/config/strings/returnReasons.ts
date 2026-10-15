import type { ReturnReasonCode } from '../../core/api/contract';

/** 差し戻しの理由の表示（仮置き。requirements 3.7。公開前に文言を確定します）。 */
export const RETURN_REASON_LABELS: Record<ReturnReasonCode, string> = {
  ratio: '比率が条件と異なります',
  resolution: '解像度が足りません',
  shoot_declaration: '撮影地・撮影月の申告が合っていません',
  subject: '被写体が条件に合っていません',
  other: 'その他',
};
