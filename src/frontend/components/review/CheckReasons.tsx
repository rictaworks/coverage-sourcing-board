import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import type { CheckReasonView } from '../../lib/api/reviewApi';
import { Icon } from '../common/Icon';
import styles from './review.module.css';

/** 要確認の理由の一覧。「要確認」の文字と項目の名前で示し、色だけに頼りません（QC07）。 */
export function CheckReasons({ checks }: { readonly checks: readonly CheckReasonView[] }) {
  return (
    <section className={styles.block} aria-label={REVIEW_QUEUE_STRINGS.checksHeading}>
      <h3 className={styles.subHeading}>{REVIEW_QUEUE_STRINGS.checksHeading}</h3>
      {checks.length === 0 ? (
        <p className={styles.notice}>{REVIEW_QUEUE_STRINGS.checksEmpty}</p>
      ) : (
        <ul className={styles.reasonList}>
          {checks.map((check) => (
            <li key={check.item} className={styles.reasonItem}>
              <span className={styles.reasonBadge}>
                <Icon icon={faTriangleExclamation} /> {REVIEW_QUEUE_STRINGS.checkBadgeText(check.label)}
              </span>
              <p>{check.message}</p>
              <p className={styles.reasonFix}>
                {REVIEW_QUEUE_STRINGS.checkFixPrefix}
                {check.fix}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
