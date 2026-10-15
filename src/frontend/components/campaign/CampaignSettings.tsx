'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CAMPAIGN_API_CONFIG } from '../../../config/campaignApi';
import { CAMPAIGN_SETTINGS_STRINGS } from '../../../config/strings/campaignSettings';
import { COMMON_STRINGS } from '../../../config/strings/common';
import type { PrefectureCode } from '../../../core/api/contract';
import { normalizeText } from '../../../core/text/normalize';
import { ApiError } from '../../lib/apiClient';
import {
  CampaignApi,
  CampaignDraftBuilder,
  fieldOfApiMessage,
  type AcceptRuleDraft,
  type CampaignDetailView,
  type CampaignDraft,
  type DraftCheck,
  type DraftErrors,
} from '../../lib/api/campaignApi';
import { ErrorMessage } from '../common/ErrorMessage';
import { AcceptRuleForm } from './AcceptRuleForm';
import { AreaAddForm } from './AreaAddForm';
import { CellRequirementGrid } from './CellRequirementGrid';
import { TemplateLoader } from './TemplateLoader';
import styles from './campaign.module.css';

/** 画面の段階。loading は取得中、missing はキャンペーンが無い、ready は編集できる、failed は取得の失敗。 */
type Screen =
  | { readonly kind: 'loading' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'failed'; readonly message: string };

/** 処理中の種類（処理の間は、ほかの操作を止めます）。 */
type Busy = 'idle' | 'template' | 'saving' | 'area';

const NO_ERRORS: DraftErrors = { name: null, cells: {}, rule: null, ruleFields: {}, general: null };

/** 例外から、表示する文言を取り出します（API の文言はそのまま、それ以外は共通の文言）。 */
function describeError(caught: unknown): string {
  if (caught instanceof ApiError) {
    return caught.message;
  }
  return COMMON_STRINGS.errorHeading;
}

/** API の失敗の文言を、項目の近くに出すための形にします。 */
function errorsFromApi(message: string): DraftErrors {
  switch (fieldOfApiMessage(message)) {
    case 'name':
      return { ...NO_ERRORS, name: message };
    case 'cells':
      return { ...NO_ERRORS, general: message };
    case 'rule':
      return { ...NO_ERRORS, rule: message };
    case 'general':
      return NO_ERRORS;
  }
}

/**
 * キャンペーン設定の画面（D6）。読み込み・名称・エリアの追加・必要数の表・受入条件・保存を扱います。
 * 検査は CampaignDraftBuilder（B1 の defineCampaign）で行い、Worker の検査も同じ規則で行われます。
 */
