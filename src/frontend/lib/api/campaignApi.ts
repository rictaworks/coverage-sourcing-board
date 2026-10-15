import { CAMPAIGN_API_CONFIG } from '../../../config/campaignApi';
import { RULE_DEFAULTS } from '../../../config/defaults';
import { CAMPAIGN_ERROR_MESSAGES } from '../../../config/strings/campaign';
import { CAMPAIGN_API_ERROR_MESSAGES } from '../../../config/strings/campaignApi';
import { CAMPAIGN_SETTINGS_STRINGS } from '../../../config/strings/campaignSettings';
import { COMMON_STRINGS } from '../../../config/strings/common';
import {
  API_ENDPOINTS,
  type ApiEndpoint,
} from '../../../core/api/paths';
import type {
  AreaView,
  CampaignAreasRequest,
  CampaignResponse,
  CampaignUpdateRequest,
  PeriodView,
  PrefectureCode,
  TemplateSelectRequest,
} from '../../../core/api/contract';
import { Area } from '../../../core/campaign/area';
import { defineCampaign, type CampaignInput, type RequiredEntry } from '../../../core/campaign/defineCampaign';
import { CampaignError, Period, type Season } from '../../../core/campaign/period';
import { normalizeText } from '../../../core/text/normalize';
import type { AcceptRule } from '../../../core/types';
import { ApiError, MALFORMED_RESPONSE_CODE } from '../apiClient';

/** マスの 1 件（API の応答の cells の要素）。 */
export interface CampaignCellView {
  readonly cellId: string;
  readonly areaId: string;
  readonly periodId: string;
  readonly required: number;
}

/** キャンペーンの応答（API の CampaignDetailResponse と同じ形）。 */
export interface CampaignDetailView extends CampaignResponse {
  readonly cells: readonly CampaignCellView[];
}

/** 保存の要求（PUT /api/campaign）。 */
export type CampaignSaveRequest = CampaignUpdateRequest & { readonly acceptRule: AcceptRule };

/** 入力の検査の結果（成功なら値、失敗なら表示する文言）。 */
export type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/** 受入条件の入力欄の値（文字列のまま保つ。入力の途中の値を消さないため）。 */
export interface AcceptRuleDraft {
  readonly tolerancePercent: string;
  readonly minShortPx: string;
  readonly maxInputMegabytes: string;
  readonly maxPixelsTenThousand: string;
}

/** 画面の下書き（名称・マスの必要数の入力・受入条件）。 */
export interface CampaignDraft {
  readonly name: string;
  /** マスの ID → 入力の文字列。 */
  readonly requiredByCell: Readonly<Record<string, string>>;
  readonly rule: AcceptRuleDraft;
}

/** 項目ごとのエラー。 */
export interface DraftErrors {
  readonly name: string | null;
  readonly cells: Readonly<Record<string, string>>;
  readonly rule: string | null;
  readonly ruleFields: Readonly<Partial<Record<keyof AcceptRuleDraft, string>>>;
  readonly general: string | null;
}

/** 下書きの検査の結果。成功なら保存の要求を返します。 */
export type DraftCheck =
  | { readonly ok: true; readonly request: CampaignSaveRequest }
  | { readonly ok: false; readonly errors: DraftErrors };

/** 保存前の検査の結果。応答の不整合で例外になったときは、画面に出す文言を返します。 */
export type SaveCheck =
  | { readonly kind: 'checked'; readonly check: DraftCheck }
  | { readonly kind: 'failed'; readonly message: string };

/** API の文言を、どの項目の近くに出すか。 */
export type DraftField = 'name' | 'cells' | 'rule' | 'general';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const PIXELS_PER_TEN_THOUSAND = 10_000;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const INTEGER_PATTERN = /^\d+$/;

/**
 * 受入条件の数値の範囲（既定値 RULE_DEFAULTS から作る。既定値を超える値は保存できない）。
 * 許容誤差は％、最大のファイルサイズは MB、最大の画素数は万画素で入力する。
 */
export const RULE_FIELD_RANGES: Readonly<Record<keyof AcceptRuleDraft, { readonly min: number; readonly max: number; readonly integer: boolean }>> = {
  tolerancePercent: { min: 0, max: Math.round(RULE_DEFAULTS.aspectTolerance * 1000) / 10, integer: false },
  minShortPx: { min: 1, max: RULE_DEFAULTS.minShortSidePx, integer: true },
  maxInputMegabytes: { min: 0.1, max: RULE_DEFAULTS.maxInputBytes / BYTES_PER_MEGABYTE, integer: false },
  maxPixelsTenThousand: { min: 1, max: RULE_DEFAULTS.maxInputPixels / PIXELS_PER_TEN_THOUSAND, integer: true },
};

