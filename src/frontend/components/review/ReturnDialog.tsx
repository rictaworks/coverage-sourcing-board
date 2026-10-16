'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { RETURN_REASON_CODES } from '../../../core/api/contract';
import { LIMITS } from '../../../config/limits';
import { RETURN_REASON_LABELS } from '../../../config/strings/returnReasons';
import { REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import type { ReturnFormInput } from '../../lib/api/reviewApi';
import { ErrorMessage } from '../common/ErrorMessage';
import styles from './review.module.css';

/** ダイアログの対象。mode が return なら差し戻し、revoke なら採用の取り消し。error は直前の操作の誤り。 */
export interface ReturnTarget {
  readonly id: string;
  readonly mode: 'return' | 'revoke';
  readonly error: string | null;
}

export interface ReturnDialogProps {
  readonly target: ReturnTarget | null;
  readonly busy: boolean;
  readonly onSubmit: (form: ReturnFormInput) => void;
  readonly onDismiss: () => void;
}

const EMPTY_FORM: ReturnFormInput = { reasonCode: null, freeText: '', resubmittable: null };

/**
 * 差し戻し・採用の取り消しのダイアログ。閉じているとき（target が null）は何も描画しません。
 * 開くたびに本体を作り直すため、入力は空から始まります（前回の入力を残しません）。
 */
export function ReturnDialog(props: ReturnDialogProps) {
  const { target, ...rest } = props;
  if (target === null) {
    return null;
  }
  return <ReturnDialogBody key={`${target.mode}:${target.id}`} target={target} {...rest} />;
}

interface ReturnDialogBodyProps {
  readonly target: ReturnTarget;
  readonly busy: boolean;
  readonly onSubmit: (form: ReturnFormInput) => void;
  readonly onDismiss: () => void;
}

/**
 * ダイアログの本体。理由・自由記述・再投稿の可否を入力します。
 * ネイティブの alert・confirm は使わず、<dialog> を modal で開きます。Esc では onDismiss を呼びます。
 */
function ReturnDialogBody({ target, busy, onSubmit, onDismiss }: ReturnDialogBodyProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reasonName = useId();
  const freeTextId = useId();
  const resubmittableName = useId();
  const [form, setForm] = useState<ReturnFormInput>(EMPTY_FORM);
  const mode = target.mode;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }, []);

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
        {mode === 'return' ? REVIEW_QUEUE_STRINGS.returnTitle : REVIEW_QUEUE_STRINGS.revokeTitle}
      </h2>
      {mode === 'revoke' ? <p className={styles.notice}>{REVIEW_QUEUE_STRINGS.revokeReturnNotice}</p> : null}
      {target.error ? <ErrorMessage message={target.error} /> : null}
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) {
            onSubmit(form);
          }
        }}
      >
        <fieldset className={styles.fieldset}>
          <legend>{REVIEW_QUEUE_STRINGS.returnReasonLegend}</legend>
          {RETURN_REASON_CODES.map((code) => (
            <label key={code} className={styles.choice}>
              <input
                type="radio"
                name={reasonName}
                value={code}
                checked={form.reasonCode === code}
                onChange={() => setForm({ ...form, reasonCode: code })}
              />
              <span>{RETURN_REASON_LABELS[code]}</span>
            </label>
          ))}
        </fieldset>
        <div className={styles.block}>
          <label htmlFor={freeTextId}>{REVIEW_QUEUE_STRINGS.returnFreeTextLabel}</label>
          <p id={`${freeTextId}-help`} className={styles.notice}>
            {REVIEW_QUEUE_STRINGS.returnFreeTextHelp(LIMITS.returnReasonMaxChars)}
          </p>
          <textarea
            id={freeTextId}
            className={styles.textarea}
            aria-describedby={`${freeTextId}-help`}
            value={form.freeText}
            onChange={(event) => setForm({ ...form, freeText: event.target.value })}
          />
        </div>
        <fieldset className={styles.fieldset}>
          <legend>{REVIEW_QUEUE_STRINGS.returnResubmittableLegend}</legend>
          <label className={styles.choice}>
            <input
              type="radio"
              name={resubmittableName}
              value="yes"
              checked={form.resubmittable === true}
              onChange={() => setForm({ ...form, resubmittable: true })}
            />
            <span>{REVIEW_QUEUE_STRINGS.returnResubmittableYes}</span>
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name={resubmittableName}
              value="no"
              checked={form.resubmittable === false}
              onChange={() => setForm({ ...form, resubmittable: false })}
            />
            <span>{REVIEW_QUEUE_STRINGS.returnResubmittableNo}</span>
          </label>
        </fieldset>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.secondaryButton} onClick={onDismiss} disabled={busy}>
            {REVIEW_QUEUE_STRINGS.dialogCancelButton}
          </button>
          <button type="submit" className={styles.primaryButton} disabled={busy}>
            {mode === 'return' ? REVIEW_QUEUE_STRINGS.returnSubmitButton : REVIEW_QUEUE_STRINGS.revokeSubmitButton}
          </button>
        </div>
      </form>
    </dialog>
  );
}
