'use client';

import { useId, useState, type FormEvent } from 'react';
import { CAMPAIGN_API_CONFIG } from '../../../config/campaignApi';
import { CAMPAIGN_SETTINGS_STRINGS } from '../../../config/strings/campaignSettings';
import { PREFECTURE_NAMES } from '../../../config/strings/prefectures';
import { PREFECTURE_CODES, type PrefectureCode } from '../../../core/api/contract';
import { ErrorMessage } from '../common/ErrorMessage';
import styles from './campaign.module.css';

/** 区分値（エリア）の一覧と、追加の入力。追加の処理は親が行い、成功したら true を返します。 */
export function AreaAddForm({
  areaLabels,
  busy,
  error,
  onAdd,
}: {
  readonly areaLabels: readonly string[];
  readonly busy: boolean;
  readonly error: string | null;
  readonly onAdd: (prefecture: PrefectureCode, label: string) => Promise<boolean>;
}) {
  const [prefecture, setPrefecture] = useState<PrefectureCode>(PREFECTURE_CODES[0]);
  const [label, setLabel] = useState('');
  const selectId = useId();
  const inputId = useId();
  const helpId = useId();
  const errorId = useId();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const added = await onAdd(prefecture, label);
    if (added) {
      setLabel('');
    }
  };

  return (
    <section className={styles.block} aria-labelledby={`${inputId}-heading`}>
      <h2 id={`${inputId}-heading`} className={styles.heading}>
        {CAMPAIGN_SETTINGS_STRINGS.areaHeading}
      </h2>
      <p className={styles.help}>
        {CAMPAIGN_SETTINGS_STRINGS.areaCount(areaLabels.length, CAMPAIGN_API_CONFIG.areasMax)}
      </p>
      <p className={styles.fieldLabel}>{CAMPAIGN_SETTINGS_STRINGS.areaListLabel}</p>
      <ul className={styles.list}>
        {areaLabels.map((areaLabel, index) => (
          <li key={`${index}-${areaLabel}`}>{areaLabel}</li>
        ))}
      </ul>
      <form className={styles.field} onSubmit={handleSubmit} noValidate>
        <div className={styles.inline}>
          <div className={styles.field}>
            <label htmlFor={selectId} className={styles.fieldLabel}>
              {CAMPAIGN_SETTINGS_STRINGS.areaPrefectureLabel}
            </label>
            <select
              id={selectId}
              className={styles.select}
              value={prefecture}
              disabled={busy}
              onChange={(event) => setPrefecture(event.target.value as PrefectureCode)}
            >
              {PREFECTURE_CODES.map((code) => (
                <option key={code} value={code}>
                  {PREFECTURE_NAMES[code]}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor={inputId} className={styles.fieldLabel}>
              {CAMPAIGN_SETTINGS_STRINGS.areaLabelLabel}
            </label>
            <input
              id={inputId}
              className={`${styles.input} ${styles.inputWide}`}
              type="text"
              value={label}
              disabled={busy}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? `${helpId} ${errorId}` : helpId}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
        </div>
        <p id={helpId} className={styles.help}>
          {CAMPAIGN_SETTINGS_STRINGS.areaLabelHelp}
        </p>
        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={busy}>
            {CAMPAIGN_SETTINGS_STRINGS.areaAddButton}
          </button>
          {busy ? <p role="status" className={styles.help}>{CAMPAIGN_SETTINGS_STRINGS.areaAdding}</p> : null}
        </div>
        {error !== null ? <ErrorMessage id={errorId} message={error} /> : null}
      </form>
    </section>
  );
}