/** 数値を、入力欄に出す文字列にします（浮動小数の誤差を丸めます）。 */
function toInputText(value: number): string {
  return String(Math.round(value * 1_000_000) / 1_000_000);
}

/** API の文言から、どの項目の近くに出すかを決めます（既知の文言だけを振り分け、それ以外は全体の欄に出します）。 */
export function fieldOfApiMessage(message: string): DraftField {
  if (message === CAMPAIGN_API_ERROR_MESSAGES.name_too_long) {
    return 'name';
  }
  if (message === CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range) {
    return 'cells';
  }
  if (message === CAMPAIGN_API_ERROR_MESSAGES.rule_limit_exceeded) {
    return 'rule';
  }
  return 'general';
}

/**
 * フォームの値から API の要求を作る（純粋な関数の集まり）。
 * 検査は B1 の defineCampaign を使い、ブラウザと Worker で同じ規則にします。
 */
export class CampaignDraftBuilder {
  /** 一律の値を、すべてのマスに展開します。範囲の外の値は例外にします。 */
  expandUniform(cellIds: readonly string[], value: number): Record<string, number> {
    if (!Number.isInteger(value) || value < 1 || value > CAMPAIGN_API_CONFIG.requiredMax) {
      throw new Error(CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range);
    }
    return Object.fromEntries(cellIds.map((id) => [id, value]));
  }

  /** 必要数の入力を検査します（1 以上 999 以下の整数だけを受け付けます）。全角の数字は半角にします。 */
  parseRequiredInput(raw: string): ParseResult<number> {
    const text = normalizeText(raw);
    const value = Number(text);
    if (!INTEGER_PATTERN.test(text) || value < 1 || value > CAMPAIGN_API_CONFIG.requiredMax) {
      return { ok: false, message: CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range };
    }
    return { ok: true, value };
  }

  /** 一律の値を入力し、すべてのマスの入力欄に入れた下書きを返します（保存するまでは反映されません）。 */
  applyUniform(draft: CampaignDraft, cellIds: readonly string[], raw: string): ParseResult<CampaignDraft> {
    const parsed = this.parseRequiredInput(raw);
    if (!parsed.ok) {
      return parsed;
    }
    const expanded = this.expandUniform(cellIds, parsed.value);
    const requiredByCell = Object.fromEntries(Object.entries(expanded).map(([id, value]) => [id, String(value)]));
    return { ok: true, value: { ...draft, requiredByCell: { ...draft.requiredByCell, ...requiredByCell } } };
  }

  /** API のキャンペーンから、画面の下書きを作ります。 */
  draftFromCampaign(campaign: CampaignDetailView): CampaignDraft {
    const { acceptRule } = campaign;
    return {
      name: campaign.name,
      requiredByCell: Object.fromEntries(campaign.cells.map((cell) => [cell.cellId, String(cell.required)])),
      rule: {
        tolerancePercent: toInputText(acceptRule.tolerance * 100),
        minShortPx: String(acceptRule.minShortPx),
        maxInputMegabytes: toInputText(acceptRule.maxInputBytes / BYTES_PER_MEGABYTE),
        maxPixelsTenThousand: toInputText(acceptRule.maxPixels / PIXELS_PER_TEN_THOUSAND),
      },
    };
  }

  /** 区分値の追加の要求を作ります。区分値は B1 の Area で正規化し、全角と半角の違いだけの重複を拒否します。 */
  buildAreaRequest(prefecture: PrefectureCode, rawLabel: string, existingLabels: readonly string[]): ParseResult<CampaignAreasRequest> {
    if (existingLabels.length >= CAMPAIGN_API_CONFIG.areasMax) {
      return { ok: false, message: CAMPAIGN_API_ERROR_MESSAGES.area_limit_exceeded };
    }
    let area: Area;
    try {
      area = Area.fromLabel(rawLabel);
    } catch (caught) {
      if (caught instanceof CampaignError) {
        return { ok: false, message: CAMPAIGN_ERROR_MESSAGES[caught.code] };
      }
      throw caught;
    }
    if (existingLabels.some((label) => normalizeText(label) === area.label)) {
      return { ok: false, message: CAMPAIGN_API_ERROR_MESSAGES.area_duplicate };
    }
    return { ok: true, value: { areas: [{ prefecture, label: area.label }] } };
  }

