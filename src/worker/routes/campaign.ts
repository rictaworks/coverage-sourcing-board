import { RULE_DEFAULTS } from '../../config/defaults';
import { CAMPAIGN_API_CONFIG } from '../../config/campaignApi';
import { API_ERROR_MESSAGES } from '../../config/strings/apiErrors';
import { CAMPAIGN_ERROR_MESSAGES } from '../../config/strings/campaign';
import { CAMPAIGN_API_DEV_MESSAGES, CAMPAIGN_API_ERROR_MESSAGES } from '../../config/strings/campaignApi';
import { WORKER_STRINGS } from '../../config/strings/worker';
import { defineCampaign, type CampaignInput, type RequiredEntry } from '../../core/campaign/defineCampaign';
import { Campaign } from '../../core/campaign/campaign';
import { Cell } from '../../core/campaign/cell';
import { CoverageCalculator, type CellCount } from '../../core/campaign/coverageCalculator';
import { CampaignError, Period, type Season } from '../../core/campaign/period';
import {
  PREFECTURE_CODES,
  type AreaView,
  type CampaignResponse,
  type CampaignUpdateRequest,
  type CellCoverage,
  type CoverageResponse,
  type PrefectureCode,
  type RequiredPerCell,
  type PeriodView,
} from '../../core/api/contract';
import type { ApiEndpointName } from '../../core/api/paths';
import { normalizeText } from '../../core/text/normalize';
import type { AcceptRule, ImageFormat } from '../../core/types';
import { type RouteContext, type RouteHandler } from '../http/router';
import type { ApiResponder } from '../http/responses';
import { CampaignRepo, newCampaignId, newChildId, type CampaignRecord, type CellRow } from '../repo/campaignRepo';
import { CoverageRepo } from '../repo/coverageRepo';

/** マスの応答（必要数を含む）。 */
export interface CampaignCellView {
  readonly cellId: string;
  readonly areaId: string;
  readonly periodId: string;
  readonly required: number;
}

/** キャンペーンの応答（契約の CampaignResponse に、マスと必要数を加えたもの）。 */
export interface CampaignDetailResponse extends CampaignResponse {
  readonly cells: readonly CampaignCellView[];
}

/** PUT /api/campaign の要求（契約の CampaignUpdateRequest に受入条件を加えたもの）。 */
export interface CampaignUpdateBody extends CampaignUpdateRequest {
  readonly acceptRule: AcceptRule;
}

/** 要求の本文が、仕様の形に合わないこと（400 invalid_request）。 */
class InvalidBodyError extends Error {}

/** 値の範囲が上限を超えること（400 invalid_request。応答の文言は、メッセージのキーで決める）。 */
class LimitExceededError extends Error {
  constructor(readonly key: 'area_limit_exceeded' | 'rule_limit_exceeded' | 'required_out_of_range' | 'name_too_long') {
    super(key);
  }
}

/** 上限を超える必要数を拒否する。下限（1 以上の整数）は defineCampaign の検証（REQUIRED_INVALID）が見る。 */
function assertRequiredInRange(value: number): void {
  if (value > CAMPAIGN_API_CONFIG.requiredMax) {
    throw new LimitExceededError('required_out_of_range');
  }
}

/** 保存されたデータの整合性が崩れていること（500 internal_error。詳細は応答に含めず、ログに残す）。 */
class CampaignConsistencyError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidBodyError();
  }
  return value;
}

function requireNumber(value: unknown): number {
  if (typeof value !== 'number') {
    throw new InvalidBodyError();
  }
  return value;
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new InvalidBodyError();
  }
  if (!isRecord(parsed)) {
    throw new InvalidBodyError();
  }
  return parsed;
}

