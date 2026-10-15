/// <reference types="vite/client" />
// 注意：Edit scope の test/workers/campaign.test.ts は、workers プロジェクトの対象（*.worker.test.ts）に合わせて改名しました。
import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import templateRaw from '../../data/templates/shikoku-landscape.json?raw';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { RULE_DEFAULTS } from '../../src/config/defaults';
import { LIMITS } from '../../src/config/limits';
import { CAMPAIGN_ERROR_MESSAGES } from '../../src/config/strings/campaign';
import { CAMPAIGN_API_ERROR_MESSAGES } from '../../src/config/strings/campaignApi';
import { API_ERROR_MESSAGES } from '../../src/config/strings/apiErrors';
import { TemplateSeedBuilder, type TemplateDefinition } from '../../src/worker/db/templateSeed';
import { sha256Hex } from '../../src/worker/security/sha256';
import { DEVELOPMENT_WEB_ORIGIN, TEST_BASE_URL } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';

type TableName = 'campaign' | 'area' | 'period' | 'cell' | 'accept_rule';

interface Session {
  readonly cookie: string;
  readonly hash: string;
}

/** テストごとに別の IP を使う（レート制限の状態を分けるため）。 */
function uniqueIp(): string {
  return crypto.randomUUID();
}

/** テンプレートを D1 に投入する（システム用 ID の行）。何度実行しても行は重複しない。 */
async function seedTemplate(): Promise<void> {
  const template = JSON.parse(templateRaw) as TemplateDefinition;
  const statements = new TemplateSeedBuilder(template).buildStatements();
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement.sql).bind(...statement.binds)));
}

/** 新しいセッションを作り、Cookie の値とハッシュを返す。 */
async function newSession(): Promise<Session> {
  const response = await SELF.fetch(`${TEST_BASE_URL}/api/session`, { headers: { 'cf-connecting-ip': uniqueIp() } });
  const token = response.headers.get('set-cookie')?.match(/^csid=([^;]+)/)?.[1];
  if (token === undefined) {
    throw new Error('csid was not issued.');
  }
  return { cookie: `csid=${token}`, hash: await sha256Hex(token) };
}

async function call(method: string, path: string, session: Session | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'cf-connecting-ip': uniqueIp() };
  if (session !== null) {
    headers.cookie = session.cookie;
  }
  if (method !== 'GET') {
    headers.origin = DEVELOPMENT_WEB_ORIGIN;
    headers['content-type'] = 'application/json';
  }
  return SELF.fetch(`${TEST_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function countRows(table: TableName, sessionHash: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`).bind(sessionHash).first<{ n: number }>();
  return row?.n ?? -1;
}

/** 全角の英字に変換する（表記だけが違う値を作るため。テストのデータに日本語を直書きしない）。 */
function toFullWidth(text: string): string {
  return text.replace(/[A-Za-z0-9]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0xfee0));
}

interface CampaignBody {
  id: string;
  name: string;
  areas: { id: string; prefecture: string; label: string }[];
  periods: { id: string; label: string; months: number[] }[];
  cells: { cellId: string; areaId: string; periodId: string; required: number }[];
  acceptRule: { ratio: number; tolerance: number; minShortPx: number; [key: string]: unknown };
}

async function readCampaign(session: Session): Promise<CampaignBody> {
  const response = await call('GET', '/api/campaign', session);
  expect(response.status).toBe(200);
  return (await response.json()) as CampaignBody;
}

async function loadTemplate(session: Session): Promise<CampaignBody> {
  const response = await call('POST', '/api/campaign/template', session, { templateId: 'shikoku-landscape' });
  expect([200, 201]).toContain(response.status);
  return (await response.json()) as CampaignBody;
}

describe('テンプレートの読み込み（POST /api/campaign/template）', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('自分のセッションに、キャンペーン 1・エリア 21・期間 4・マス 84・受入条件 1 の行を作り、201 を返します', async () => {
    const session = await newSession();
    const response = await call('POST', '/api/campaign/template', session, { templateId: 'shikoku-landscape' });
    expect(response.status).toBe(201);
    expect(await countRows('campaign', session.hash)).toBe(1);
    expect(await countRows('area', session.hash)).toBe(21);
    expect(await countRows('period', session.hash)).toBe(4);
    expect(await countRows('cell', session.hash)).toBe(84);
    expect(await countRows('accept_rule', session.hash)).toBe(1);
  });

  it('2 回目は行を増やさず、200 で既存のキャンペーンを返します', async () => {
    const session = await newSession();
    const first = await loadTemplate(session);
    const response = await call('POST', '/api/campaign/template', session, { templateId: 'shikoku-landscape' });
    expect(response.status).toBe(200);
    const second = (await response.json()) as CampaignBody;
    expect(second.id).toBe(first.id);
    expect(await countRows('campaign', session.hash)).toBe(1);
    expect(await countRows('cell', session.hash)).toBe(84);
  });

  it('複製した行は、システム用 ID の行とは別の ID を持ちます（利用者のクエリにシステム用の行が出ません）', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    expect(campaign.id).not.toBe('shikoku-landscape');
    expect(campaign.areas.every((area) => area.id.startsWith(`${campaign.id}:`))).toBe(true);
    expect(campaign.cells.every((cell) => cell.required === 2)).toBe(true);
  });

  it('同じ template の要求を、別のセッションから行うと、それぞれ別の行になります', async () => {
    const a = await newSession();
    const b = await newSession();
    const campaignA = await loadTemplate(a);
    const campaignB = await loadTemplate(b);
    expect(campaignB.id).not.toBe(campaignA.id);
    expect(await countRows('cell', b.hash)).toBe(84);
  });
});