  /** validateDraft を呼び、内部の不整合の例外だけを画面に出す文言にします。それ以外の例外は投げ直します。 */
  checkForSave(campaign: CampaignDetailView, draft: CampaignDraft): SaveCheck {
    try {
      return { kind: 'checked', check: this.validateDraft(campaign, draft) };
    } catch (caught) {
      if (caught instanceof Error && caught.message === CAMPAIGN_SETTINGS_STRINGS.campaignInconsistent) {
        return { kind: 'failed', message: caught.message };
      }
      throw caught;
    }
  }

  /** 下書きを検査し、保存の要求を作ります。項目ごとの文言を返します。 */
  validateDraft(campaign: CampaignDetailView, draft: CampaignDraft): DraftCheck {
    const cellErrors: Record<string, string> = {};
    const requiredValues: Record<string, number> = {};
    for (const cell of campaign.cells) {
      const raw = draft.requiredByCell[cell.cellId];
      if (raw === undefined) {
        throw new Error(CAMPAIGN_SETTINGS_STRINGS.campaignInconsistent);
      }
      const parsed = this.parseRequiredInput(raw);
      if (parsed.ok) {
        requiredValues[cell.cellId] = parsed.value;
      } else {
        cellErrors[cell.cellId] = parsed.message;
      }
    }

    const ruleFieldErrors: Partial<Record<keyof AcceptRuleDraft, string>> = {};
    const numbers: Partial<Record<keyof AcceptRuleDraft, number>> = {};
    for (const field of Object.keys(RULE_FIELD_RANGES) as (keyof AcceptRuleDraft)[]) {
      const parsed = this.parseRuleNumber(field, draft.rule[field]);
      if (parsed.ok) {
        numbers[field] = parsed.value;
      } else {
        ruleFieldErrors[field] = parsed.message;
      }
    }
    const name = normalizeText(draft.name);
    let nameError: string | null = null;
    if ([...name].length > CAMPAIGN_API_CONFIG.nameMaxChars) {
      nameError = CAMPAIGN_API_ERROR_MESSAGES.name_too_long;
    }
    let generalError: string | null = null;
    const hasRuleError = Object.keys(ruleFieldErrors).length > 0;
    const hasError = Object.keys(cellErrors).length > 0 || hasRuleError || nameError !== null;
    let rule: AcceptRule | null = null;
    if (!hasError) {
      rule = {
        ...campaign.acceptRule,
        tolerance: this.requireNumber(numbers, 'tolerancePercent') / 100,
        minShortPx: this.requireNumber(numbers, 'minShortPx'),
        maxInputBytes: Math.round(this.requireNumber(numbers, 'maxInputMegabytes') * BYTES_PER_MEGABYTE),
        maxPixels: Math.round(this.requireNumber(numbers, 'maxPixelsTenThousand') * PIXELS_PER_TEN_THOUSAND),
      };
      try {
        defineCampaign(this.domainInput(campaign, name, requiredValues, rule), () => campaign.id);
      } catch (caught) {
        if (!(caught instanceof CampaignError)) {
          throw caught;
        }
        if (caught.code === 'NAME_EMPTY' || caught.code === 'NAME_INVALID') {
          nameError = CAMPAIGN_ERROR_MESSAGES[caught.code];
        } else {
          generalError = CAMPAIGN_ERROR_MESSAGES[caught.code];
        }
      }
    }

    if (rule === null || nameError !== null || generalError !== null || hasError) {
      return {
        ok: false,
        errors: {
          name: nameError,
          cells: cellErrors,
          rule: hasRuleError ? CAMPAIGN_SETTINGS_STRINGS.ruleFieldError : null,
          ruleFields: ruleFieldErrors,
          general: generalError,
        },
      };
    }
    return {
      ok: true,
      request: {
        name,
        requiredPerCell: { mode: 'individual', values: { ...requiredValues } },
        acceptRule: rule,
      },
    };
  }

  /** 検査を通った数値を取り出します。欠けていれば（内部の不整合）、代わりの値を使わず例外にします。 */
  private requireNumber(numbers: Partial<Record<keyof AcceptRuleDraft, number>>, field: keyof AcceptRuleDraft): number {
    const value = numbers[field];
    if (value === undefined) {
      throw new Error(CAMPAIGN_SETTINGS_STRINGS.campaignInconsistent);
    }
    return value;
  }

