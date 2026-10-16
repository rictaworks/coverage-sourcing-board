import { REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import type { DuplicateView } from '../../lib/api/reviewApi';
import styles from './review.module.css';

/** 重複の候補を、対象の投稿と並べて表示します。画像と情報は、テキストとして描画します。 */
export function DuplicateCompare({ duplicates }: { readonly duplicates: readonly DuplicateView[] }) {
  return (
    <section className={styles.block} aria-label={REVIEW_QUEUE_STRINGS.duplicatesHeading}>
      <h3 className={styles.subHeading}>{REVIEW_QUEUE_STRINGS.duplicatesHeading}</h3>
      {duplicates.length === 0 ? (
        <p className={styles.notice}>{REVIEW_QUEUE_STRINGS.duplicatesEmpty}</p>
      ) : (
        <ul className={styles.compare} aria-label={REVIEW_QUEUE_STRINGS.duplicateCompareLabel}>
          {duplicates.map((duplicate) => (
            <li key={duplicate.id} className={styles.compareCard}>
              <img
                className={styles.image}
                src={duplicate.imageUrl}
                alt={REVIEW_QUEUE_STRINGS.imageAlt(duplicate.cellLabel, duplicate.shotMonthLabel)}
                loading="lazy"
                width={320}
                height={240}
              />
              <p className={styles.badge}>{duplicate.statusLabel}</p>
              <dl className={styles.details}>
                <dt>{REVIEW_QUEUE_STRINGS.itemCellLabel}</dt>
                <dd>{duplicate.cellLabel}</dd>
                <dt>{REVIEW_QUEUE_STRINGS.itemMonthLabel}</dt>
                <dd>{duplicate.shotMonthLabel}</dd>
                <dt>{REVIEW_QUEUE_STRINGS.itemSpotLabel}</dt>
                <dd>{duplicate.spotName}</dd>
                <dt>{REVIEW_QUEUE_STRINGS.itemCaptionLabel}</dt>
                <dd>{duplicate.caption}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
