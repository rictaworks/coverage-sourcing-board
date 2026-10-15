'use client';

import { useId } from 'react';
import { SUBMIT_STRINGS } from '../../../config/strings/submit';
import styles from './submit.module.css';

/** 月の番号（1〜12）。 */
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** 撮影月の選択（必須）。季節は月から導出し、別に入力させません。 */
export function MonthSelect({
  value,
  seasonLabel,
  error,
  onChange,
}: {
  readonly value: string;
  /** 選んだ月の季節の表示名。未選択なら null。 */
  readonly seasonLabel: string | null;
  readonly error: string | null;
  readonly onChange: (month: string) => void;
}) {
  const selectId = useId();
  const helpId = useId();
  const errorId = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        {SUBMIT_STRINGS.monthLabel}
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
        <option value="">{SUBMIT_STRINGS.monthPlaceholder}</option>
        {MONTHS.map((month) => (
          <option key={month} value={String(month)}>
            {SUBMIT_STRINGS.monthOption(month)}
          </option>
        ))}
      </select>
      <p id={helpId} className={styles.help}>
        {seasonLabel === null ? SUBMIT_STRINGS.monthHelp : SUBMIT_STRINGS.seasonNote(seasonLabel)}
      </p>
      {error !== null ? (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