describe('キャンペーンの取得（GET /api/campaign）', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('キャンペーンが無ければ 404 と campaign_not_found を返します', async () => {
    const session = await newSession();
    const response = await call('GET', '/api/campaign', session);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('campaign_not_found');
    expect(body.message).toBe(CAMPAIGN_API_ERROR_MESSAGES.campaign_not_found);
  });

  it('読み込み後は、名称・エリア 21・期間 4・マス 84（必要数 2）・受入条件を返します', async () => {
    const session = await newSession();
    await loadTemplate(session);
    const campaign = await readCampaign(session);
    expect(campaign.name.length).toBeGreaterThan(0);
    expect(campaign.areas).toHaveLength(21);
    expect(campaign.periods).toHaveLength(4);
    expect(campaign.cells).toHaveLength(84);
    expect(campaign.acceptRule.ratio).toBeCloseTo(4 / 3);
  });

  it('GET /api/session の hasCampaign は、読み込み後に true になります', async () => {
    const session = await newSession();
    await loadTemplate(session);
    const response = await call('GET', '/api/session', session);
    expect(await response.json()).toEqual({ hasSession: true, hasCampaign: true });
  });
});

describe('キャンペーンの編集（PUT /api/campaign）', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('名称と一律の必要数を更新すると、全マスの必要数が変わります', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    const response = await call('PUT', '/api/campaign', session, {
      name: 'Demo Campaign',
      requiredPerCell: { mode: 'uniform', value: 3 },
      acceptRule: campaign.acceptRule,
    });
    expect(response.status).toBe(200);
    const updated = await readCampaign(session);
    expect(updated.name).toBe('Demo Campaign');
    expect(updated.cells.every((cell) => cell.required === 3)).toBe(true);
  });

  it('個別の必要数は、指定したマスだけに反映されます（指定のないマスは、全マスの指定が必要です）', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    const values: Record<string, number> = {};
    for (const cell of campaign.cells) {
      values[cell.cellId] = cell.cellId === campaign.cells[0].cellId ? 5 : cell.required;
    }
    const response = await call('PUT', '/api/campaign', session, {
      name: campaign.name,
      requiredPerCell: { mode: 'individual', values },
      acceptRule: campaign.acceptRule,
    });
    expect(response.status).toBe(200);
    const updated = await readCampaign(session);
    expect(updated.cells[0].required).toBe(5);
    expect(updated.cells[1].required).toBe(2);
  });

  it('必要数が 0 のときは 400（invalid_request）を返し、値は変わりません', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    const response = await call('PUT', '/api/campaign', session, {
      name: campaign.name,
      requiredPerCell: { mode: 'uniform', value: 0 },
      acceptRule: campaign.acceptRule,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; message: string };
    expect(body.code).toBe('invalid_request');
    expect(body.message).toBe(CAMPAIGN_ERROR_MESSAGES.REQUIRED_INVALID);
    const unchanged = await readCampaign(session);
    expect(unchanged.cells.every((cell) => cell.required === 2)).toBe(true);
  });

  it('名称が空、または上限を超えるときは 400 を返します', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    const empty = await call('PUT', '/api/campaign', session, {
      name: '   ',
      requiredPerCell: { mode: 'uniform', value: 2 },
      acceptRule: campaign.acceptRule,
    });
    expect(empty.status).toBe(400);
    const tooLong = await call('PUT', '/api/campaign', session, {
      name: 'A'.repeat(CAMPAIGN_API_CONFIG.nameMaxChars + 1),
      requiredPerCell: { mode: 'uniform', value: 2 },
      acceptRule: campaign.acceptRule,
    });
    expect(tooLong.status).toBe(400);
    expect(((await tooLong.json()) as { message: string }).message).toBe(API_ERROR_MESSAGES.invalid_request);
  });

  it('受入条件を更新できます（最小短辺）', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    const response = await call('PUT', '/api/campaign', session, {
      name: campaign.name,
      requiredPerCell: { mode: 'uniform', value: 2 },
      acceptRule: { ...campaign.acceptRule, minShortPx: campaign.acceptRule.minShortPx + 100 },
    });
    expect(response.status).toBe(200);
    const updated = await readCampaign(session);
    expect(updated.acceptRule.minShortPx).toBe(campaign.acceptRule.minShortPx + 100);
  });

  it('受入条件の maxInputBytes と maxPixels は、既定値（requirements 3.0）を超えると 400 を返し、値は変わりません', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    const base = { name: campaign.name, requiredPerCell: { mode: 'uniform', value: 2 } };
    const overBytes = await call('PUT', '/api/campaign', session, {
      ...base,
      acceptRule: { ...campaign.acceptRule, maxInputBytes: RULE_DEFAULTS.maxInputBytes + 1 },
    });
    expect(overBytes.status).toBe(400);
    expect(((await overBytes.json()) as { message: string }).message).toBe(CAMPAIGN_API_ERROR_MESSAGES.rule_limit_exceeded);
    const overPixels = await call('PUT', '/api/campaign', session, {
      ...base,
      acceptRule: { ...campaign.acceptRule, maxPixels: RULE_DEFAULTS.maxInputPixels + 1 },
    });
    expect(overPixels.status).toBe(400);
    const after = await readCampaign(session);
    expect(after.acceptRule.maxInputBytes).toBe(RULE_DEFAULTS.maxInputBytes);
    expect(after.acceptRule.maxPixels).toBe(RULE_DEFAULTS.maxInputPixels);
  });

  it('受入条件の maxInputBytes と maxPixels は、既定値以下なら更新できます', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    const response = await call('PUT', '/api/campaign', session, {
      name: campaign.name,
      requiredPerCell: { mode: 'uniform', value: 2 },
      acceptRule: { ...campaign.acceptRule, maxInputBytes: RULE_DEFAULTS.maxInputBytes, maxPixels: RULE_DEFAULTS.maxInputPixels - 1 },
    });
    expect(response.status).toBe(200);
  });

  it('必要数が上限（requiredMax）を超える、または整数でないときは 400 を返します', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    for (const value of [CAMPAIGN_API_CONFIG.requiredMax + 1, 1.5]) {
      const response = await call('PUT', '/api/campaign', session, {
        name: campaign.name,
        requiredPerCell: { mode: 'uniform', value },
        acceptRule: campaign.acceptRule,
      });
      expect(response.status).toBe(400);
    }
    const individual: Record<string, number> = {};
    for (const cell of campaign.cells) {
      individual[cell.cellId] = 2;
    }
    individual[campaign.cells[0].cellId] = CAMPAIGN_API_CONFIG.requiredMax + 1;
    const over = await call('PUT', '/api/campaign', session, {
      name: campaign.name,
      requiredPerCell: { mode: 'individual', values: individual },
      acceptRule: campaign.acceptRule,
    });
    expect(over.status).toBe(400);
    const ok = await call('PUT', '/api/campaign', session, {
      name: campaign.name,
      requiredPerCell: { mode: 'uniform', value: CAMPAIGN_API_CONFIG.requiredMax },
      acceptRule: campaign.acceptRule,
    });
    expect(ok.status).toBe(200);
  });

  it('名称に制御文字・ゼロ幅の文字・双方向の制御文字があると 400 を返します', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    for (const bad of ['A\u0007B', 'A\u200BB', 'A\u202EB', 'A\u2066B']) {
      const response = await call('PUT', '/api/campaign', session, {
        name: bad,
        requiredPerCell: { mode: 'uniform', value: 2 },
        acceptRule: campaign.acceptRule,
      });
      expect(response.status).toBe(400);
      expect(((await response.json()) as { message: string }).message).toBe(CAMPAIGN_ERROR_MESSAGES.NAME_INVALID);
    }
    expect((await readCampaign(session)).name).toBe(campaign.name);
  });

  it('個別の必要数に、キャンペーンにないマスの ID があると 400 を返します', async () => {
    const session = await newSession();
    const campaign = await loadTemplate(session);
    const values: Record<string, number> = { 'no-such-cell': 2 };
    for (const cell of campaign.cells) {
      values[cell.cellId] = 2;
    }
    const response = await call('PUT', '/api/campaign', session, {
      name: campaign.name,
      requiredPerCell: { mode: 'individual', values },
      acceptRule: campaign.acceptRule,
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toBe(CAMPAIGN_ERROR_MESSAGES.REQUIRED_UNKNOWN_CELL);
  });
});

