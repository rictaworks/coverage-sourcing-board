import { REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import type { ReviewItemView } from '../../lib/api/reviewApi';
import { QueueItem } from './QueueItem';
import styles from './review.module.css';

export interface ActionErrorView {
  readonly submissionId: string;
  readonly message: string;
}

export interface QueueListProps {
  readonly items: readonly ReviewItemView[];
  readonly busy: boolean;
  readonly overQuotaId: string | null;
  readonly actionError: ActionErrorView | null;
  readonly onAccept: (submissionId: string) => void;
  readonly onConfirmOverQuota: (submissionId: string) => void;
  readonly onCancelOverQuota: () => void;
  readonly onReturn: (submissionId: string) => void;
}

/** 確認待ちの投稿の一覧。0 件のときは、その旨を文字で示します。 */
export function QueueList(props: QueueListProps) {
  if (props.items.length === 0) {
    return <p className={styles.notice}>{REVIEW_QUEUE_STRINGS.queueEmpty}</p>;
  }
  return (
    <ol className={styles.list} aria-label={REVIEW_QUEUE_STRINGS.queueHeading}>
      {props.items.map((item) => (
        <QueueItem
          key={item.id}
          item={item}
          busy={props.busy}
          overQuotaOpen={props.overQuotaId === item.id}
          errorMessage={props.actionError?.submissionId === item.id ? props.actionError.message : null}
          onAccept={props.onAccept}
          onConfirmOverQuota={props.onConfirmOverQuota}
          onCancelOverQuota={props.onCancelOverQuota}
          onReturn={props.onReturn}
        />
      ))}
    </ol>
  );
}
