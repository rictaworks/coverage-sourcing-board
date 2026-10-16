import { REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import type { AcceptedItemView } from '../../lib/api/reviewApi';
import { ErrorMessage } from '../common/ErrorMessage';
import type { ActionErrorView } from './QueueList';
import styles from './review.module.css';

/** 採用済みの一覧。「採用（デモ）」と注記を出し、取り消しの操作を置きます。 */
export function AcceptedList({
  items,
  busy,
  actionError,
  onRevoke,
}: {
  readonly items: readonly AcceptedItemView[];
  readonly busy: boolean;
  readonly actionError: ActionErrorView | null;
  readonly onRevoke: (submissionId: string) => void;
}) {
  if (items.length === 0) {
    return <p className={styles.notice}>{REVIEW_QUEUE_STRINGS.acceptedEmpty}</p>;
  }
  return (
    <ul className={styles.list} aria-label={REVIEW_QUEUE_STRINGS.acceptedHeading}>
      {items.map((item) => (
        <li key={item.id} className={styles.card}>
          <div className={styles.itemBody}>
            <img
              className={styles.image}
              src={item.imageUrl}
              alt={REVIEW_QUEUE_STRINGS.imageAlt(item.cellLabel, item.shotMonthLabel)}
              loading="lazy"
              width={320}
              height={240}
            />
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
          </div>
          <p className={styles.badge}>
            {REVIEW_QUEUE_STRINGS.acceptedBadgeText(item.overQuota)}
          </p>
          {actionError?.submissionId === item.id ? <ErrorMessage message={actionError.message} /> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={() => onRevoke(item.id)} disabled={busy}>
              {REVIEW_QUEUE_STRINGS.revokeButton}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
