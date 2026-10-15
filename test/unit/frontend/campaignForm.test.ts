import { describe, expect, it } from 'vitest';
import {
  CampaignApi,
  CampaignDraftBuilder,
  fieldOfApiMessage,
  type CampaignDetailView,
} from '../../../src/frontend/lib/api/campaignApi';
import { CAMPAIGN_API_CONFIG } from '../../../src/config/campaignApi';
import { CAMPAIGN_API_ERROR_MESSAGES } from '../../../src/config/strings/campaignApi';
import { CAMPAIGN_ERROR_MESSAGES } from '../../../src/config/strings/campaign';
import { RULE_DEFAULTS } from '../../../src/config/defaults';
import { CAMPAIGN_SETTINGS_STRINGS } from '../../../src/config/strings/campaignSettings';
import { CAMPAIGN_SETTINGS_INPUTS as IN } from '../../fixtures/campaign-settings-inputs';

/** テスト用のキャンペーン（2 区分値 × 4 季節）。テンプレートの形を模す。 */
function sampleCampaign(): CampaignDetailView {
  const periods = [
    { id: 'spring', label: IN.seasonSpring, months: [3, 4, 5] },
    { id: 'summer', label: IN.seasonSummer, months: [6, 7, 8] },
    { id: 'autumn', label: IN.seasonAutumn, months: [9, 10, 11] },
    { id: 'winter', label: IN.seasonWinter, months: [12, 1, 2] },
  ];
  const areas = [
    { id: 'tokushima-01', prefecture: 'tokushima' as const, label: IN.areaTokushima },
    { id: 'kochi-01', prefecture: 'kochi' as const, label: IN.areaKochi },
  ];
  const cells = areas.flatMap((area) =>
    periods.map((period) => ({
      cellId: `${area.id}|${period.id}`,
      areaId: area.id,
      periodId: period.id,
      required: 2,
    })),
  );
  return {
    id: 'campaign-1',
    name: IN.campaignName,
    areas,
    periods,
    acceptRule: {
      ratio: 4 / 3,
      tolerance: 0.01,
      orientation: 'landscape',
      formats: ['jpeg', 'png'],
      minShortPx: 800,
      blurMin: 30,
      dupDistance: 4,
      daytimeRequired: true,
      maxInputBytes: 5 * 1024 * 1024,
      maxPixels: 40_000_000,
    },
    cells,
  };
}

describe('一律の必要数の展開（expandUniform）', () => {
  it('一律の値を、すべてのマスに展開します', () => {
    const builder = new CampaignDraftBuilder();
    const ids = ['a', 'b', 'c'];
    expect(builder.expandUniform(ids, 2)).toEqual({ a: 2, b: 2, c: 2 });
  });

  it('区分値の 21 件 × 4 季節（84 マス）にも、同じ値を展開します', () => {
    const builder = new CampaignDraftBuilder();
    const ids = Array.from({ length: 84 }, (_, index) => `cell-${index}`);
    const expanded = builder.expandUniform(ids, 2);
    expect(Object.keys(expanded)).toHaveLength(84);
    expect(Object.values(expanded).every((value) => value === 2)).toBe(true);
  });

  it('範囲の外の値は展開せず、例外にします', () => {
    const builder = new CampaignDraftBuilder();
    expect(() => builder.expandUniform(['a'], 0)).toThrow();
    expect(() => builder.expandUniform(['a'], CAMPAIGN_API_CONFIG.requiredMax + 1)).toThrow();
  });
});