describe('区分値の追加（POST /api/campaign/areas）', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('区分値を 1 件追加すると、期間の数（4）だけマスが増え、既定の必要数になります', async () => {
    const session = await newSession();
    await loadTemplate(session);
    const response = await call('POST', '/api/campaign/areas', session, {
      areas: [{ prefecture: 'kochi', label: 'Test Area' }],
    });
    expect(response.status).toBe(201);
    const campaign = await readCampaign(session);
    expect(campaign.areas).toHaveLength(22);
    expect(campaign.cells).toHaveLength(88);
    const added = campaign.cells.filter((cell) => cell.areaId === campaign.areas[21].id);
    expect(added).toHaveLength(4);
    expect(added.every((cell) => cell.required === CAMPAIGN_API_CONFIG.addedAreaRequiredPerCell)).toBe(true);
  });

  it('表記だけが違う（全角と半角）区分値は、重複として 409（area_duplicate）を返します', async () => {
    const session = await newSession();
    await loadTemplate(session);
    const first = await call('POST', '/api/campaign/areas', session, { areas: [{ prefecture: 'kochi', label: 'Test Area' }] });
    expect(first.status).toBe(201);
    const second = await call('POST', '/api/campaign/areas', session, { areas: [{ prefecture: 'kochi', label: toFullWidth('Test Area') }] });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { code: string; message: string };
    expect(body.code).toBe('area_duplicate');
    expect(body.message).toBe(CAMPAIGN_API_ERROR_MESSAGES.area_duplicate);
    expect(await countRows('area', session.hash)).toBe(22);
  });

  it('区分値が上限を超えると 400 を返します', async () => {
    const session = await newSession();
    await loadTemplate(session);
    const response = await call('POST', '/api/campaign/areas', session, {
      areas: [{ prefecture: 'kochi', label: 'A'.repeat(LIMITS.areaLabelMaxChars + 1) }],
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toBe(CAMPAIGN_ERROR_MESSAGES.AREA_TOO_LONG);
  });

  it('区分値の件数が上限（areasMax）に達すると、追加は 400 を返し、行は増えません', async () => {
    const session = await newSession();
    await loadTemplate(session);
    const room = CAMPAIGN_API_CONFIG.areasMax - 21;
    for (let index = 0; index < room; index += 1) {
      const response = await call('POST', '/api/campaign/areas', session, {
        areas: [{ prefecture: 'kochi', label: `Extra Area ${index}` }],
      });
      expect(response.status).toBe(201);
    }
    const over = await call('POST', '/api/campaign/areas', session, { areas: [{ prefecture: 'kochi', label: 'One Too Many' }] });
    expect(over.status).toBe(400);
    expect(((await over.json()) as { message: string }).message).toBe(CAMPAIGN_API_ERROR_MESSAGES.area_limit_exceeded);
    expect(await countRows('area', session.hash)).toBe(CAMPAIGN_API_CONFIG.areasMax);
  }, 60_000);

  it('都道府県の値が正しくないとき、または 1 件でないときは 400 を返します', async () => {
    const session = await newSession();
    await loadTemplate(session);
    const badPrefecture = await call('POST', '/api/campaign/areas', session, { areas: [{ prefecture: 'osaka', label: 'Test Area' }] });
    expect(badPrefecture.status).toBe(400);
    const none = await call('POST', '/api/campaign/areas', session, { areas: [] });
    expect(none.status).toBe(400);
  });
});

describe('セッションの隔離（requirements 2.3・CLAUDE.md 8）', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await seedTemplate();
  });

  it('別のセッション B は、A のキャンペーンを取得・編集・追加できません（すべて 404）', async () => {
    const a = await newSession();
    const b = await newSession();
    await loadTemplate(a);
    expect((await call('GET', '/api/campaign', b)).status).toBe(404);
    expect((await call('GET', '/api/coverage', b)).status).toBe(404);
    const put = await call('PUT', '/api/campaign', b, {
      name: 'Other',
      requiredPerCell: { mode: 'uniform', value: 9 },
      acceptRule: (await readCampaign(a)).acceptRule,
    });
    expect(put.status).toBe(404);
    const add = await call('POST', '/api/campaign/areas', b, { areas: [{ prefecture: 'kochi', label: 'Test Area' }] });
    expect(add.status).toBe(404);
  });

  it('B の編集は A の名称や必要数を変えません', async () => {
    const a = await newSession();
    const b = await newSession();
    const campaignA = await loadTemplate(a);
    await loadTemplate(b);
    await call('PUT', '/api/campaign', b, {
      name: 'Only B',
      requiredPerCell: { mode: 'uniform', value: 7 },
      acceptRule: campaignA.acceptRule,
    });
    const afterA = await readCampaign(a);
    expect(afterA.name).toBe(campaignA.name);
    expect(afterA.cells.every((cell) => cell.required === 2)).toBe(true);
  });
});