/** 必要数の指定（一律または個別）。個別の値は、マスの ID ごとの数。 */
function requireRequiredPerCell(value: unknown): RequiredPerCell {
  if (!isRecord(value)) {
    throw new InvalidBodyError();
  }
  if (value.mode === 'uniform') {
    return { mode: 'uniform', value: requireNumber(value.value) };
  }
  if (value.mode === 'individual' && isRecord(value.values)) {
    const values: Record<string, number> = {};
    for (const [cellId, required] of Object.entries(value.values)) {
      values[cellId] = requireNumber(required);
    }
    return { mode: 'individual', values };
  }
  throw new InvalidBodyError();
}

/** 受入条件の形。値の範囲は、defineCampaign の検証（RULE_INVALID）が見る。 */
function requireAcceptRule(value: unknown): AcceptRule {
  if (!isRecord(value)) {
    throw new InvalidBodyError();
  }
  const formats = value.formats;
  if (!Array.isArray(formats) || !formats.every((format) => typeof format === 'string')) {
    throw new InvalidBodyError();
  }
  if (typeof value.orientation !== 'string' || typeof value.daytimeRequired !== 'boolean') {
    throw new InvalidBodyError();
  }
  return {
    ratio: requireNumber(value.ratio),
    tolerance: requireNumber(value.tolerance),
    orientation: value.orientation as 'landscape',
    formats: formats as ImageFormat[],
    minShortPx: requireNumber(value.minShortPx),
    blurMin: requireNumber(value.blurMin),
    dupDistance: requireNumber(value.dupDistance),
    daytimeRequired: value.daytimeRequired,
    maxInputBytes: requireNumber(value.maxInputBytes),
    maxPixels: requireNumber(value.maxPixels),
  };
}

/** 区分値の追加の要求（件数は CAMPAIGN_API_CONFIG.areasPerRequest のみ）。 */
function requireAreaRequest(body: Record<string, unknown>): { prefecture: PrefectureCode; label: string } {
  const areas = body.areas;
  if (!Array.isArray(areas) || areas.length !== CAMPAIGN_API_CONFIG.areasPerRequest) {
    throw new InvalidBodyError();
  }
  const item = areas[0];
  if (!isRecord(item)) {
    throw new InvalidBodyError();
  }
  const prefecture = requireString(item.prefecture);
  if (!(PREFECTURE_CODES as readonly string[]).includes(prefecture)) {
    throw new InvalidBodyError();
  }
  return { prefecture: prefecture as PrefectureCode, label: requireString(item.label) };
}

/**
 * D1 の行（CampaignRecord）と、B1 の入力（CampaignInput）・マスの ID の対応をつける。
 * DB のマスの ID は `区分値の ID|期間の ID` で、B1 のマスの ID（`季節:区分値`）とは形が違うため、両方を対応づける。
 */
class CampaignMapper {
  private readonly labelByArea: ReadonlyMap<string, string>;
  private readonly seasonByPeriod: ReadonlyMap<string, Season>;
  private readonly dbCellByDomainId = new Map<string, CellRow>();
  private readonly domainIdByDbCell = new Map<string, string>();
  private readonly cellById: ReadonlyMap<string, CellRow>;

  constructor(private readonly record: CampaignRecord) {
    this.labelByArea = new Map(record.areas.map((area) => [area.id, area.label]));
    this.seasonByPeriod = new Map(record.periods.map((period) => [period.id, Period.fromMonth(period.months[0]).season]));
    this.cellById = new Map(record.cells.map((cell) => [cell.id, cell]));
    for (const cell of record.cells) {
      const domainId = Cell.idOf(normalizeText(this.labelOf(cell.areaId)), this.seasonOf(cell.periodId));
      this.dbCellByDomainId.set(domainId, cell);
      this.domainIdByDbCell.set(cell.id, domainId);
    }
  }

  /** 現在のキャンペーンを、B1 の入力に直す（名称・受入条件・必要数は現在の値）。 */
  currentInput(): CampaignInput {
    return this.inputWith({
      name: this.record.name,
      areas: this.areaLabels(),
      required: this.entriesFrom(new Map(this.record.cells.map((cell) => [cell.id, cell.required]))),
      rule: this.record.rule,
    });
  }

