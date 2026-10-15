import type { AcceptRule, ImageFormat } from '../../core/types';
import { CAMPAIGN_API_DEV_MESSAGES } from '../../config/strings/campaignApi';
import { TEMPLATE_SESSION_ID } from '../db/templateSeed';

/** 区分値の行（session_id で絞った結果）。 */
export interface AreaRow {
  readonly id: string;
  readonly prefecture: string;
  readonly label: string;
}

/** 期間の行。months は JSON の配列を読んだもの。 */
export interface PeriodRow {
  readonly id: string;
  readonly label: string;
  readonly months: readonly number[];
}

/** マスの行。 */
export interface CellRow {
  readonly id: string;
  readonly areaId: string;
  readonly periodId: string;
  readonly required: number;
}

/** キャンペーンの全体（自分のセッションの行だけ）。areas・periods・cells は表示の順に並ぶ。 */
export interface CampaignRecord {
  readonly id: string;
  readonly name: string;
  readonly areas: readonly AreaRow[];
  readonly periods: readonly PeriodRow[];
  readonly cells: readonly CellRow[];
  readonly rule: AcceptRule;
}

/** 新しいキャンペーンの ID（採番は関数で行う）。 */
export function newCampaignId(): string {
  return crypto.randomUUID();
}

/** 区分値・マスの ID に使う、新しい部品の ID。 */
export function newChildId(): string {
  return crypto.randomUUID();
}

interface RuleRow {
  readonly ratio: number;
  readonly tolerance: number;
  readonly orientation: 'landscape';
  readonly formats: string;
  readonly min_short_px: number;
  readonly blur_min: number;
  readonly dup_distance: number;
  readonly daytime_required: number;
  readonly max_input_bytes: number;
  readonly max_pixels: number;
}

interface CellDbRow {
  readonly id: string;
  readonly area_id: string;
  readonly period_id: string;
  readonly required: number;
}

const RULE_COLUMNS =
  'ratio, tolerance, orientation, formats, min_short_px, blur_min, dup_distance, daytime_required, max_input_bytes, max_pixels';

/**
 * キャンペーンの行（campaign・area・period・cell・accept_rule）の読み書き。
 * すべての利用者のクエリは session_id を条件に含み、システム用 ID の行を含めません（requirements 2.3）。
 * SQL はバインド変数だけで組み立てます（OWASP A03）。
 */
export class CampaignRepo {
  constructor(private readonly db: D1Database) {}

