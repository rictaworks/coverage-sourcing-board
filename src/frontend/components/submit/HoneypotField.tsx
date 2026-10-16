import type { Ref } from 'react';
import { SUBMISSION_FORM_FIELDS } from '../../../core/api/contract';
import { SUBMIT_STRINGS } from '../../../config/strings/submit';
import styles from './submit.module.css';

/**
 * ハニーポット欄。人には見えず、読み上げとキーボードの移動の対象からも外します（CSS・aria-hidden・tabindex）。
 * 値が入ったまま送られると、Worker が拒否します。人は入力しません。
 */
export function HoneypotField({ inputRef }: { readonly inputRef: Ref<HTMLInputElement> }) {
  return (
    <div className={styles.honeypot} aria-hidden="true">
      <label htmlFor="submit-honeypot">{SUBMIT_STRINGS.honeypotLabel}</label>
      <input
        ref={inputRef}
        id="submit-honeypot"
        name={SUBMISSION_FORM_FIELDS.honeypot}
        type="text"
        tabIndex={-1}
        autoComplete="off"
        defaultValue=""
      />
    </div>
  );
}
