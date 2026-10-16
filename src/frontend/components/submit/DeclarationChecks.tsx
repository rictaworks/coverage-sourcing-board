'use client';

import { SUBMIT_STRINGS } from '../../../config/strings/submit';
import styles from './submit.module.css';

/** 申告（AI 生成でない・他で使っていない）と同意。すべて必須です。 */
export function DeclarationChecks({
  declaredNotAi,
  declaredNotReused,
  consent,
  declarationError,
  consentError,
  onChange,
}: {
  readonly declaredNotAi: boolean;
  readonly declaredNotReused: boolean;
  readonly consent: boolean;
  readonly declarationError: string | null;
  readonly consentError: string | null;
  readonly onChange: (next: { declaredNotAi?: boolean; declaredNotReused?: boolean; consent?: boolean }) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{SUBMIT_STRINGS.declarationHeading}</legend>
      <div className={styles.checkGroup}>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            name="declaredNotAi"
            checked={declaredNotAi}
            required
            aria-invalid={declarationError !== null}
            onChange={(event) => onChange({ declaredNotAi: event.currentTarget.checked })}
          />
          <span>
            {SUBMIT_STRINGS.declaredNotAiLabel}
            <span className={styles.required}>{SUBMIT_STRINGS.requiredMark}</span>
          </span>
        </label>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            name="declaredNotReused"
            checked={declaredNotReused}
            required
            aria-invalid={declarationError !== null}
            onChange={(event) => onChange({ declaredNotReused: event.currentTarget.checked })}
          />
          <span>
            {SUBMIT_STRINGS.declaredNotReusedLabel}
            <span className={styles.required}>{SUBMIT_STRINGS.requiredMark}</span>
          </span>
        </label>
        {declarationError !== null ? <p className={styles.fieldError}>{declarationError}</p> : null}
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            required
            aria-invalid={consentError !== null}
            onChange={(event) => onChange({ consent: event.currentTarget.checked })}
          />
          <span>
            {SUBMIT_STRINGS.consentLabel}
            <span className={styles.required}>{SUBMIT_STRINGS.requiredMark}</span>
          </span>
        </label>
        {consentError !== null ? <p className={styles.fieldError}>{consentError}</p> : null}
      </div>
    </fieldset>
  );
}