  inputWith(parts: { name: string; areas: readonly string[]; required: readonly RequiredEntry[]; rule: AcceptRule }): CampaignInput {
    return {
      name: parts.name,
      areas: parts.areas,
      seasons: this.record.periods.map((period) => this.seasonOf(period.id)),
      required: parts.required,
      rule: parts.rule,
    };
  }

  areaLabels(): string[] {
    return this.record.areas.map((area) => area.label);
  }

  seasonOf(periodId: string): Season {
    const season = this.seasonByPeriod.get(periodId);
    if (season === undefined) {
      throw new Error(CAMPAIGN_API_DEV_MESSAGES.errorCellMissing);
    }
    return season;
  }

  periods(): readonly { readonly id: string; readonly season: Season }[] {
    return this.record.periods.map((period) => ({ id: period.id, season: this.seasonOf(period.id) }));
  }

  /** DB のマスの ID → 必要数の対応を、B1 の個別の必要数の一覧に直す。知らないマスの ID は CampaignError にする。 */
  entriesFrom(requiredByCellId: ReadonlyMap<string, number>): RequiredEntry[] {
    return [...requiredByCellId].map(([cellId, required]) => {
      const cell = this.cellById.get(cellId);
      if (cell === undefined) {
        throw new CampaignError('REQUIRED_UNKNOWN_CELL');
      }
      return { area: this.labelOf(cell.areaId), season: this.seasonOf(cell.periodId), required };
    });
  }

  /** B1 が検証したマスの ID から、DB のマスの ID を引く。 */
  dbIdOfDomain(domainId: string): CellRow {
    const cell = this.dbCellByDomainId.get(domainId);
    if (cell === undefined) {
      throw new Error(CAMPAIGN_API_DEV_MESSAGES.errorCellMissing);
    }
    return cell;
  }

  domainIdOfDb(cellId: string): string {
    const domainId = this.domainIdByDbCell.get(cellId);
    if (domainId === undefined) {
      throw new CampaignConsistencyError(CAMPAIGN_API_DEV_MESSAGES.errorCellMissing);
    }
    return domainId;
  }

  private labelOf(areaId: string): string {
    const label = this.labelByArea.get(areaId);
    if (label === undefined) {
      throw new Error(CAMPAIGN_API_DEV_MESSAGES.errorCellMissing);
    }
    return label;
  }
}

/** 応答の形（契約の型を使う）。 */
function toDetail(record: CampaignRecord): CampaignDetailResponse {
  return {
    id: record.id,
    name: record.name,
    areas: record.areas.map(
      (area): AreaView => ({ id: area.id, prefecture: area.prefecture as PrefectureCode, label: area.label }),
    ),
    periods: record.periods.map((period): PeriodView => ({ id: period.id, label: period.label, months: [...period.months] })),
    acceptRule: record.rule,
    cells: record.cells.map((cell) => ({ cellId: cell.id, areaId: cell.areaId, periodId: cell.periodId, required: cell.required })),
  };
}

/**
 * キャンペーンと充足マップの経路（requirements 3.1・3.6・4 章）。
 * すべての経路は、セッションのデータだけを扱います（session_id で絞る）。
 */
class CampaignRoutes {
  constructor(private readonly responder: ApiResponder) {}

  async getCampaign(context: RouteContext): Promise<Response> {
    try {
      const record = await new CampaignRepo(context.env.DB).readRecord(requireSession(context));
      return record === null ? this.notFound() : this.responder.json(toDetail(record), 200);
    } catch (error) {
      return this.failure(error);
    }
  }

