import { REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import type { ReviewItemView } from '../../lib/api/reviewApi';
import { ErrorMessage } from '../common/ErrorMessage';
import { CheckReasons } from './CheckReasons';
import { DuplicateCompare } from './DuplicateCompare';
import { OverQuotaConfirm } from './OverQuotaConfirm';
import { SubjectHintView } from './SubjectHintView';
import styles from './review.module.css';

export interface QueueItemProps {
  readonly item: ReviewItemView;
  readonly busy: boolean;
  readonly overQuotaOpen: boolean;
  readonly errorMessage: string | null;
  readonly onAccept: (submissionId: string) => void;
  readonly onConfirmOverQuota: (submissionId: string) => void;
  readonly onCancelOverQuota: () => void;
  readonly onReturn: (submissionId: string) => void;
}

/** 確認キューの 1 件。画像・投稿の情報・要確認の理由・被写体の推定（補助）・重複候補・操作をまとめます。 */
export function QueueItem({
  item,
  busy,
  overQuotaOpen,
  errorMessage,
  onAccept,
  onConfirmOverQuota,
  onCancelOverQuota,
  onReturn,
}: QueueItemProps) {
  return (
    <li className={styles.card}>
      <div className={styles.itemBody}>
        <img
          className={styles.image}
          src={item.imageUrl}
          alt={REVIEW_QUEUE_STRINGS.imageAlt(item.cellLabel, item.shotMonthLabel)}
          loading="lazy"
          width={320}
          height={240}
        />
        <div className={styles.block}>
          <dl className={styles.details}>
            <dt>{REVIEW_QUEUE_STRINGS.itemCellLabel}</dt>
            <dd>{item.cellLabel}</dd>
            <dt>{REVIEW_QUEUE_STRINGS.itemMonthLabel}</dt>
            <dd>{item.shotMonthLabel}</dd>
            <dt>{REVIEW_QUEUE_STRINGS.itemSpotLabel}</dt>
            <dd>{item.spotName}</dd>
            <dt>{REVIEW_QUEUE_STRINGS.itemCaptionLabel}</dt>
            <dd>{item.caption}</dd>
          </dl>
          <CheckReasons checks={item.checks} />
          <SubjectHintView subject={item.subject} />
        </div>
      </div>
      <DuplicateCompare duplicates={item.duplicates} />
      {errorMessage !== null ? <ErrorMessage message={errorMessage} /> : null}
      {overQuotaOpen ? (
        <OverQuotaConfirm disabled={busy} onConfirm={() => onConfirmOverQuota(item.id)} onCancel={onCancelOverQuota} />
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.primaryButton} onClick={() => onAccept(item.id)} disabled={busy}>
          {REVIEW_QUEUE_STRINGS.acceptButton}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={() => onReturn(item.id)} disabled={busy}>
          {REVIEW_QUEUE_STRINGS.returnButton}
        </button>
      </div>
    </li>
  );
}