  /** このセッションのキャンペーンの ID。無ければ null。 */
  async findCampaignId(sessionHash: string): Promise<string | null> {
    const row = await this.db
      .prepare('SELECT id FROM campaign WHERE session_id = ? ORDER BY created_at, id LIMIT 1')
      .bind(sessionHash)
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  /** このセッションのキャンペーンの全体を読む。無ければ null。 */
  async readRecord(sessionHash: string): Promise<CampaignRecord | null> {
    const campaign = await this.db
      .prepare('SELECT id, name FROM campaign WHERE session_id = ? ORDER BY created_at, id LIMIT 1')
      .bind(sessionHash)
      .first<{ id: string; name: string }>();
    if (campaign === null) {
      return null;
    }
    const areas = await this.db
      .prepare('SELECT id, prefecture, label FROM area WHERE session_id = ? AND campaign_id = ? ORDER BY rowid')
      .bind(sessionHash, campaign.id)
      .all<AreaRow>();
    const periodRows = await this.db
      .prepare('SELECT id, label, months FROM period WHERE session_id = ? AND campaign_id = ? ORDER BY rowid')
      .bind(sessionHash, campaign.id)
      .all<{ id: string; label: string; months: string }>();
    const cellRows = await this.db
      .prepare(
        `SELECT cell.id, cell.area_id, cell.period_id, cell.required FROM cell
         JOIN area ON area.id = cell.area_id
         WHERE cell.session_id = ? AND area.campaign_id = ?
         ORDER BY area.rowid, cell.rowid`,
      )
      .bind(sessionHash, campaign.id)
      .all<CellDbRow>();
    const ruleRow = await this.db
      .prepare(`SELECT ${RULE_COLUMNS} FROM accept_rule WHERE session_id = ? AND campaign_id = ?`)
      .bind(sessionHash, campaign.id)
      .first<RuleRow>();
    if (ruleRow === null) {
      throw new Error(CAMPAIGN_API_DEV_MESSAGES.errorRuleMissing);
    }
    const periods: PeriodRow[] = periodRows.results.map((row) => ({
      id: row.id,
      label: row.label,
      months: JSON.parse(row.months) as number[],
    }));
    const periodOrder = new Map(periods.map((period, index) => [period.id, index]));
    const areaOrder = new Map(areas.results.map((area, index) => [area.id, index]));
    const cells = cellRows.results
      .map((row) => this.toCell(row))
      .sort((a, b) => {
        const byArea = (areaOrder.get(a.areaId) ?? 0) - (areaOrder.get(b.areaId) ?? 0);
        return byArea !== 0 ? byArea : (periodOrder.get(a.periodId) ?? 0) - (periodOrder.get(b.periodId) ?? 0);
      });
    return {
      id: campaign.id,
      name: campaign.name,
      areas: areas.results,
      periods,
      cells,
      rule: this.toRule(ruleRow),
    };
  }

  /** 受入条件（このセッションのキャンペーン）。無ければ null。C3・C5 が使う読み取り。 */
  async readAcceptRule(sessionHash: string): Promise<AcceptRule | null> {
    const ruleRow = await this.db
      .prepare(`SELECT ${RULE_COLUMNS} FROM accept_rule WHERE session_id = ? LIMIT 1`)
      .bind(sessionHash)
      .first<RuleRow>();
    return ruleRow === null ? null : this.toRule(ruleRow);
  }

  /** 1 つのマス（このセッションの行だけ）。無ければ null。C3・C5 が使う読み取り。 */
  async readCell(sessionHash: string, cellId: string): Promise<CellRow | null> {
    const row = await this.db
      .prepare('SELECT id, area_id, period_id, required FROM cell WHERE session_id = ? AND id = ?')
      .bind(sessionHash, cellId)
      .first<CellDbRow>();
    return row === null ? null : this.toCell(row);
  }

  /** マスの採用数（採用の行だけを数える。確認待ちは含めない）。C3・C5 が使う読み取り。 */
  async countAcceptedInCell(sessionHash: string, cellId: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS n FROM submission WHERE session_id = ? AND cell_id = ? AND status = 'accepted'")
      .bind(sessionHash, cellId)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  /**
   * テンプレートの行（システム用 ID）を、このセッションの新しいキャンペーンとして複製する。1 回の batch で行う。
   * 新しい ID は、テンプレートの ID の接頭辞を replace で付け替えて作る。
   * campaign の挿入は、このセッションにキャンペーンが無いときだけ行う。子の行は、挿入されたキャンペーンがあるときだけ入る。
   * 戻り値は campaign の挿入の件数（1 なら複製した。0 なら既にあるか、テンプレートが無い）。
   */
  async copyTemplate(sessionHash: string, templateId: string, newId: string): Promise<number> {
    const T = templateId;
    const N = newId;
    const S = sessionHash;
    const TS = TEMPLATE_SESSION_ID;
    const guard = 'EXISTS (SELECT 1 FROM campaign WHERE id = ?)';
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO campaign (id, session_id, name)
           SELECT ?, ?, t.name FROM campaign t
           WHERE t.id = ? AND t.session_id = ? AND NOT EXISTS (SELECT 1 FROM campaign c WHERE c.session_id = ?)`,
        )
        .bind(N, S, T, TS, S),
      this.db
        .prepare(
          `INSERT INTO accept_rule (id, session_id, campaign_id, ratio, tolerance, orientation, formats, min_short_px, blur_min, dup_distance, daytime_required, max_input_bytes, max_pixels)
           SELECT replace(a.id, ?, ?), ?, ?, a.ratio, a.tolerance, a.orientation, a.formats, a.min_short_px, a.blur_min, a.dup_distance, a.daytime_required, a.max_input_bytes, a.max_pixels
           FROM accept_rule a WHERE a.session_id = ? AND a.campaign_id = ? AND ${guard}`,
        )
        .bind(T, N, S, N, TS, T, N),
      this.db
        .prepare(
          `INSERT INTO period (id, session_id, campaign_id, label, months)
           SELECT replace(p.id, ?, ?), ?, ?, p.label, p.months FROM period p
           WHERE p.session_id = ? AND p.campaign_id = ? AND ${guard} ORDER BY p.rowid`,
        )
        .bind(T, N, S, N, TS, T, N),
      this.db
        .prepare(
          `INSERT INTO area (id, session_id, campaign_id, prefecture, label, normalized)
           SELECT replace(a.id, ?, ?), ?, ?, a.prefecture, a.label, a.normalized FROM area a
           WHERE a.session_id = ? AND a.campaign_id = ? AND ${guard} ORDER BY a.rowid`,
        )
        .bind(T, N, S, N, TS, T, N),
      this.db
        .prepare(
          `INSERT INTO cell (id, session_id, area_id, period_id, required)
           SELECT replace(c.id, ?, ?), ?, replace(c.area_id, ?, ?), replace(c.period_id, ?, ?), c.required
           FROM cell c JOIN area a ON a.id = c.area_id
           WHERE c.session_id = ? AND a.campaign_id = ? AND ${guard} ORDER BY c.rowid`,
        )
        .bind(T, N, S, T, N, T, N, TS, T, N),
    ]);
    return results[0].meta.changes ?? 0;
  }

  /** キャンペーンの名称・マスの必要数・受入条件を 1 回の batch で更新する。cells は、更新後の必要数を持つマス。 */
  async updateCampaign(
    sessionHash: string,
    campaignId: string,
    name: string,
    cells: readonly { readonly id: string; readonly required: number }[],
    rule: AcceptRule,
  ): Promise<void> {
    const cellJson = JSON.stringify(cells.map((cell) => ({ id: cell.id, required: cell.required })));
    await this.db.batch([
      this.db.prepare('UPDATE campaign SET name = ? WHERE id = ? AND session_id = ?').bind(name, campaignId, sessionHash),
      this.db
        .prepare(
          `UPDATE accept_rule SET ratio = ?, tolerance = ?, orientation = ?, formats = ?, min_short_px = ?, blur_min = ?,
           dup_distance = ?, daytime_required = ?, max_input_bytes = ?, max_pixels = ?
           WHERE campaign_id = ? AND session_id = ?`,
        )
        .bind(
          rule.ratio,
          rule.tolerance,
          rule.orientation,
          JSON.stringify(rule.formats),
          rule.minShortPx,
          rule.blurMin,
          rule.dupDistance,
          rule.daytimeRequired ? 1 : 0,
          rule.maxInputBytes,
          rule.maxPixels,
          campaignId,
          sessionHash,
        ),
      this.db
        .prepare(
          `UPDATE cell SET required = (SELECT json_extract(value, '$.required') FROM json_each(?) WHERE json_extract(value, '$.id') = cell.id)
           WHERE session_id = ? AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?))`,
        )
        .bind(cellJson, sessionHash, cellJson),
    ]);
  }

  /**
   * 区分値を 1 件と、その期間ごとのマスを 1 回の batch で追加する。
   * 同じ正規化の区分値が、このセッションに既にあれば何も追加せず false を返す。
   */
  async addArea(
    sessionHash: string,
    campaignId: string,
    area: { readonly id: string; readonly prefecture: string; readonly label: string },
    cells: readonly { readonly id: string; readonly periodId: string; readonly required: number }[],
  ): Promise<boolean> {
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO area (id, session_id, campaign_id, prefecture, label, normalized)
           SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM area WHERE session_id = ? AND normalized = ?)`,
        )
        .bind(area.id, sessionHash, campaignId, area.prefecture, area.label, area.label, sessionHash, area.label),
      ...cells.map((cell) =>
        this.db
          .prepare(
            `INSERT INTO cell (id, session_id, area_id, period_id, required)
             SELECT ?, ?, area.id, ?, ? FROM area WHERE area.id = ?`,
          )
          .bind(cell.id, sessionHash, cell.periodId, cell.required, area.id),
      ),
    ]);
    return (results[0].meta.changes ?? 0) === 1;
  }

  private toCell(row: CellDbRow): CellRow {
    return { id: row.id, areaId: row.area_id, periodId: row.period_id, required: row.required };
  }

  private toRule(row: RuleRow): AcceptRule {
    return {
      ratio: row.ratio,
      tolerance: row.tolerance,
      orientation: row.orientation,
      formats: JSON.parse(row.formats) as ImageFormat[],
      minShortPx: row.min_short_px,
      blurMin: row.blur_min,
      dupDistance: row.dup_distance,
      daytimeRequired: row.daytime_required === 1,
      maxInputBytes: row.max_input_bytes,
      maxPixels: row.max_pixels,
    };
  }
}
