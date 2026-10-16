import { faCircleInfo, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import type { SubjectView } from '../../lib/api/reviewApi';
import { Icon } from '../common/Icon';
import styles from './review.module.css';

/** 被写体の推定（補助）。「補助」と明示し、確信度が低いときは「判定が確かでない」を添えます。根拠の表示にはしません。 */
export function SubjectHintView({ subject }: { readonly subject: SubjectView }) {
  return (
    <section className={styles.block} aria-label={REVIEW_QUEUE_STRINGS.subjectHeading}>
      <h3 className={styles.subHeading}>{REVIEW_QUEUE_STRINGS.subjectHeading}</h3>
      <p className={styles.notice}>
        <Icon icon={faCircleInfo} /> {REVIEW_QUEUE_STRINGS.subjectNotice}
      </p>
      <div className={styles.subjectBox}>
        {subject.status === 'none' ? (
          <p>{subject.message}</p>
        ) : (
          <>
            <p>
              {REVIEW_QUEUE_STRINGS.subjectKindAndConfidence(subject.kindLabel, subject.confidenceLabel)}
            </p>
            {subject.uncertain && subject.uncertainMessage !== null ? (
              <p className={styles.uncertain}>
                <Icon icon={faTriangleExclamation} /> {subject.uncertainMessage}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