describe('必要数の入力（parseRequiredInput）', () => {
  const builder = new CampaignDraftBuilder();

  it.each([
    ['1', 1],
    ['2', 2],
    ['999', 999],
    [IN.fullWidthDigitTwo, 2],
    [' 3 ', 3],
  ])('%s は 1 以上 999 以下の整数として受け付けます', (raw, expected) => {
    expect(builder.parseRequiredInput(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(['0', '-1', '1000', '1.5', '', 'abc', '1e2'])('%s は拒否し、範囲の文言を返します', (raw) => {
    const result = builder.parseRequiredInput(raw);
    expect(result).toEqual({ ok: false, message: CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range });
  });
});

describe('フォームの値から API の要求を作る（validateDraft）', () => {
  const builder = new CampaignDraftBuilder();

  it('既定の値から作った下書きは、そのまま保存の要求になります（必要数は個別の形）', () => {
    const campaign = sampleCampaign();
    const draft = builder.draftFromCampaign(campaign);
    const check = builder.validateDraft(campaign, draft);
    expect(check.ok).toBe(true);
    if (!check.ok) {
      return;
    }
    expect(check.request.name).toBe(IN.campaignName);
    expect(check.request.requiredPerCell.mode).toBe('individual');
    if (check.request.requiredPerCell.mode === 'individual') {
      expect(Object.keys(check.request.requiredPerCell.values)).toHaveLength(8);
    }
    expect(check.request.acceptRule).toEqual(campaign.acceptRule);
  });

  it('受入条件の入力（%・MB・万画素）を、API の単位（比率・バイト・画素）に直します', () => {
    const campaign = sampleCampaign();
    const draft = {
      ...builder.draftFromCampaign(campaign),
      rule: { tolerancePercent: '0.5', minShortPx: '600', maxInputMegabytes: '4', maxPixelsTenThousand: '3000' },
    };
    const check = builder.validateDraft(campaign, draft);
    expect(check.ok).toBe(true);
    if (!check.ok) {
      return;
    }
    expect(check.request.acceptRule.tolerance).toBeCloseTo(0.005, 10);
    expect(check.request.acceptRule.minShortPx).toBe(600);
    expect(check.request.acceptRule.maxInputBytes).toBe(4 * 1024 * 1024);
    expect(check.request.acceptRule.maxPixels).toBe(30_000_000);
  });

  it('必要数が 0 のマスがあると、そのマスの欄に文言を付けて拒否します', () => {
    const campaign = sampleCampaign();
    const draft = builder.draftFromCampaign(campaign);
    const target = campaign.cells[0].cellId;
    const check = builder.validateDraft(campaign, { ...draft, requiredByCell: { ...draft.requiredByCell, [target]: '0' } });
    expect(check.ok).toBe(false);
    if (check.ok) {
      return;
    }
    expect(check.errors.cells[target]).toBe(CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range);
  });

  it('名称が空、または上限を超える長さのときは、名称の欄の文言を返します', () => {
    const campaign = sampleCampaign();
    const draft = builder.draftFromCampaign(campaign);
    const empty = builder.validateDraft(campaign, { ...draft, name: IN.blankName });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.errors.name).toBe(CAMPAIGN_ERROR_MESSAGES.NAME_EMPTY);
    }
    const tooLong = builder.validateDraft(campaign, { ...draft, name: IN.longUnit.repeat(CAMPAIGN_API_CONFIG.nameMaxChars + 1) });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) {
      expect(tooLong.errors.name).toBe(CAMPAIGN_API_ERROR_MESSAGES.name_too_long);
    }
  });

  it.each([
    ['tolerancePercent', '2'],
    ['tolerancePercent', '-1'],
    ['minShortPx', '801'],
    ['minShortPx', '0'],
    ['minShortPx', '800.5'],
    ['maxInputMegabytes', '6'],
    ['maxInputMegabytes', '0'],
    ['maxPixelsTenThousand', '4001'],
    ['maxPixelsTenThousand', 'abc'],
  ])('既定値の範囲を超える %s = %s は保存できません', (field, raw) => {
    const campaign = sampleCampaign();
    const draft = builder.draftFromCampaign(campaign);
    const check = builder.validateDraft(campaign, { ...draft, rule: { ...draft.rule, [field]: raw } });
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.errors.rule).not.toBeNull();
    }
  });

  it('既定値の上限は、RULE_DEFAULTS から作られます（5 MB・4,000 万画素・800 px・1%）', () => {
    expect(RULE_DEFAULTS.maxInputBytes).toBe(5 * 1024 * 1024);
    expect(RULE_DEFAULTS.maxInputPixels).toBe(40_000_000);
    expect(RULE_DEFAULTS.minShortSidePx).toBe(800);
    expect(RULE_DEFAULTS.aspectTolerance).toBe(0.01);
  });
});