export function CampaignSettings() {
  const [api] = useState(() => new CampaignApi());
  const [builder] = useState(() => new CampaignDraftBuilder());
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' });
  const [campaign, setCampaign] = useState<CampaignDetailView | null>(null);
  const [draft, setDraft] = useState<CampaignDraft | null>(null);
  const [errors, setErrors] = useState<DraftErrors>(NO_ERRORS);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [alreadyLoaded, setAlreadyLoaded] = useState(false);
  const [busy, setBusy] = useState<Busy>('idle');
  const [uniformRaw, setUniformRaw] = useState('');
  const [uniformError, setUniformError] = useState<string | null>(null);
  const [areaError, setAreaError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getCampaign()
      .then((found) => {
        if (!active) {
          return;
        }
        if (found === null) {
          setScreen({ kind: 'missing' });
          return;
        }
        setCampaign(found);
        setDraft(builder.draftFromCampaign(found));
        setAlreadyLoaded(true);
        setScreen({ kind: 'ready' });
      })
      .catch((caught: unknown) => {
        if (active) {
          setScreen({ kind: 'failed', message: describeError(caught) });
        }
      });
    return () => {
      active = false;
    };
  }, [api, builder]);

  const applyServerState = (next: CampaignDetailView): void => {
    setCampaign(next);
    setDraft(builder.draftFromCampaign(next));
    setErrors(NO_ERRORS);
  };

  const handleLoadTemplate = async (): Promise<void> => {
    setBusy('template');
    setErrorText(null);
    setNotice(null);
    try {
      const loaded = await api.loadTemplate();
      applyServerState(loaded);
      setAlreadyLoaded(false);
      setNotice(CAMPAIGN_SETTINGS_STRINGS.loadedNotice);
      setScreen({ kind: 'ready' });
    } catch (caught) {
      setErrorText(describeError(caught));
    } finally {
      setBusy('idle');
    }
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (campaign === null || draft === null || busy !== 'idle') {
      return;
    }
    setNotice(null);
    const check: DraftCheck = builder.validateDraft(campaign, draft);
    if (!check.ok) {
      setErrors(check.errors);
      setErrorText(CAMPAIGN_SETTINGS_STRINGS.saveFailed);
      return;
    }
    setErrors(NO_ERRORS);
    setErrorText(null);
    setBusy('saving');
    try {
      const saved = await api.updateCampaign(check.request);
      applyServerState(saved);
      setNotice(CAMPAIGN_SETTINGS_STRINGS.saved);
    } catch (caught) {
      setErrorText(describeError(caught));
      if (caught instanceof ApiError) {
        setErrors(errorsFromApi(caught.message));
      }
    } finally {
      setBusy('idle');
    }
  };

  const handleApplyUniform = (): void => {
    if (campaign === null || draft === null) {
      return;
    }
    const applied = builder.applyUniform(
      draft,
      campaign.cells.map((cell) => cell.cellId),
      uniformRaw,
    );
    if (!applied.ok) {
      setUniformError(applied.message);
      return;
    }
    setUniformError(null);
    setDraft(applied.value);
    setNotice(CAMPAIGN_SETTINGS_STRINGS.uniformApplied(Number(normalizeText(uniformRaw))));
  };

  const handleAddArea = async (prefecture: PrefectureCode, label: string): Promise<boolean> => {
    if (campaign === null || draft === null || busy !== 'idle') {
      return false;
    }
    const request = builder.buildAreaRequest(prefecture, label, campaign.areas.map((area) => area.label));
    if (!request.ok) {
      setAreaError(request.message);
      return false;
    }
    setAreaError(null);
    setNotice(null);
    setBusy('area');
    try {
      const added = await api.addArea(request.value);
      const fresh = builder.draftFromCampaign(added);
      setCampaign(added);
      setDraft((previous) =>
        previous === null
          ? previous
          : { ...previous, requiredByCell: { ...fresh.requiredByCell, ...previous.requiredByCell } },
      );
      setNotice(CAMPAIGN_SETTINGS_STRINGS.areaAdded(request.value.areas[0].label));
      return true;
    } catch (caught) {
      setAreaError(describeError(caught));
      return false;
    } finally {
      setBusy('idle');
    }
  };

  if (screen.kind === 'loading') {
    return <p role="status" className={styles.help}>{COMMON_STRINGS.loading}</p>;
  }
  if (screen.kind === 'failed') {
    return <ErrorMessage message={screen.message} />;
  }
  if (screen.kind === 'missing') {
    return (
      <section className={styles.block} aria-labelledby="campaign-missing-heading">
        <h2 id="campaign-missing-heading" className={styles.heading}>
          {CAMPAIGN_SETTINGS_STRINGS.missingHeading}
        </h2>
        <p className={styles.help}>{CAMPAIGN_SETTINGS_STRINGS.missingBody}</p>
        <TemplateLoader busy={busy === 'template'} onLoad={handleLoadTemplate} />
        {errorText !== null ? <ErrorMessage message={errorText} /> : null}
      </section>
    );
  }
  if (campaign === null || draft === null) {
    return <ErrorMessage message={COMMON_STRINGS.errorHeading} />;
  }

  const setName = (value: string): void => {
    setDraft((previous) => (previous === null ? previous : { ...previous, name: value }));
  };
  const setCell = (cellId: string, value: string): void => {
    setDraft((previous) =>
      previous === null ? previous : { ...previous, requiredByCell: { ...previous.requiredByCell, [cellId]: value } },
    );
  };
  const setRule = (key: keyof AcceptRuleDraft, value: string): void => {
    setDraft((previous) =>
      previous === null ? previous : { ...previous, rule: { ...previous.rule, [key]: value } },
    );
  };

  return (
    <div className={styles.flow}>
      {alreadyLoaded ? (
        <p role="status" className={styles.help}>
          {CAMPAIGN_SETTINGS_STRINGS.alreadyLoaded(CAMPAIGN_SETTINGS_STRINGS.templateName)}
        </p>
      ) : null}
      {notice !== null ? (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      ) : null}

      <AreaAddForm
        areaLabels={campaign.areas.map((area) => area.label)}
        busy={busy === 'area'}
        error={areaError}
        onAdd={handleAddArea}
      />

      <form className={styles.flow} onSubmit={handleSave} noValidate>
        <section className={styles.block} aria-labelledby="campaign-name-heading">
          <h2 id="campaign-name-heading" className={styles.heading}>
            {CAMPAIGN_SETTINGS_STRINGS.nameHeading}
          </h2>
          <div className={styles.field}>
            <label htmlFor="campaign-name" className={styles.fieldLabel}>
              {CAMPAIGN_SETTINGS_STRINGS.nameLabel}
            </label>
            <input
              id="campaign-name"
              className={`${styles.input} ${styles.inputWide}`}
              type="text"
              value={draft.name}
              disabled={busy !== 'idle'}
              aria-invalid={errors.name !== null}
              aria-describedby={errors.name !== null ? 'campaign-name-help campaign-name-error' : 'campaign-name-help'}
              onChange={(event) => setName(event.target.value)}
            />
            <p id="campaign-name-help" className={styles.help}>
              {CAMPAIGN_SETTINGS_STRINGS.nameHelp(CAMPAIGN_API_CONFIG.nameMaxChars)}
            </p>
            {errors.name !== null ? (
              <p id="campaign-name-error" className={styles.fieldError}>
                {errors.name}
              </p>
            ) : null}
          </div>
        </section>

        <CellRequirementGrid
          campaign={campaign}
          values={draft.requiredByCell}
          cellErrors={errors.cells}
          generalError={errors.general}
          uniformRaw={uniformRaw}
          uniformError={uniformError}
          busy={busy !== 'idle'}
          onUniformRawChange={setUniformRaw}
          onApplyUniform={handleApplyUniform}
          onCellChange={setCell}
        />

        <AcceptRuleForm
          draft={draft.rule}
          fieldErrors={errors.ruleFields}
          generalError={errors.rule}
          busy={busy !== 'idle'}
          onChange={setRule}
        />

        <section className={styles.block} aria-labelledby="campaign-save-heading">
          <h2 id="campaign-save-heading" className={styles.heading}>
            {CAMPAIGN_SETTINGS_STRINGS.statusHeading}
          </h2>
          <div className={styles.actions}>
            <button type="submit" className={styles.button} disabled={busy !== 'idle'}>
              {CAMPAIGN_SETTINGS_STRINGS.saveButton}
            </button>
            {busy === 'saving' ? <p role="status" className={styles.help}>{CAMPAIGN_SETTINGS_STRINGS.saving}</p> : null}
          </div>
          {errorText !== null ? <ErrorMessage message={errorText} /> : null}
        </section>
      </form>
    </div>
  );
}
