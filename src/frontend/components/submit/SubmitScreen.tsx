'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_ENDPOINTS } from '../../../core/api/paths';
import type { CoverageResponse, MySubmissionsResponse } from '../../../core/api/contract';
import { API_ERROR_MESSAGES } from '../../../config/strings/apiErrors';
import { COMMON_STRINGS } from '../../../config/strings/common';
import { SEASON_LABELS } from '../../../config/strings/checks';
import { SUBMIT_FORM_ERRORS, SUBMIT_QUERY_KEYS, SUBMIT_STRINGS } from '../../../config/strings/submit';
import type { CheckResult } from '../../../core/types';
import { seasonOfMonth } from '../../../core/validation/validator';
import { CampaignApi, type CampaignDetailView } from '../../lib/api/campaignApi';
import { ApiClient } from '../../lib/apiClient';
import type { PreparedImage } from '../../lib/image/preparedImage';
import {
  SubmissionChecker,
  SubmitFormRules,
  resolveCell,
  type FormError,
  type FormField,
  type SubmitFormValues,
} from '../../lib/submit/runChecks';
import { HoneypotReader } from '../../lib/submit/honeypotReader';
import { ResubmitPrefill } from '../../lib/submit/resubmitPrefill';
import { SubmitApi, SubmitApiError, type ServerReason, type SubmissionAccepted } from '../../lib/submit/submitApi';
import { ErrorMessage } from '../common/ErrorMessage';
import { JudgeResult, RequiredChecks, SubjectNote } from './JudgeResult';
import { PhotoStep } from './PhotoStep';
import { SubmitForm, type FieldErrors } from './SubmitForm';
import styles from './submit.module.css';

/** キャンペーンと充足の読み込みの状態（写真の段階は、この読み込みを待たずに使えます）。 */
type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly campaign: CampaignDetailView; readonly coverage: CoverageResponse }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error' };

/** 一次判定の結果と、送るための入力（判定の後に入力を変えたら無効にします）。 */
interface Judged {
  readonly results: readonly CheckResult[];
  readonly canSend: boolean;
  readonly cellId: string;
  readonly shotMonth: number;
  readonly spotName: string;
  readonly caption: string;
  readonly declaredOriginal: boolean;
  readonly consent: boolean;
}

/** 送信の状態。 */
type SendState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'accepted'; readonly accepted: SubmissionAccepted }
  | { readonly kind: 'failed'; readonly message: string; readonly reasons: readonly ServerReason[] };

const EMPTY_VALUES: SubmitFormValues = {
  areaId: '',
  shotMonth: '',
  spotName: '',
  caption: '',
  declaredNotAi: false,
  declaredNotReused: false,
  consent: false,
};

/**
 * 投稿と判定結果の画面（requirements 4 章・3.3）。写真の段階は常に使え、その後に入力・一次判定・送信・確認待ちを続けます。
 * キャンペーンが無いときは、入力の段階に案内を出します（写真の段階は止めません）。
 */
