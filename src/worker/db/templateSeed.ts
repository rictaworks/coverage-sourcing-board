/**
 * テンプレート（四国 風景写真）を D1 に投入する SQL 文の一覧を作る（requirements 3.9・6 章）。
 * - 投入は固定のシステム用 ID（TEMPLATE_SESSION_ID）の行として作る。利用者のクエリには含めない。
 * - 行の ID を固定にし、INSERT ... ON CONFLICT で更新するため、何度実行しても行は重複しない。
 * - 1 文あたりのバインド変数は 100 以下にする。エリアと期間は JSON を 1 つの変数で渡し、マスは INSERT ... SELECT で作る。
 * - 文の数は 6 以下にする（テンプレートの日次の再投入を、クエリ数の上限に収めるため）。
 * 外部に依存しない純粋な関数だけを置く（D1 への実行は呼び出し側が行う）。
 */
import { normalizeText } from '../../core/text/normalize';

/** テンプレートのシステム用 ID（session.id_hash に入れる固定値。Cookie のハッシュ（16 進）とは衝突しない）。 */
export const TEMPLATE_SESSION_ID = 'system-template';

/** data/templates/*.json の形。 */
export interface TemplateDefinition {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly requiredPerCell: number;
  readonly areas: readonly {
    readonly id: string;
    readonly prefecture: string;
    readonly label: string;
  }[];
  readonly periods: readonly {
    readonly id: string;
    readonly label: string;
    readonly months: readonly number[];
  }[];
  readonly acceptRule: {
    readonly ratio: { readonly width: number; readonly height: number };
    readonly tolerance: number;
    readonly orientation: string;
    readonly formats: readonly string[];
    readonly minShortPx: number;
    readonly blurMin: number;
    readonly dupDistance: number;
    readonly daytimeRequired: boolean;
    readonly maxInputBytes: number;
    readonly maxPixels: number;
  };
}

/** D1 の prepare に渡す 1 文。binds は ? の順に対応する。 */
export interface SeedStatement {
  readonly sql: string;
  readonly binds: readonly (string | number)[];
}

export class TemplateSeedBuilder {
  constructor(private readonly template: TemplateDefinition) {}

  buildStatements(): SeedStatement[] {
    const campaignId = this.template.id;
    const rule = this.template.acceptRule;
    const periods = this.template.periods.map((period) => ({
      id: `${campaignId}:${period.id}`,
      label: period.label,
      months: JSON.stringify(period.months),
    }));
    const areas = this.template.areas.map((area) => ({
      id: `${campaignId}:${area.id}`,
      prefecture: area.prefecture,
      label: area.label,
      normalized: normalizeText(area.label),
    }));
    return [
      {
        sql: 'INSERT INTO session (id_hash) VALUES (?) ON CONFLICT (id_hash) DO NOTHING',
        binds: [TEMPLATE_SESSION_ID],
      },
      {
        sql: 'INSERT INTO campaign (id, session_id, name) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name',
        binds: [campaignId, TEMPLATE_SESSION_ID, this.template.name],
      },
      {
        sql: `INSERT INTO accept_rule (id, session_id, campaign_id, ratio, tolerance, orientation, formats, min_short_px, blur_min, dup_distance, daytime_required, max_input_bytes, max_pixels)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET ratio = excluded.ratio, tolerance = excluded.tolerance, orientation = excluded.orientation, formats = excluded.formats, min_short_px = excluded.min_short_px, blur_min = excluded.blur_min, dup_distance = excluded.dup_distance, daytime_required = excluded.daytime_required, max_input_bytes = excluded.max_input_bytes, max_pixels = excluded.max_pixels`,
        binds: [
          `${campaignId}:accept-rule`,
          TEMPLATE_SESSION_ID,
          campaignId,
          rule.ratio.width / rule.ratio.height,
          rule.tolerance,
          rule.orientation,
          JSON.stringify(rule.formats),
          rule.minShortPx,
          rule.blurMin,
          rule.dupDistance,
          rule.daytimeRequired ? 1 : 0,
          rule.maxInputBytes,
          rule.maxPixels,
        ],
      },
      {
        sql: `INSERT INTO period (id, session_id, campaign_id, label, months)
SELECT json_extract(value, '$.id'), ?, ?, json_extract(value, '$.label'), json_extract(value, '$.months')
FROM json_each(?) WHERE true
ON CONFLICT (id) DO UPDATE SET label = excluded.label, months = excluded.months`,
        binds: [TEMPLATE_SESSION_ID, campaignId, JSON.stringify(periods)],
      },
      {
        sql: `INSERT INTO area (id, session_id, campaign_id, prefecture, label, normalized)
SELECT json_extract(value, '$.id'), ?, ?, json_extract(value, '$.prefecture'), json_extract(value, '$.label'), json_extract(value, '$.normalized')
FROM json_each(?) WHERE true
ON CONFLICT (id) DO UPDATE SET prefecture = excluded.prefecture, label = excluded.label, normalized = excluded.normalized`,
        binds: [TEMPLATE_SESSION_ID, campaignId, JSON.stringify(areas)],
      },
      {
        sql: `INSERT INTO cell (id, session_id, area_id, period_id, required)
SELECT area.id || '|' || period.id, ?, area.id, period.id, ?
FROM area CROSS JOIN period
WHERE area.session_id = ? AND period.session_id = ? AND area.campaign_id = ? AND period.campaign_id = ?
ON CONFLICT (id) DO UPDATE SET required = excluded.required`,
        binds: [
          TEMPLATE_SESSION_ID,
          this.template.requiredPerCell,
          TEMPLATE_SESSION_ID,
          TEMPLATE_SESSION_ID,
          campaignId,
          campaignId,
        ],
      },
    ];
  }
}
