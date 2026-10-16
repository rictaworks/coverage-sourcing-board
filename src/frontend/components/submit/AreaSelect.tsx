'use client';

import { useId } from 'react';
import type { AreaView } from '../../../core/api/contract';
import { PREFECTURE_NAMES } from '../../../config/strings/prefectures';
import { SUBMIT_STRINGS } from '../../../config/strings/submit';
import styles from './submit.module.css';

/** 市町村（区分）の選択。選べるのは、キャンペーンの区分値だけです（自由入力にしません）。 */
export function AreaSelect({
  areas,
  value,
  error,
  onChange,
}: {
  readonly areas: readonly AreaView[];
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (areaId: string) => void;
}) {
  const selectId = useId();
  const helpId = useId();
  const errorId = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        {SUBMIT_STRINGS.areaLabel}
        <span className={styles.required}>{SUBMIT_STRINGS.requiredMark}</span>
      </label>
      <select
        id={selectId}
        className={styles.input}
        value={value}
        required
        aria-describedby={error === null ? helpId : `${helpId} ${errorId}`}
        aria-invalid={error !== null}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="">{SUBMIT_STRINGS.areaPlaceholder}</option>
        {areas.map((area) => (
          <option key={area.id} value={area.id}>
            {`${PREFECTURE_NAMES[area.prefecture]} ${area.label}`}
          </option>
        ))}
      </select>
      <p id={helpId} className={styles.help}>
        {SUBMIT_STRINGS.areaHelp}
      </p>
      {error !== null ? (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
