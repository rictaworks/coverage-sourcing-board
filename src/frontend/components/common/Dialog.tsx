'use client';

import { useEffect, useId, useRef } from 'react';
import { DIALOG_STRINGS } from '../../../config/strings/dialog';
import styles from './common.module.css';

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly dismissLabel?: string;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}

/**
 * 確認ダイアログ。ネイティブの alert・confirm・prompt は使わず、<dialog> の modal で表示する。
 * Esc キーでは onDismiss を呼ぶ（ブラウザが閉じるだけにしない）。
 */
export function Dialog({
  open,
  title,
  message,
  confirmLabel = DIALOG_STRINGS.confirmLabel,
  dismissLabel = DIALOG_STRINGS.dismissLabel,
  onConfirm,
  onDismiss,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      <h2 id={titleId} className={styles.dialogTitle}>
        {title}
      </h2>
      <p>{message}</p>
      <div className={styles.dialogActions}>
        <button type="button" className={styles.secondaryButton} onClick={onDismiss}>
          {dismissLabel}
        </button>
        <button type="button" className={styles.primaryButton} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
