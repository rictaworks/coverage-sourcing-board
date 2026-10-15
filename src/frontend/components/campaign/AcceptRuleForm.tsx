'use client';

import { useId } from 'react';
import { CAMPAIGN_SETTINGS_STRINGS } from '../../../config/strings/campaignSettings';
import {
  RULE_FIELD_RANGES,
  type AcceptRuleDraft,
} from '../../lib/api/campaignApi';
import { ErrorMessage } from '../common/ErrorMessage';
import styles from './campaign.module.css';

/** 数値の項目（編集できる）。キーは下書きの項目名。 */
const EDITABLE_FIELDS: readonly { readonly key: keyof AcceptRuleDraft; readonly label: string }[] = [
  { key: 'tolerancePercent', label: CAMPAIGN_SETTINGS_STRINGS.ruleToleranceLabel },
  { key: 'minShortPx', label: CAMPAIGN_SETTINGS_STRINGS.ruleMinShortLabel },
  { key: 'maxInputMegabytes', label: CAMPAIGN_SETTINGS_STRINGS.ruleMaxBytesLabel },
  { key: 'maxPixelsTenThousand', label: CAMPAIGN_SETTINGS_STRINGS.ruleMaxPixelsLabel },
];

/**
 * 受入条件の表示と、数値の項目の編集。
 * 比率・向き・許容形式・昼間・季節と月・同一地点の扱いは、表示だけにします（編集できません）。
 */
export function AcceptRuleForm({
  draft,
  fieldErrors,
  generalError,
  busy,
  onChange,
}: {
  readonly draft: AcceptRuleDraft;
  readonly fieldErrors: Readonly<Partial<Record<keyof AcceptRuleDraft, string>>>;
  readonly generalError: string | null;
  readonly busy: boolean;
  readonly onChange: (key: keyof AcceptRuleDraft, value: string) => void;
}) {
  const baseId = useId();
  const readOnlyRows = [
    { label: CAMPAIGN_SETTINGS_STRINGS.ruleRatioLabel, value: CAMPAIGN_SETTINGS_STRINGS.ruleRatioValue },
    { label: CAMPAIGN_SETTINGS_STRINGS.ruleOrientationLabel, value: CAMPAIGN_SETTINGS_STRINGS.ruleOrientationValue },
    { label: CAMPAIGN_SETTINGS_STRINGS.ruleFormatsLabel, value: CAMPAIGN_SETTINGS_STRINGS.ruleFormatsValue },
    { label: CAMPAIGN_SETTINGS_STRINGS.ruleDaytimeLabel, value: CAMPAIGN_SETTINGS_STRINGS.ruleDaytimeValue },
    { label: CAMPAIGN_SETTINGS_STRINGS.ruleSeasonMonthLabel, value: CAMPAIGN_SETTINGS_STRINGS.ruleSeasonMonthValue },
    { label: CAMPAIGN_SETTINGS_STRINGS.ruleSpotLabel, value: CAMPAIGN_SETTINGS_STRINGS.ruleSpotValue },
  ];

  return (
    <section className={styles.block} aria-labelledby={`${baseId}-heading`}>
      <h2 id={`${baseId}-heading`} className={styles.heading}>
        {CAMPAIGN_SETTINGS_STRINGS.ruleHeading}
      </h2>
      <p className={styles.help}>{CAMPAIGN_SETTINGS_STRINGS.ruleHelp}</p>
      {generalError !== null ? <ErrorMessage message={generalError} /> : null}
      <dl className={styles.ruleList}>
        {EDITABLE_FIELDS.map((field) => {
          const range = RULE_FIELD_RANGES[field.key];
          const inputId = `${baseId}-${field.key}`;
          const helpId = `${inputId}-help`;
          const errorId = `${inputId}-error`;
          const error = fieldErrors[field.key] ?? null;
          return (
            <div className={styles.ruleRow} key={field.key}>
              <dt>
                <label htmlFor={inputId}>{field.label}</label>
              </dt>
              <dd className={styles.ruleInputRow}>
                <input
                  id={inputId}
                  className={styles.input}
                  type="text"
                  inputMode={range.integer ? 'numeric' : 'decimal'}
                  value={draft[field.key]}
                  disabled={busy}
                  aria-invalid={error !== null}
                  aria-describedby={error !== null ? `${helpId} ${errorId}` : helpId}
                  onChange={(event) => onChange(field.key, event.target.value)}
                />
              </dd>
              <dd id={helpId} className={styles.help}>
                {CAMPAIGN_SETTINGS_STRINGS.ruleRangeHelp(range.min, range.max)}
              </dd>
              {error !== null ? (
                <dd id={errorId} className={styles.fieldError}>
                  {error}
                </dd>
              ) : null}
            </div>
          );
        })}
        {readOnlyRows.map((row) => (
          <div className={styles.ruleRow} key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
