'use client';

import { useId } from 'react';
import { PREPARE_STRINGS } from '../../../config/strings/prepare';
import styles from './prepare.module.css';

/** 写真の選択。形式は選んだあとに中身で判定します（accept は選択の補助です）。 */
export function ImagePicker({
  disabled,
  onSelect,
}: {
  readonly disabled: boolean;
  readonly onSelect: (file: File) => void;
}) {
  const inputId = useId();
  const helpId = useId();
  return (
    <div className={styles.picker}>
      <label htmlFor={inputId} className={styles.pickerLabel}>
        {PREPARE_STRINGS.pickLabel}
      </label>
      <p id={helpId} className={styles.help}>
        {PREPARE_STRINGS.pickHelp}
      </p>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png"
        disabled={disabled}
        aria-describedby={helpId}
        className={styles.fileInput}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file !== undefined) {
            onSelect(file);
          }
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}
