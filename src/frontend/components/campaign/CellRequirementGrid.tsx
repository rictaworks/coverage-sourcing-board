'use client';

import { useId, useMemo } from 'react';
import { CAMPAIGN_SETTINGS_STRINGS } from '../../../config/strings/campaignSettings';
import { PREFECTURE_NAMES } from '../../../config/strings/prefectures';
import type { CampaignCellView, CampaignDetailView } from '../../lib/api/campaignApi';
import styles from './campaign.module.css';

/**
 * 必要数の表（エリア × 季節）と、一律の値の入力。
 * 入力の値と検査の文言は親が持ち、この部品は表示と入力の受け渡しだけを行います。
 */
export function CellRequirementGrid({
  campaign,
  values,
  cellErrors,
  generalError,
  uniformRaw,
  uniformError,
  busy,
  onUniformRawChange,
  onApplyUniform,
  onCellChange,
}: {
  readonly campaign: CampaignDetailView;
  readonly values: Readonly<Record<string, string>>;
  readonly cellErrors: Readonly<Record<string, string>>;
  readonly generalError: string | null;
  readonly uniformRaw: string;
  readonly uniformError: string | null;
  readonly busy: boolean;
  readonly onUniformRawChange: (value: string) => void;
  readonly onApplyUniform: () => void;
  readonly onCellChange: (cellId: string, value: string) => void;
}) {
  const baseId = useId();
  const uniformId = `${baseId}-uniform`;
  const uniformErrorId = `${baseId}-uniform-error`;
  const cellByKey = useMemo(() => {
    const map = new Map<string, CampaignCellView>();
    for (const cell of campaign.cells) {
      map.set(`${cell.areaId}|${cell.periodId}`, cell);
    }
    return map;
  }, [campaign.cells]);

  return (
    <section className={styles.block} aria-labelledby={`${baseId}-heading`}>
      <h2 id={`${baseId}-heading`} className={styles.heading}>
        {CAMPAIGN_SETTINGS_STRINGS.gridHeading}
      </h2>
      <p className={styles.help}>{CAMPAIGN_SETTINGS_STRINGS.gridHelp}</p>
      <p className={styles.fieldLabel}>{CAMPAIGN_SETTINGS_STRINGS.periodHeading}</p>
      <ul className={styles.list}>
        {campaign.periods.map((period) => (
          <li key={period.id}>
            {CAMPAIGN_SETTINGS_STRINGS.periodItem(period.label, CAMPAIGN_SETTINGS_STRINGS.periodMonths(period.months))}
          </li>
        ))}
      </ul>

      <div className={styles.field}>
        <label htmlFor={uniformId} className={styles.fieldLabel}>
          {CAMPAIGN_SETTINGS_STRINGS.uniformLabel}
        </label>
        <div className={styles.inline}>
          <input
            id={uniformId}
            className={styles.input}
            type="text"
            inputMode="numeric"
            value={uniformRaw}
            disabled={busy}
            aria-invalid={uniformError !== null}
            aria-describedby={uniformErrorId}
            onChange={(event) => onUniformRawChange(event.target.value)}
          />
          <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} disabled={busy} onClick={onApplyUniform}>
            {CAMPAIGN_SETTINGS_STRINGS.uniformButton}
          </button>
        </div>
        <p id={uniformErrorId} className={styles.help}>
          {uniformError ?? CAMPAIGN_SETTINGS_STRINGS.uniformHelp}
        </p>
      </div>

      {generalError !== null ? (
        <p role="alert" className={styles.fieldError}>
          {generalError}
        </p>
      ) : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.visuallyHidden}>{CAMPAIGN_SETTINGS_STRINGS.gridLabel}</caption>
          <thead>
            <tr>
              <th scope="col">{CAMPAIGN_SETTINGS_STRINGS.gridAreaHeader}</th>
              {campaign.periods.map((period) => (
                <th scope="col" key={period.id}>
                  {period.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaign.areas.map((area) => (
              <tr key={area.id}>
                <th scope="row" className={styles.rowHeader}>
                  <span className={styles.prefecture}>{PREFECTURE_NAMES[area.prefecture]}</span>
                  <span>{area.label}</span>
                </th>
                {campaign.periods.map((period, periodIndex) => {
                  const cell = cellByKey.get(`${area.id}|${period.id}`);
                  if (cell === undefined) {
                    throw new Error(`cell is missing for ${area.id}|${period.id}`);
                  }
                  const inputId = `${baseId}-cell-${area.id}-${period.id}`;
                  const errorId = `${inputId}-error`;
                  const error = cellErrors[cell.cellId] ?? null;
                  return (
                    <td key={period.id}>
                      <label htmlFor={inputId} className={styles.visuallyHidden}>
                        {CAMPAIGN_SETTINGS_STRINGS.cellLabel(area.label, period.label)}
                      </label>
                      <input
                        id={inputId}
                        className={styles.cellInput}
                        type="text"
                        inputMode="numeric"
                        value={values[cell.cellId] ?? ''}
                        disabled={busy}
                        aria-invalid={error !== null}
                        aria-describedby={error !== null ? errorId : undefined}
                        onChange={(event) => onCellChange(cell.cellId, event.target.value)}
                      />
                      {error !== null ? (
                        <span id={errorId} className={styles.cellError}>
                          {error}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