  async loadTemplate(context: RouteContext): Promise<Response> {
    try {
      const session = requireSession(context);
      const body = await readJsonObject(context.request);
      if (requireString(body.templateId) !== CAMPAIGN_API_CONFIG.defaultTemplateId) {
        throw new InvalidBodyError();
      }
      const repo = new CampaignRepo(context.env.DB);
      const existing = await repo.readRecord(session);
      if (existing !== null) {
        return this.responder.json(toDetail(existing), 200);
      }
      const changes = await repo.copyTemplate(session, CAMPAIGN_API_CONFIG.defaultTemplateId, newCampaignId());
      const created = await repo.readRecord(session);
      if (created === null) {
        throw new Error(CAMPAIGN_API_DEV_MESSAGES.errorTemplateMissing);
      }
      return this.responder.json(toDetail(created), changes === 1 ? 201 : 200);
    } catch (error) {
      return this.failure(error);
    }
  }

  async updateCampaign(context: RouteContext): Promise<Response> {
    try {
      const session = requireSession(context);
      const repo = new CampaignRepo(context.env.DB);
      const record = await repo.readRecord(session);
      if (record === null) {
        return this.notFound();
      }
      const body = await readJsonObject(context.request);
      const update: CampaignUpdateBody = {
        name: requireString(body.name),
        requiredPerCell: requireRequiredPerCell(body.requiredPerCell),
        acceptRule: requireAcceptRule(body.acceptRule),
      };
      if ([...normalizeText(update.name)].length > CAMPAIGN_API_CONFIG.nameMaxChars) {
        throw new LimitExceededError('name_too_long');
      }
      if (update.acceptRule.maxInputBytes > RULE_DEFAULTS.maxInputBytes || update.acceptRule.maxPixels > RULE_DEFAULTS.maxInputPixels) {
        throw new LimitExceededError('rule_limit_exceeded');
      }
      const mapper = new CampaignMapper(record);
      const required = update.requiredPerCell;
      if (required.mode === 'uniform') {
        assertRequiredInRange(required.value);
      } else {
        Object.values(required.values).forEach(assertRequiredInRange);
      }
      const requiredByCellId =
        required.mode === 'uniform'
          ? new Map(record.cells.map((cell) => [cell.id, required.value]))
          : new Map(Object.entries(required.values));
      const domain = defineCampaign(
        mapper.inputWith({
          name: update.name,
          areas: mapper.areaLabels(),
          required: mapper.entriesFrom(requiredByCellId),
          rule: update.acceptRule,
        }),
        () => record.id,
      );
      await repo.updateCampaign(
        session,
        record.id,
        domain.name,
        domain.cells.map((cell) => ({ id: mapper.dbIdOfDomain(cell.id).id, required: cell.required })),
        update.acceptRule,
      );
      const updated = await repo.readRecord(session);
      if (updated === null) {
        throw new Error(CAMPAIGN_API_DEV_MESSAGES.errorTemplateMissing);
      }
      return this.responder.json(toDetail(updated), 200);
    } catch (error) {
      return this.failure(error);
    }
  }

  async addArea(context: RouteContext): Promise<Response> {
    try {
      const session = requireSession(context);
      const repo = new CampaignRepo(context.env.DB);
      const record = await repo.readRecord(session);
      if (record === null) {
        return this.notFound();
      }
      const request = requireAreaRequest(await readJsonObject(context.request));
      if (record.areas.length >= CAMPAIGN_API_CONFIG.areasMax) {
        throw new LimitExceededError('area_limit_exceeded');
      }
      const mapper = new CampaignMapper(record);
      const addedRequired = CAMPAIGN_API_CONFIG.addedAreaRequiredPerCell;
      const addedEntries: RequiredEntry[] = mapper
        .periods()
        .map((period) => ({ area: request.label, season: period.season, required: addedRequired }));
      const domain = defineCampaign(
        mapper.inputWith({
          name: record.name,
          areas: [...mapper.areaLabels(), request.label],
          required: [
            ...mapper.entriesFrom(new Map(record.cells.map((cell) => [cell.id, cell.required]))),
            ...addedEntries,
          ],
          rule: record.rule,
        }),
        () => record.id,
      );
      const addedArea = domain.areas[domain.areas.length - 1];
      const areaId = `${record.id}:${newChildId()}`;
      const added = await repo.addArea(
        session,
        record.id,
        { id: areaId, prefecture: request.prefecture, label: addedArea.label },
        record.periods.map((period) => ({ id: `${areaId}|${period.id}`, periodId: period.id, required: addedRequired })),
      );
      if (!added) {
        return this.error('area_duplicate', 409, CAMPAIGN_API_ERROR_MESSAGES.area_duplicate);
      }
      const updated = await repo.readRecord(session);
      if (updated === null) {
        throw new Error(CAMPAIGN_API_DEV_MESSAGES.errorTemplateMissing);
      }
      return this.responder.json(toDetail(updated), 201);
    } catch (error) {
      return this.failure(error);
    }
  }

