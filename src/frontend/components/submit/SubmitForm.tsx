'use client';

import { useId, type Ref } from 'react';
import type { AreaView } from '../../../core/api/contract';
import { LIMITS } from '../../../config/limits';
import { SUBMIT_STRINGS } from '../../../config/strings/submit';
import { remainingChars, type FormField, type SubmitFormValues } from '../../lib/submit/runChecks';
import { AreaSelect } from './AreaSelect';
import { DeclarationChecks } from './DeclarationChecks';
import { HoneypotField } from './HoneypotField';
import { MonthSelect } from './MonthSelect';
import styles from './submit.module.css';

/** 入力欄の誤り（欄ごとの文言）。 */
export type FieldErrors = Partial<Record<FormField, string>>;

/**
 * 投稿の入力欄（市町村・撮影月・地点名・説明文・申告・同意・ハニーポット）。
 * 値の検査は親（SubmitScreen）が行い、ここは表示と入力だけを担当します。
 */
export function SubmitForm({
  areas,
  values,
  errors,
  seasonLabel,
  honeypotRef,
  disabled,
  onChange,
}: {
  readonly areas: readonly AreaView[];
  readonly values: SubmitFormValues;
  readonly errors: FieldErrors;
  readonly seasonLabel: string | null;
  readonly honeypotRef: Ref<HTMLInputElement>;
  readonly disabled: boolean;
  readonly onChange: (next: Partial<SubmitFormValues>) => void;
}) {
  const spotId = useId();
  const spotHelpId = useId();
  const spotErrorId = useId();
  const captionId = useId();
  const captionHelpId = useId();
  const captionErrorId = useId();
  return (
    <fieldset className={styles.formFields} disabled={disabled}>
      <legend className={styles.legend}>{SUBMIT_STRINGS.formHeading}</legend>
      <AreaSelect areas={areas} value={values.areaId} error={errors.area ?? null} onChange={(areaId) => onChange({ areaId })} />
      <MonthSelect
        value={values.shotMonth}
        seasonLabel={seasonLabel}
        error={errors.month ?? null}
        onChange={(shotMonth) => onChange({ shotMonth })}
      />

      <div className={styles.field}>
        <label htmlFor={spotId} className={styles.label}>
          {SUBMIT_STRINGS.spotNameLabel}
        </label>
        <input
          id={spotId}
          type="text"
          className={styles.input}
          value={values.spotName}
          aria-describedby={errors.spotName === undefined ? spotHelpId : `${spotHelpId} ${spotErrorId}`}
          aria-invalid={errors.spotName !== undefined}
          onChange={(event) => onChange({ spotName: event.currentTarget.value })}
        />
        <p id={spotHelpId} className={styles.help}>
          {SUBMIT_STRINGS.spotNameHelp} {SUBMIT_STRINGS.remaining(remainingChars(values.spotName, LIMITS.spotNameMaxChars))}
        </p>
        {errors.spotName !== undefined ? (
          <p id={spotErrorId} className={styles.fieldError}>
            {errors.spotName}
          </p>
        ) : null}
      </div>

      <div className={styles.field}>
        <label htmlFor={captionId} className={styles.label}>
          {SUBMIT_STRINGS.captionLabel}
        </label>
        <input
          id={captionId}
          type="text"
          className={styles.input}
          value={values.caption}
          aria-describedby={errors.caption === undefined ? captionHelpId : `${captionHelpId} ${captionErrorId}`}
          aria-invalid={errors.caption !== undefined}
          onChange={(event) => onChange({ caption: event.currentTarget.value })}
        />
        <p id={captionHelpId} className={styles.help}>
          {SUBMIT_STRINGS.captionHelp} {SUBMIT_STRINGS.remaining(remainingChars(values.caption, LIMITS.captionMaxChars))}
        </p>
        {errors.caption !== undefined ? (
          <p id={captionErrorId} className={styles.fieldError}>
            {errors.caption}
          </p>
        ) : null}
      </div>

      <DeclarationChecks
        declaredNotAi={values.declaredNotAi}
        declaredNotReused={values.declaredNotReused}
        consent={values.consent}
        declarationError={errors.declaration ?? null}
        consentError={errors.consent ?? null}
        onChange={(next) => onChange(next)}
      />
      <HoneypotField inputRef={honeypotRef} />
    </fieldset>
  );
}
