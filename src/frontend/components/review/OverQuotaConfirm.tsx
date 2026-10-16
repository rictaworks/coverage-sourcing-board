import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import { Icon } from '../common/Icon';
import styles from './review.module.css';

/**
 * 超過採用の確認（画面内）。枠を超える採用は、この確認を通すと、確認の印を付けて送ります。
 * 確認の操作は 2 段（採用・超過して採用する）です。ネイティブのダイアログは使いません。
 */
export function OverQuotaConfirm({
  disabled,
  onConfirm,
  onCancel,
}: {
  readonly disabled: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <section className={styles.overQuota} aria-labelledby="over-quota-title">
      <p id="over-quota-title" className={styles.overQuotaTitle}>
        <Icon icon={faTriangleExclamation} /> {REVIEW_QUEUE_STRINGS.overQuotaTitle}
      </p>
      <p className={styles.overQuotaBody}>{REVIEW_QUEUE_STRINGS.overQuotaBody}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primaryButton} onClick={onConfirm} disabled={disabled} autoFocus>
          {REVIEW_QUEUE_STRINGS.overQuotaConfirmButton}
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={disabled}>
          {REVIEW_QUEUE_STRINGS.overQuotaCancelButton}
        </button>
      </div>
    </section>
  );
}