describe('区分値の追加（buildAreaRequest）', () => {
  const builder = new CampaignDraftBuilder();

  it('区分値を正規化して、追加の要求を作ります', () => {
    const result = builder.buildAreaRequest('kochi', IN.areaPaddedSukumo, [IN.areaTokushima]);
    expect(result).toEqual({ ok: true, value: { areas: [{ prefecture: 'kochi', label: IN.areaSukumo }] } });
  });

  it('全角と半角の違いだけの重複は、重複として拒否します', () => {
    const result = builder.buildAreaRequest('tokushima', IN.areaWideAbc, [IN.areaAbc]);
    expect(result).toEqual({ ok: false, message: CAMPAIGN_API_ERROR_MESSAGES.area_duplicate });
  });

  it('空の区分値は、B1 の文言で拒否します', () => {
    const result = builder.buildAreaRequest('kochi', IN.areaBlank, []);
    expect(result).toEqual({ ok: false, message: CAMPAIGN_ERROR_MESSAGES.AREA_INVALID });
  });

  it('件数の上限に達しているときは、追加を拒否します', () => {
    const existing = Array.from({ length: CAMPAIGN_API_CONFIG.areasMax }, (_, index) => `${IN.areaGeneric}${index}`);
    const result = builder.buildAreaRequest('kochi', IN.areaNew, existing);
    expect(result).toEqual({ ok: false, message: CAMPAIGN_API_ERROR_MESSAGES.area_limit_exceeded });
  });
});

describe('API の文言の振り分け（fieldOfApiMessage）', () => {
  it('文言に応じて、名称・必要数・受入条件のどの項目の近くに出すかを返します', () => {
    expect(fieldOfApiMessage(CAMPAIGN_API_ERROR_MESSAGES.name_too_long)).toBe('name');
    expect(fieldOfApiMessage(CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range)).toBe('cells');
    expect(fieldOfApiMessage(CAMPAIGN_API_ERROR_MESSAGES.rule_limit_exceeded)).toBe('rule');
    expect(fieldOfApiMessage(IN.unknownApiMessage)).toBe('general');
  });
});

describe('キャンペーンの API（CampaignApi）', () => {
  interface Recorded {
    readonly input: string;
    readonly method: string;
    readonly body: string | undefined;
  }

  /** 呼び出しを記録し、用意した応答を返す偽の fetch。 */
  function fakeFetch(respond: (call: Recorded) => Response): { fetcher: typeof fetch; calls: Recorded[] } {
    const calls: Recorded[] = [];
    const fetcher = (async (input: string, init: RequestInit) => {
      const call = { input, method: init.method ?? 'GET', body: init.body as string | undefined };
      calls.push(call);
      return respond(call);
    }) as unknown as typeof fetch;
    return { fetcher, calls };
  }

  function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  it('キャンペーンが無いとき（404）は null を返します', async () => {
    const { fetcher } = fakeFetch(() => json(404, { code: 'campaign_not_found', message: CAMPAIGN_API_ERROR_MESSAGES.campaign_not_found }));
    const api = new CampaignApi(fetcher);
    await expect(api.getCampaign()).resolves.toBeNull();
  });

  it('テンプレートの読み込みは、templateId を POST で送ります', async () => {
    const campaign = sampleCampaign();
    const { fetcher, calls } = fakeFetch(() => json(201, campaign));
    const api = new CampaignApi(fetcher);
    const loaded = await api.loadTemplate();
    expect(loaded).toEqual(campaign);
    expect(calls[0].input).toBe('/api/campaign/template');
    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(calls[0].body ?? '{}')).toEqual({ templateId: CAMPAIGN_API_CONFIG.defaultTemplateId });
  });

  it('保存は PUT で送り、失敗の応答の文言をそのまま例外にします', async () => {
    const { fetcher, calls } = fakeFetch(() =>
      json(400, { code: 'invalid_request', message: CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range }),
    );
    const api = new CampaignApi(fetcher);
    const campaign = sampleCampaign();
    const draft = new CampaignDraftBuilder();
    const check = draft.validateDraft(campaign, draft.draftFromCampaign(campaign));
    if (!check.ok) {
      throw new Error('fixture must be valid');
    }
    const error = await api.updateCampaign(check.request).catch((caught: unknown) => caught);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].input).toBe('/api/campaign');
    expect(error).toMatchObject({ code: 'invalid_request', message: CAMPAIGN_API_ERROR_MESSAGES.required_out_of_range, status: 400 });
  });

  it('区分値の追加の重複（409）は、API の文言をそのまま例外にします', async () => {
    const { fetcher } = fakeFetch(() => json(409, { code: 'area_duplicate', message: CAMPAIGN_API_ERROR_MESSAGES.area_duplicate }));
    const api = new CampaignApi(fetcher);
    const error = await api
      .addArea({ areas: [{ prefecture: 'kochi', label: IN.areaKochi }] })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'area_duplicate', message: CAMPAIGN_API_ERROR_MESSAGES.area_duplicate, status: 409 });
  });
});

