'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMMON_STRINGS } from '../../../config/strings/common';
import { REVIEW_API_CODES, REVIEW_QUEUE_STRINGS } from '../../../config/strings/reviewQueue';
import { ReturnFormValidator, ReviewApi, ReviewViewBuilder, type ReturnFormInput, type ReviewScreenView } from '../../lib/api/reviewApi';
import { ApiError } from '../../lib/apiClient';
import { Dialog } from '../common/Dialog';
import { ErrorMessage } from '../common/ErrorMessage';
import { AcceptedList } from './AcceptedList';
import { QueueList, type ActionErrorView } from './QueueList';
import { ReturnDialog, type ReturnTarget } from './ReturnDialog';
import styles from './review.module.css';

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly view: ReviewScreenView }
  | { readonly kind: 'error'; readonly message: string };

/** 1 回の操作の結果。失敗のときは、API の文言（ApiError）か、通信の失敗の文言を入れます。 */
type Outcome = { readonly ok: true } | { readonly ok: false; readonly message: string; readonly code: string | null };

/** API の失敗の文言。ApiError は API の応答の文言をそのまま使い、それ以外は通信の失敗の文言を使います。 */
function outcomeOf(error: unknown): Extract<Outcome, { ok: false }> {
  if (error instanceof ApiError) {
    return { ok: false, message: error.message, code: error.code };
  }
  return { ok: false, message: REVIEW_QUEUE_STRINGS.requestFailed, code: null };
}

/**
 * 確認キューの画面。一覧の取得・採用（超過採用の確認を含む）・差し戻し・採用の取り消しを行います。
 * 操作の後は一覧を読み直します。処理中は操作を無効にし、二重の送信を防ぎます。
 * 失敗のときは代わりの値を作らず、API の文言を表示します。
 */