  /** 受入条件の 1 項目を検査します（既定値の範囲の外は保存できません）。 */
  private parseRuleNumber(field: keyof AcceptRuleDraft, raw: string): ParseResult<number> {
    const text = normalizeText(raw);
    const range = RULE_FIELD_RANGES[field];
    if (!DECIMAL_PATTERN.test(text)) {
      return { ok: false, message: CAMPAIGN_SETTINGS_STRINGS.ruleNumberInvalid };
    }
    const value = Number(text);
    if (value < range.min || value > range.max) {
      return { ok: false, message: CAMPAIGN_SETTINGS_STRINGS.ruleRangeHelp(range.min, range.max) };
    }
    if (range.integer && !Number.isInteger(value)) {
      return { ok: false, message: CAMPAIGN_SETTINGS_STRINGS.ruleIntegerHelp };
    }
    return { ok: true, value };
  }

  /** B1 の defineCampaign に渡す入力を、API のキャンペーンから組み立てます。 */
  private domainInput(
    campaign: CampaignDetailView,
    name: string,
    requiredValues: Readonly<Record<string, number>>,
    rule: AcceptRule,
  ): CampaignInput {
    const areaLabels = new Map(campaign.areas.map((area: AreaView) => [area.id, area.label]));
    const periods = new Map(campaign.periods.map((period: PeriodView) => [period.id, seasonOfPeriod(period)]));
    const required: RequiredEntry[] = campaign.cells.map((cell) => {
      const area = areaLabels.get(cell.areaId);
      const season = periods.get(cell.periodId);
      const value = requiredValues[cell.cellId];
      if (area === undefined || season === undefined || value === undefined) {
        throw new Error(CAMPAIGN_SETTINGS_STRINGS.campaignInconsistent);
      }
      return { area, season, required: value };
    });
    return {
      name,
      areas: campaign.areas.map((area) => area.label),
      seasons: campaign.periods.map((period) => seasonOfPeriod(period)),
      required,
      rule,
    };
  }
}

/**
 * 期間（API の PeriodView）の季節を、月から決めます。期間の ID は接頭辞つきのため、季節の値そのものではありません（Worker と同じ方法）。
 */
export function seasonOfPeriod(period: PeriodView): Season {
  return Period.fromMonth(period.months[0]).season;
}

/** HTTP の失敗を ApiError にします（本文が形式に合わないときは、代わりの値を作らず、形式の誤りとして扱います）。 */
async function toApiError(response: Response): Promise<ApiError> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return new ApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, response.status);
  }
  if (typeof parsed === 'object' && parsed !== null) {
    const candidate = parsed as { code?: unknown; message?: unknown };
    if (typeof candidate.code === 'string' && typeof candidate.message === 'string') {
      return new ApiError(candidate.code, candidate.message, response.status);
    }
  }
  return new ApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, response.status);
}

/** fetch と同じ形の関数（テストで差し替えられるように外から渡す）。 */
export type CampaignFetch = typeof fetch;

/**
 * キャンペーンの API の呼び出し（同一オリジンの /api/ だけ）。
 * ApiClient は GET と POST だけを扱うため、PUT を含むこの画面の呼び出しをここにまとめます。
 */
export class CampaignApi {
  constructor(private readonly fetcher: CampaignFetch = (input, init) => fetch(input, init)) {}

  /** キャンペーンを取得します。無ければ null（404 campaign_not_found）。 */
  async getCampaign(): Promise<CampaignDetailView | null> {
    try {
      return await this.send<CampaignDetailView>(API_ENDPOINTS.campaignGet, undefined);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'campaign_not_found') {
        return null;
      }
      throw caught;
    }
  }

  /** テンプレートを読み込みます。 */
  loadTemplate(): Promise<CampaignDetailView> {
    const body: TemplateSelectRequest = { templateId: CAMPAIGN_API_CONFIG.defaultTemplateId };
    return this.send<CampaignDetailView>(API_ENDPOINTS.campaignTemplate, body);
  }

  /** キャンペーンの名称・必要数・受入条件を保存します。 */
  updateCampaign(request: CampaignSaveRequest): Promise<CampaignDetailView> {
    return this.send<CampaignDetailView>(API_ENDPOINTS.campaignPut, request);
  }

  /** 区分値を追加します。 */
  addArea(request: CampaignAreasRequest): Promise<CampaignDetailView> {
    return this.send<CampaignDetailView>(API_ENDPOINTS.campaignAreas, request);
  }

  private async send<T>(endpoint: ApiEndpoint, body: unknown): Promise<T> {
    const hasBody = body !== undefined;
    const response = await this.fetcher(endpoint.path, {
      method: endpoint.method,
      credentials: 'same-origin',
      headers: hasBody ? { 'content-type': 'application/json' } : {},
      body: hasBody ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw await toApiError(response);
    }
    return (await response.json()) as T;
  }
}