describe('応答の欠損は代わりの値で隠さず、明示的な例外にします', () => {
  const builder = new CampaignDraftBuilder();

  it('マスが存在しないエリアを指していると、例外になります', () => {
    const campaign = sampleCampaign();
    const broken: CampaignDetailView = {
      ...campaign,
      cells: campaign.cells.map((cell, index) => (index === 0 ? { ...cell, areaId: 'missing-area' } : cell)),
    };
    const draft = builder.draftFromCampaign(broken);
    expect(() => builder.validateDraft(broken, draft)).toThrow(CAMPAIGN_SETTINGS_STRINGS.campaignInconsistent);
  });

  it('マスが存在しない期間を指していると、例外になります', () => {
    const campaign = sampleCampaign();
    const broken: CampaignDetailView = {
      ...campaign,
      cells: campaign.cells.map((cell, index) => (index === 0 ? { ...cell, periodId: 'missing-period' } : cell)),
    };
    const draft = builder.draftFromCampaign(broken);
    expect(() => builder.validateDraft(broken, draft)).toThrow(CAMPAIGN_SETTINGS_STRINGS.campaignInconsistent);
  });
});

describe('保存前の検査の例外を文言にする（checkForSave）', () => {
  const builder = new CampaignDraftBuilder();

  it('応答に欠損があると、例外を投げず、整合の文言を返します', () => {
    const campaign = sampleCampaign();
    const broken: CampaignDetailView = {
      ...campaign,
      cells: campaign.cells.map((cell, index) => (index === 0 ? { ...cell, areaId: 'missing-area' } : cell)),
    };
    const result = builder.checkForSave(broken, builder.draftFromCampaign(broken));
    expect(result).toEqual({ kind: 'failed', message: CAMPAIGN_SETTINGS_STRINGS.campaignInconsistent });
  });

  it('下書きに必要数の欄がないと、代わりの値を使わず、整合の文言を返します', () => {
    const campaign = sampleCampaign();
    const draft = builder.draftFromCampaign(campaign);
    const target = campaign.cells[0].cellId;
    const { [target]: _removed, ...rest } = draft.requiredByCell;
    expect(() => builder.validateDraft(campaign, { ...draft, requiredByCell: rest })).toThrow(
      CAMPAIGN_SETTINGS_STRINGS.campaignInconsistent,
    );
    expect(builder.checkForSave(campaign, { ...draft, requiredByCell: rest })).toEqual({
      kind: 'failed',
      message: CAMPAIGN_SETTINGS_STRINGS.campaignInconsistent,
    });
  });

  it('正常なら検査の結果をそのまま返します', () => {
    const campaign = sampleCampaign();
    const draft = builder.draftFromCampaign(campaign);
    expect(builder.checkForSave(campaign, draft)).toEqual({ kind: 'checked', check: builder.validateDraft(campaign, draft) });
  });
});
