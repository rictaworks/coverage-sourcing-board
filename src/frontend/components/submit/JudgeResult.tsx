'use client';

import { faCircleCheck, faCircleXmark, faTriangleExclamation, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { CHECK_ITEM_LABELS, CHECK_REASON_TEXT } from '../../../config/strings/checks';
import { SUBJECT_HINT_STRINGS, SUBJECT_KIND_LABELS } from '../../../config/strings/subjectHint';
import { SUBMIT_STRINGS } from '../../../config/strings/submit';
import type { CheckResult, Verdict } from '../../../core/types';
import type { ServerReason, SubjectView } from '../../lib/submit/submitApi';
import { Icon } from '../common/Icon';
import styles from './submit.module.css';

/** 判定の結果の表示（項目ごとの合格・不合格・要確認と、修正方法）。色だけに頼らず、印と文字で示します。 */
const VERDICT_VIEW: Record<Exclude<Verdict, 'info'>, { readonly label: string; readonly icon: IconDefinition; readonly className: string }> = {
  pass: { label: SUBMIT_STRINGS.verdictPass, icon: faCircleCheck, className: styles.verdictPass },
  review: { label: SUBMIT_STRINGS.verdictReview, icon: faTriangleExclamation, className: styles.verdictReview },
  fail: { label: SUBMIT_STRINGS.verdictFail, icon: faCircleXmark, className: styles.verdictFail },
};

/** 理由の文言（文言は src/config/strings/checks.ts）。知らない理由のコードは、文言を作らず null にします。 */
export function reasonTextOf(reasonCode: string): { readonly message: string; readonly fix: string } | null {
  return Object.prototype.hasOwnProperty.call(CHECK_REASON_TEXT, reasonCode)
    ? CHECK_REASON_TEXT[reasonCode as keyof typeof CHECK_REASON_TEXT]
    : null;
}

/** 項目の表示名。知らない項目のコードは null にします。 */
function itemLabelOf(item: string): string | null {
  return Object.prototype.hasOwnProperty.call(CHECK_ITEM_LABELS, item)
    ? CHECK_ITEM_LABELS[item as keyof typeof CHECK_ITEM_LABELS]
    : null;
}

export function JudgeResult({
  results,
  serverReasons,
}: {
  readonly results: readonly CheckResult[];
  /** 送信の応答の不合格の理由（Worker の判定）。 */
  readonly serverReasons: readonly ServerReason[];
}) {
  const failed = results.some((result) => result.verdict === 'fail');
  const summary = failed ? SUBMIT_STRINGS.summaryFail : results.some((result) => result.verdict === 'review') ? SUBMIT_STRINGS.summaryReview : SUBMIT_STRINGS.summaryPass;
  return (
    <section className={styles.block} aria-labelledby="judge-heading">
      <h2 id="judge-heading" className={styles.heading}>
        {SUBMIT_STRINGS.resultHeading}
      </h2>
      <p className={styles.summary} role="status">
        {summary}
      </p>
      <ul className={styles.resultList}>
        {results.map((result, index) => {
          if (result.verdict === 'info') {
            return null;
          }
          const view = VERDICT_VIEW[result.verdict];
          const text = reasonTextOf(result.reasonCode);
          const label = itemLabelOf(result.item);
          return (
            <li key={`${result.item}-${result.reasonCode}-${index}`} className={styles.resultItem}>
              <p className={styles.resultHead}>
                <span className={view.className}>
                  <Icon icon={view.icon} />
                  <span>{view.label}</span>
                </span>
                {label !== null ? <span className={styles.itemName}>{label}</span> : null}
              </p>
              {text !== null ? <p className={styles.resultMessage}>{text.message}</p> : null}
              {text !== null && result.verdict !== 'pass' ? (
                <p className={styles.fix}>{SUBMIT_STRINGS.fixLine(text.fix)}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      {serverReasons.length > 0 ? (
        <div className={styles.serverReasons}>
          <h3 className={styles.subHeading}>{SUBMIT_STRINGS.serverReasonsHeading}</h3>
          <ul className={styles.resultList}>
            {serverReasons.map((reason, index) => {
              const text = reasonTextOf(reason.reasonCode);
              const label = itemLabelOf(reason.item);
              return (
                <li key={`${reason.item}-${reason.reasonCode}-${index}`} className={styles.resultItem}>
                  <p className={styles.resultHead}>
                    <span className={styles.verdictFail}>
                      <Icon icon={faCircleXmark} />
                      <span>{SUBMIT_STRINGS.verdictFail}</span>
                    </span>
                    {label !== null ? <span className={styles.itemName}>{label}</span> : null}
                  </p>
                  {text !== null ? <p className={styles.resultMessage}>{text.message}</p> : null}
                  {text !== null ? <p className={styles.fix}>{SUBMIT_STRINGS.fixLine(text.fix)}</p> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

    </section>
  );
}

/** 被写体の推定（補助）。推定できないときは「被写体の推定はありません」を示します。 */
export function SubjectNote({ subject }: { readonly subject: SubjectView }) {
  if (subject.status === 'none') {
    return (
      <div className={styles.subject}>
        <h3 className={styles.subHeading}>{SUBMIT_STRINGS.subjectHeading}</h3>
        <p>{SUBJECT_HINT_STRINGS.noneMessage}</p>
        {subject.resumeNotice !== null ? <p>{subject.resumeNotice}</p> : null}
        <p className={styles.help}>{SUBMIT_STRINGS.subjectNote}</p>
      </div>
    );
  }
  return (
    <div className={styles.subject}>
      <h3 className={styles.subHeading}>{SUBMIT_STRINGS.subjectHeading}</h3>
      <p>
        {SUBMIT_STRINGS.subjectKindPrefix}
        {SUBJECT_KIND_LABELS[subject.kind]}
        {subject.uncertain ? SUBMIT_STRINGS.uncertainSuffix(SUBJECT_HINT_STRINGS.uncertainMessage) : null}
      </p>
      <p className={styles.help}>{SUBMIT_STRINGS.subjectNote}</p>
    </div>
  );
}