  async coverage(context: RouteContext): Promise<Response> {
    try {
      const session = requireSession(context);
      const record = await new CampaignRepo(context.env.DB).readRecord(session);
      if (record === null) {
        return this.notFound();
      }
      const mapper = new CampaignMapper(record);
      const domain: Campaign = defineCampaign(mapper.currentInput(), () => record.id);
      const counts = await new CoverageRepo(context.env.DB).countByCell(session);
      const cellCounts: CellCount[] = counts.map((row) => ({
        campaignId: record.id,
        cellId: mapper.domainIdOfDb(row.cellId),
        accepted: row.accepted,
        pending: row.pending,
      }));
      const report = new CoverageCalculator().compute(domain, cellCounts);
      const cells: CellCoverage[] = report.cells.map((status) => {
        const cell = mapper.dbIdOfDomain(status.cellId);
        return {
          cellId: cell.id,
          areaId: cell.areaId,
          periodId: cell.periodId,
          accepted: status.accepted,
          pendingReview: status.pending,
          required: status.required,
          closed: !status.open,
        };
      });
      const body: CoverageResponse = {
        cells,
        priority: report.wanted.map((status) => mapper.dbIdOfDomain(status.cellId).id),
      };
      return this.responder.json(body, 200);
    } catch (error) {
      return this.failure(error);
    }
  }

  private notFound(): Response {
    return this.error('campaign_not_found', 404, CAMPAIGN_API_ERROR_MESSAGES.campaign_not_found);
  }

  private error(code: string, status: number, message: string): Response {
    return this.responder.json({ code, message }, status);
  }

  /** 想定の失敗（不正な入力・重複・キャンペーンが無い）は応答に変える。それ以外の例外は握りつぶさず、基盤の 500 に任せる。 */
  private failure(error: unknown): Response {
    if (error instanceof InvalidBodyError) {
      return this.error('invalid_request', 400, API_ERROR_MESSAGES.invalid_request);
    }
    if (error instanceof CampaignConsistencyError) {
      console.error(error.message);
      return this.error('internal_error', 500, API_ERROR_MESSAGES.internal_error);
    }
    if (error instanceof LimitExceededError) {
      return this.error('invalid_request', 400, CAMPAIGN_API_ERROR_MESSAGES[error.key]);
    }
    if (error instanceof CampaignError) {
      if (error.code === 'AREA_DUPLICATE') {
        return this.error('area_duplicate', 409, CAMPAIGN_API_ERROR_MESSAGES.area_duplicate);
      }
      return this.error('invalid_request', 400, CAMPAIGN_ERROR_MESSAGES[error.code]);
    }
    throw error;
  }
}

function requireSession(context: RouteContext): string {
  if (context.sessionIdHash === null) {
    throw new Error(WORKER_STRINGS.errorSessionMissing);
  }
  return context.sessionIdHash;
}

/** キャンペーンと充足の経路のハンドラー（C2）。 */
export function campaignHandlers(responder: ApiResponder): Partial<Record<ApiEndpointName, RouteHandler>> {
  const routes = new CampaignRoutes(responder);
  return {
    campaignGet: (context) => routes.getCampaign(context),
    campaignPut: (context) => routes.updateCampaign(context),
    campaignTemplate: (context) => routes.loadTemplate(context),
    campaignAreas: (context) => routes.addArea(context),
    coverage: (context) => routes.coverage(context),
  };
}
