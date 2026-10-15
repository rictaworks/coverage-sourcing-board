import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError, type FetchLike } from '../../../src/frontend/lib/apiClient';
import { CoverageApi, CoverageViewBuilder } from '../../../src/frontend/lib/api/coverageApi';
import type { CampaignResponse, CoverageResponse } from '../../../src/core/api/contract';
import { PREFECTURE_CODES } from '../../../src/core/api/contract';
import { COVERAGE_API_CODES } from '../../../src/config/strings/coverage';

interface TemplateArea {
  readonly id: string;
  readonly prefecture: string;
  readonly label: string;
}

interface TemplatePeriod {
  readonly id: string;
  readonly label: string;
  readonly months: readonly number[];
}

interface Template {
  readonly areas: readonly TemplateArea[];
  readonly periods: readonly TemplatePeriod[];
}

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE: Template = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'data', 'templates', 'shikoku-landscape.json'), 'utf8'),
) as Template;

type CampaignLike = Pick<CampaignResponse, 'name' | 'areas' | 'periods'>;

/** テンプレートの区分値と期間から、キャンペーンの応答を作る。期間の並びは引数の順。 */
function campaignFrom(periods: readonly TemplatePeriod[] = TEMPLATE.periods): CampaignLike {
  return {
    name: 'Test campaign',
    areas: TEMPLATE.areas.map((area) => ({
      id: area.id,
      prefecture: area.prefecture as CampaignResponse['areas'][number]['prefecture'],
      label: area.label,
    })),
    periods: periods.map((period) => ({ id: period.id, label: period.label, months: [...period.months] })),
  };
}

/** 全マスの充足の応答。closedAreaIds に含まれる区分値の全マスは募集終了（closed）にする。 */
function coverageFrom(options: {
  readonly closedAreaIds?: readonly string[];
  readonly accepted?: number;
  readonly priority?: readonly string[];
  readonly omitFirst?: boolean;
}): CoverageResponse {
  const closed = options.closedAreaIds ?? [];
  const cells = TEMPLATE.areas.flatMap((area) =>
    TEMPLATE.periods.map((period) => ({
      cellId: `${area.id}:${period.id}`,
      areaId: area.id,
      periodId: period.id,
      accepted: closed.includes(area.id) ? 2 : (options.accepted ?? 0),
      pendingReview: 1,
      required: 2,
      closed: closed.includes(area.id),
    })),
  );
  const open = cells.filter((cell) => !cell.closed).map((cell) => cell.cellId);
  return {
    cells: options.omitFirst === true ? cells.slice(1) : cells,
    priority: options.priority ?? open,
  };
}

describe('CoverageViewBuilder（充足マップの表と一覧の組み立て）', () => {
  it('県ごとにまとめ、県の順と区分値の順を保ちます', () => {
    const view = new CoverageViewBuilder().build(campaignFrom(), coverageFrom({}));
    expect(view.groups.map((group) => group.prefecture)).toEqual([...PREFECTURE_CODES]);
    const rowCount = view.groups.reduce((sum, group) => sum + group.rows.length, 0);
    expect(rowCount).toBe(TEMPLATE.areas.length);
    expect(view.groups.flatMap((group) => group.rows.map((row) => row.areaId))).toEqual(
      TEMPLATE.areas.map((area) => area.id),
    );
  });

  it('季節の列は、期間の並びに関わらず春・夏・秋・冬の順になります', () => {
    const reversed = [...TEMPLATE.periods].reverse();
    const view = new CoverageViewBuilder().build(campaignFrom(reversed), coverageFrom({}));
    expect(view.seasons.map((season) => season.id)).toEqual(['spring', 'summer', 'autumn', 'winter']);
    expect(view.seasons.map((season) => season.label)).toEqual(TEMPLATE.periods.map((period) => period.label));
  });

  it('各マスに採用数・確認待ち数・必要数を写し、未充足と募集終了を区別します', () => {
    const closedArea = TEMPLATE.areas[0].id;
    const view = new CoverageViewBuilder().build(campaignFrom(), coverageFrom({ closedAreaIds: [closedArea] }));
    const firstRow = view.groups[0].rows[0];
    expect(firstRow.areaId).toBe(closedArea);
    for (const cell of firstRow.cells) {
      expect(cell.state).toBe('closed');
      expect(cell.accepted).toBe(2);
      expect(cell.required).toBe(2);
      expect(cell.pendingReview).toBe(1);
    }
    const otherCell = view.groups[0].rows[1].cells[0];
    expect(otherCell.state).toBe('unfilled');
    expect(otherCell.accepted).toBe(0);
    expect(otherCell.required).toBe(2);
  });

  it('いま求めている場所は、API の並び順のまま、募集中のマスだけを並べます', () => {
    const [first, second] = [`${TEMPLATE.areas[1].id}:spring`, `${TEMPLATE.areas[2].id}:summer`];
    const closedArea = TEMPLATE.areas[0].id;
    const view = new CoverageViewBuilder().build(
      campaignFrom(),
      coverageFrom({ closedAreaIds: [closedArea], priority: [second, first] }),
    );
    expect(view.wanted.map((item) => item.cellId)).toEqual([second, first]);
    expect(view.wanted[0].areaLabel).toBe(TEMPLATE.areas[2].label);
    expect(view.wanted[0].seasonLabel).toBe(TEMPLATE.periods[1].label);
    expect(view.wanted[0].remaining).toBe(2);
  });

  it('マスの対応が取れないときは例外にします（代わりの値を作りません）', () => {
    const builder = new CoverageViewBuilder();
    expect(() => builder.build(campaignFrom(), coverageFrom({ omitFirst: true }))).toThrow();
    expect(() =>
      builder.build(campaignFrom(), coverageFrom({ priority: ['unknown:spring'] })),
    ).toThrow();
  });
});

/** 応答を返す偽の fetch。 */
function fakeFetch(respond: (path: string) => Response | Promise<Response>): FetchLike {
  return async (input) => respond(input);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('CoverageApi（充足の読み込み）', () => {
  it('キャンペーンと充足を読み、表と一覧の組み立てを返します', async () => {
    const client = new ApiClient(
      fakeFetch((path) => {
        if (path === '/api/campaign') {
          return jsonResponse(200, campaignFrom());
        }
        return jsonResponse(200, coverageFrom({}));
      }),
    );
    const result = await new CoverageApi(client).load();
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.view.groups.length).toBe(PREFECTURE_CODES.length);
      expect(result.campaignName).toBe('Test campaign');
    }
  });

  it('キャンペーンが無い（404 の campaign_not_found）ときは、notFound を返します', async () => {
    const client = new ApiClient(
      fakeFetch(() => jsonResponse(404, { code: COVERAGE_API_CODES.campaignNotFound, message: 'x' })),
    );
    await expect(new CoverageApi(client).load()).resolves.toEqual({ kind: 'notFound' });
  });

  it('通信の失敗は握りつぶさず、例外として外に出します', async () => {
    const client = new ApiClient(
      fakeFetch(() => {
        throw new TypeError('network down');
      }),
    );
    await expect(new CoverageApi(client).load()).rejects.toBeInstanceOf(TypeError);
  });

  it('404 以外の API のエラーは ApiError として外に出します', async () => {
    const client = new ApiClient(fakeFetch(() => jsonResponse(500, { code: 'internal_error', message: 'x' })));
    await expect(new CoverageApi(client).load()).rejects.toBeInstanceOf(ApiError);
  });
});