export function SubmitScreen() {
  const searchParams = useSearchParams();
  const areaParam = searchParams.get('area') ?? '';
  const resubmitFrom = searchParams.get(SUBMIT_QUERY_KEYS.resubmit) ?? '';
  const [services] = useState(() => ({
    campaignApi: new CampaignApi(),
    client: new ApiClient(),
    checker: new SubmissionChecker(),
    rules: new SubmitFormRules(),
    submitApi: new SubmitApi(),
    prefill: new ResubmitPrefill(),
    honeypot: new HoneypotReader(),
  }));
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [photoKey, setPhotoKey] = useState(0);
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [values, setValues] = useState<SubmitFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [judged, setJudged] = useState<Judged | null>(null);
  const [send, setSend] = useState<SendState>({ kind: 'idle' });
  const sendingRef = useRef(false);
  const honeypotRef = useRef<HTMLInputElement | null>(null);

  /** 再投稿の元の投稿（mine API）から、市町村の初期値を入れます。撮影月は、応答が返していれば初期値にし、無ければ空のままです。 */
  const prefillFromOrigin = useCallback(
    async (campaign: CampaignDetailView): Promise<void> => {
      try {
        const mine = await services.client.get<MySubmissionsResponse>(API_ENDPOINTS.submissionsMine.path);
        const areaId = services.prefill.areaIdOf(mine, campaign, resubmitFrom);
        if (areaId === null) {
          setNotice(SUBMIT_STRINGS.prefillFailed);
          return;
        }
        const month = services.prefill.monthOf(mine, resubmitFrom);
        setValues((current) => ({
          ...current,
          areaId: current.areaId === '' ? areaId : current.areaId,
          shotMonth: current.shotMonth === '' && month !== null ? String(month) : current.shotMonth,
        }));
      } catch {
        setNotice(SUBMIT_STRINGS.prefillFailed);
      }
    },
    [services, resubmitFrom],
  );

  const loadData = useCallback(async (): Promise<void> => {
    setLoad({ kind: 'loading' });
    try {
      const campaign = await services.campaignApi.getCampaign();
      if (campaign === null) {
        setLoad({ kind: 'notFound' });
        return;
      }
      const coverage = await services.client.get<CoverageResponse>(API_ENDPOINTS.coverage.path);
      setLoad({ kind: 'ready', campaign, coverage });
      if (areaParam !== '' && campaign.areas.some((area) => area.id === areaParam)) {
        setValues((current) => (current.areaId === '' ? { ...current, areaId: areaParam } : current));
      }
      if (resubmitFrom !== '') {
        await prefillFromOrigin(campaign);
      }
    } catch {
      setLoad({ kind: 'error' });
    }
  }, [services, areaParam, resubmitFrom, prefillFromOrigin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /** 入力や写真が変わったら、判定と送信の結果を無効にします（確認待ちの後は変えません）。 */
  const invalidate = (): void => {
    setJudged(null);
    setSend((current) => (current.kind === 'accepted' ? current : { kind: 'idle' }));
    setNotice(null);
  };

  const handlePrepared = (next: PreparedImage | null): void => {
    setPrepared(next);
    setErrors({});
    invalidate();
  };

  const handleChange = (next: Partial<SubmitFormValues>): void => {
    setValues((current) => ({ ...current, ...next }));
    setErrors({});
    invalidate();
  };

  /** 写真を選び直す（入力は残し、判定と送信の結果だけを戻します）。確認待ちの後は、入力も初めに戻します。 */
  const resetPhoto = (keepValues: boolean): void => {
    setPhotoKey((key) => key + 1);
    setPrepared(null);
    setValues((current) => (keepValues ? current : { ...EMPTY_VALUES, areaId: '' }));
    setErrors({});
    setJudged(null);
    setSend({ kind: 'idle' });
    setNotice(null);
  };

  const { checker, rules, submitApi } = services;
  const ready = load.kind === 'ready' ? load : null;
  const selectedArea = ready?.campaign.areas.find((area) => area.id === values.areaId);
  const month = /^\d{1,2}$/.test(values.shotMonth) ? Number(values.shotMonth) : null;
  const seasonLabel = month !== null && month >= 1 && month <= 12 ? SEASON_LABELS[seasonOfMonth(month)] : null;
  const cellProblem = ready === null ? null : cellProblemOf(ready.campaign, ready.coverage, values.areaId, month);
  const cellNotice = cellProblem === null ? null : SUBMIT_FORM_ERRORS[cellProblem];

  /** 一次判定。入力の検査 → マスの確認 → B3 の判定の順です。 */
  const handleJudge = (): void => {
    if (ready === null) {
      return;
    }
    if (prepared === null) {
      setNotice(SUBMIT_FORM_ERRORS.noImage);
      return;
    }
    const check = rules.check(values);
    if (!check.ok) {
      setErrors(toFieldErrors(check.errors));
      setJudged(null);
      return;
    }
    const resolution = resolveCell(ready.campaign, ready.coverage, values.areaId, check.shotMonth);
    if (resolution.kind === 'no_period') {
      setErrors({ month: SUBMIT_FORM_ERRORS.noPeriod });
      setJudged(null);
      return;
    }
    if (resolution.kind === 'no_cell' || selectedArea === undefined) {
      setErrors({ area: SUBMIT_FORM_ERRORS.noCell });
      setJudged(null);
      return;
    }
    if (resolution.closed) {
      setErrors({ area: SUBMIT_FORM_ERRORS.cellClosed });
      setJudged(null);
      return;
    }
    const outcome = checker.judge({
      prepared,
      rule: ready.campaign.acceptRule,
      shotMonth: check.shotMonth,
      prefecture: selectedArea.prefecture,
      declaredNotAi: values.declaredNotAi,
      declaredNotReused: values.declaredNotReused,
    });
    setErrors({});
    setNotice(null);
    setSend({ kind: 'idle' });
    setJudged({
      results: outcome.results,
      canSend: outcome.canSend,
      cellId: resolution.cellId,
      shotMonth: check.shotMonth,
      spotName: check.spotName,
      caption: check.caption,
      declaredOriginal: values.declaredNotAi && values.declaredNotReused,
      consent: values.consent,
    });
  };

  /** 送信。不合格がある判定では送れません。二重送信は、送信中の印と参照で防ぎます。 */
  const handleSend = async (): Promise<void> => {
    if (judged === null || !judged.canSend || prepared === null || sendingRef.current) {
      return;
    }
    sendingRef.current = true;
    setSend({ kind: 'sending' });
    try {
      const accepted = await submitApi.submit({
        prepared,
        cellId: judged.cellId,
        shotMonth: judged.shotMonth,
        spotName: judged.spotName,
        caption: judged.caption,
        checks: checker.toBrowserChecks(judged.results),
        declaredOriginal: judged.declaredOriginal,
        consent: judged.consent,
        honeypot: services.honeypot.read(honeypotRef),
        resubmittedFrom: resubmitFrom === '' ? null : resubmitFrom,
      });
      setSend({ kind: 'accepted', accepted });
    } catch (caught) {
      if (caught instanceof SubmitApiError) {
        setSend({ kind: 'failed', message: messageOfApiError(caught.code), reasons: caught.reasons });
      } else {
        setSend({ kind: 'failed', message: SUBMIT_STRINGS.sendFailed, reasons: [] });
      }
    } finally {
      sendingRef.current = false;
    }
  };

  if (send.kind === 'accepted') {
    return (
      <section className={styles.block} aria-labelledby="accepted-heading">
        <h2 id="accepted-heading" className={styles.heading}>
          {SUBMIT_STRINGS.acceptedHeading}
        </h2>
        <p role="status">{SUBMIT_STRINGS.acceptedBody}</p>
        <p className={styles.help}>{SUBMIT_STRINGS.acceptedIdLine(send.accepted.id)}</p>
        <RequiredChecks checks={send.accepted.checks} />
        <SubjectNote subject={send.accepted.subject} />
        <button type="button" className={styles.button} onClick={() => resetPhoto(false)}>
          {SUBMIT_STRINGS.acceptedAgain}
        </button>
      </section>
    );
  }

  const sending = send.kind === 'sending';
  return (
    <div className={styles.flow}>
      <p>{SUBMIT_STRINGS.lead}</p>
      {resubmitFrom !== '' ? (
        <>
          <p className={styles.notice}>{SUBMIT_STRINGS.resubmitNotice}</p>
          <p className={styles.help}>{SUBMIT_STRINGS.resubmitMonthNote}</p>
        </>
      ) : null}

      <PhotoStep key={photoKey} onPreparedChange={handlePrepared} />

      {load.kind === 'loading' ? <p role="status">{COMMON_STRINGS.loading}</p> : null}
      {load.kind === 'error' ? <ErrorMessage message={SUBMIT_STRINGS.loadFailed} /> : null}
      {load.kind === 'notFound' ? (
        <section className={styles.block} aria-labelledby="submit-not-found-heading">
          <h2 id="submit-not-found-heading" className={styles.heading}>
            {SUBMIT_STRINGS.campaignNotFoundHeading}
          </h2>
          <p>{SUBMIT_STRINGS.campaignNotFoundBody}</p>
          <p>
            <Link className={styles.link} href={SUBMIT_STRINGS.campaignLinkHref}>
              {SUBMIT_STRINGS.campaignLinkLabel}
            </Link>
          </p>
        </section>
      ) : null}

      {ready !== null && prepared !== null ? (
        <section className={styles.block} aria-labelledby="form-heading">
          <h2 id="form-heading" className={styles.heading}>
            {SUBMIT_STRINGS.formHeading}
          </h2>
          <SubmitForm
            areas={ready.campaign.areas}
            values={values}
            errors={errors}
            seasonLabel={seasonLabel}
            honeypotRef={honeypotRef}
            disabled={sending}
            onChange={handleChange}
          />
          {cellNotice !== null ? (
            <p role="status" className={styles.fieldError}>
              {cellNotice}
            </p>
          ) : null}
          {notice !== null ? <ErrorMessage message={notice} /> : null}
          {Object.keys(errors).length > 0 ? <ErrorMessage message={SUBMIT_STRINGS.formErrorHeading} /> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={sending} onClick={handleJudge}>
              {SUBMIT_STRINGS.judgeButton}
            </button>
            <button type="button" className={styles.secondaryButton} disabled={sending} onClick={() => resetPhoto(true)}>
              {SUBMIT_STRINGS.rechoosePhoto}
            </button>
          </div>
        </section>
      ) : null}

      {send.kind === 'failed' ? <ErrorMessage message={send.message} /> : null}
      {sending ? <p role="status">{SUBMIT_STRINGS.sending}</p> : null}

      {judged !== null ? (
        <section className={styles.block} aria-labelledby="judge-heading">
          <JudgeResult results={judged.results} serverReasons={send.kind === 'failed' ? send.reasons : []} />
          {judged.canSend ? (
            <button type="button" className={styles.button} disabled={sending} onClick={() => void handleSend()}>
              {SUBMIT_STRINGS.sendButton}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** マスの問題（募集終了・期間の外・マスなし）。問題がなければ null。 */
function cellProblemOf(
  campaign: CampaignDetailView,
  coverage: CoverageResponse,
  areaId: string,
  month: number | null,
): 'cellClosed' | 'noPeriod' | 'noCell' | null {
  if (areaId === '' || month === null) {
    return null;
  }
  const resolution = resolveCell(campaign, coverage, areaId, month);
  if (resolution.kind === 'no_period') {
    return 'noPeriod';
  }
  if (resolution.kind === 'no_cell') {
    return 'noCell';
  }
  return resolution.closed ? 'cellClosed' : null;
}

/** 入力欄の誤りを、欄ごとの文言にします。 */
function toFieldErrors(errorsList: readonly FormError[]): FieldErrors {
  const result: Partial<Record<FormField, string>> = {};
  for (const error of errorsList) {
    result[error.field] = error.message;
  }
  return result;
}

/** 送信のエラーの文言（API の文言。知らないコードは、通信の失敗の文言にします）。 */
function messageOfApiError(code: string): string {
  return Object.prototype.hasOwnProperty.call(API_ERROR_MESSAGES, code)
    ? API_ERROR_MESSAGES[code as keyof typeof API_ERROR_MESSAGES]
    : SUBMIT_STRINGS.sendFailed;
}