export function ReviewScreen() {
  const api = useMemo(() => new ReviewApi(), []);
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ActionErrorView | null>(null);
  const [overQuotaId, setOverQuotaId] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<ReturnTarget | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  /** 二重の送信を防ぐための印（state の反映を待たずに判定する）。 */
  const inFlight = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const queue = await api.loadQueue();
      const hasAnything = queue.items.length + queue.accepted.length > 0;
      const labels = hasAnything ? await api.loadCellLabels() : new Map<string, string>();
      setState({ kind: 'ready', view: new ReviewViewBuilder().build(queue, labels) });
    } catch (error) {
      setState({ kind: 'error', message: outcomeOf(error).message });
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 送信の共通の処理。処理中は受け付けず、結果を返します（画面の更新は呼び出し側）。 */
  const execute = async (action: () => Promise<unknown>): Promise<Outcome> => {
    if (inFlight.current) {
      return { ok: false, message: REVIEW_QUEUE_STRINGS.busy, code: null };
    }
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
      return { ok: true };
    } catch (error) {
      return outcomeOf(error);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const onAccept = async (submissionId: string, confirmOverQuota: boolean): Promise<void> => {
    setNotice(null);
    setActionError(null);
    const outcome = await execute(() => api.accept(submissionId, confirmOverQuota));
    if (outcome.ok) {
      setOverQuotaId(null);
      setNotice(REVIEW_QUEUE_STRINGS.accepted);
      await load();
      return;
    }
    if (!confirmOverQuota && outcome.code === REVIEW_API_CODES.overQuotaConfirmationRequired) {
      setOverQuotaId(submissionId);
      return;
    }
    setActionError({ submissionId, message: outcome.message });
  };

  const onSubmitReturn = async (form: ReturnFormInput): Promise<void> => {
    if (returnTarget === null) {
      return;
    }
    const checked = new ReturnFormValidator().validate(form);
    if (!checked.ok) {
      setReturnTarget({ ...returnTarget, error: checked.message });
      return;
    }
    const target = returnTarget;
    const outcome = await execute(() =>
      target.mode === 'return'
        ? api.returnSubmission(target.id, checked.request)
        : api.revoke(target.id, checked.request),
    );
    if (!outcome.ok) {
      setReturnTarget({ ...target, error: outcome.message });
      return;
    }
    setReturnTarget(null);
    setNotice(target.mode === 'return' ? REVIEW_QUEUE_STRINGS.returned : REVIEW_QUEUE_STRINGS.revoked);
    setActionError(null);
    await load();
  };

  return (
    <div className={styles.screen}>
      <p>{REVIEW_QUEUE_STRINGS.lead}</p>
      <div>
        <button type="button" className={styles.button} onClick={() => void load()} disabled={busy}>
          {REVIEW_QUEUE_STRINGS.reloadLabel}
        </button>
      </div>
      {busy ? <p role="status" className={styles.statusLine}>{REVIEW_QUEUE_STRINGS.busy}</p> : null}
      {notice !== null ? <p role="status" className={styles.statusLine}>{notice}</p> : null}
      {renderBody(state, {
        busy,
        overQuotaId,
        actionError,
        onAccept: (id) => void onAccept(id, false),
        onConfirmOverQuota: (id) => void onAccept(id, true),
        onCancelOverQuota: () => setOverQuotaId(null),
        onReturn: (id) => {
          setNotice(null);
          setActionError(null);
          setReturnTarget({ id, mode: 'return', error: null });
        },
        onRevoke: (id) => {
          setNotice(null);
          setActionError(null);
          setRevokeConfirmId(id);
        },
      })}
      <Dialog
        open={revokeConfirmId !== null}
        title={REVIEW_QUEUE_STRINGS.revokeTitle}
        message={REVIEW_QUEUE_STRINGS.revokeConfirmMessage}
        confirmLabel={REVIEW_QUEUE_STRINGS.revokeConfirmLabel}
        dismissLabel={REVIEW_QUEUE_STRINGS.revokeConfirmDismissLabel}
        onConfirm={() => {
          if (revokeConfirmId !== null) {
            setReturnTarget({ id: revokeConfirmId, mode: 'revoke', error: null });
          }
          setRevokeConfirmId(null);
        }}
        onDismiss={() => setRevokeConfirmId(null)}
      />
      <ReturnDialog
        target={returnTarget}
        busy={busy}
        onSubmit={(form) => void onSubmitReturn(form)}
        onDismiss={() => setReturnTarget(null)}
      />
    </div>
  );
}

interface BodyHandlers {
  readonly busy: boolean;
  readonly overQuotaId: string | null;
  readonly actionError: ActionErrorView | null;
  readonly onAccept: (submissionId: string) => void;
  readonly onConfirmOverQuota: (submissionId: string) => void;
  readonly onCancelOverQuota: () => void;
  readonly onReturn: (submissionId: string) => void;
  readonly onRevoke: (submissionId: string) => void;
}

/** 読み込み中・失敗・表示の 3 つの状態を明示的に分けます。 */
function renderBody(state: ScreenState, handlers: BodyHandlers) {
  if (state.kind === 'loading') {
    return <p role="status">{COMMON_STRINGS.loading}</p>;
  }
  if (state.kind === 'error') {
    return <ErrorMessage message={state.message} />;
  }
  return (
    <>
      <section className={styles.section} aria-labelledby="review-queue-heading">
        <h2 id="review-queue-heading" className={styles.heading}>
          {REVIEW_QUEUE_STRINGS.queueHeading}
        </h2>
        <QueueList
          items={state.view.items}
          busy={handlers.busy}
          overQuotaId={handlers.overQuotaId}
          actionError={handlers.actionError}
          onAccept={handlers.onAccept}
          onConfirmOverQuota={handlers.onConfirmOverQuota}
          onCancelOverQuota={handlers.onCancelOverQuota}
          onReturn={handlers.onReturn}
        />
      </section>
      <section className={styles.section} aria-labelledby="review-accepted-heading">
        <h2 id="review-accepted-heading" className={styles.heading}>
          {REVIEW_QUEUE_STRINGS.acceptedHeading}
        </h2>
        <p className={styles.notice}>{REVIEW_QUEUE_STRINGS.acceptedNotice}</p>
        <AcceptedList
          items={state.view.accepted}
          busy={handlers.busy}
          actionError={handlers.actionError}
          onRevoke={handlers.onRevoke}
        />
      </section>
    </>
  );
}
