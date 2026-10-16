import { describe, expect, it } from 'vitest';
import { ApiClient, ApiError, type FetchLike } from '../../../src/frontend/lib/apiClient';
import { MineApi, MineViewBuilder, type MineCampaignLookup, type MineSubmissionsResponse, type MineSubmissionItemResponse } from '../../../src/frontend/lib/api/mineApi';
import { MINE_API_PATHS, MINE_STRINGS, MINE_SUBMIT_LINK } from '../../../src/config/strings/mine';
import { STATUS_LABELS, STATUS_NOTICES } from '../../../src/config/strings/status';
import { RETURN_REASON_LABELS } from '../../../src/config/strings/returnReasons';
import type { ReturnInfo } from '../../../src/core/api/contract';

const CELL_ID = 'cell-1';

const CAMPAIGN: MineCampaignLookup = {
  areas: [{ id: 'area-1', prefecture: 'tokushima', label: 'Naruto city' }],
  periods: [{ id: 'p-spring', label: 'Spring season', months: [3, 4, 5] }],
  cells: [{ cellId: CELL_ID, areaId: 'area-1', periodId: 'p-spring' }],
};

/** API の 1 件を作る。既定は確認待ち。 */
function item(overrides: Partial<MineSubmissionItemResponse> & Pick<MineSubmissionItemResponse, 'id'>): MineSubmissionItemResponse {
  return {
    cellId: CELL_ID,
    status: 'pending_review',
    createdAt: '2026-10-16T01:00:00.000Z',
    returnInfo: null,
    shotMonth: 4,
    spotName: 'Naruto coast',
    caption: 'Morning coast caption',
    overQuota: false,
    ...overrides,
  };
}

function returned(id: string, info: Partial<ReturnInfo> = {}): MineSubmissionItemResponse {
  return item({
    id,
    status: 'returned',
    returnInfo: { reasonCode: 'resolution', freeText: '', resubmittable: true, ...info },
  });
}

function responseOf(items: readonly MineSubmissionItemResponse[]): MineSubmissionsResponse {
  return { items };
}

describe('MineViewBuilder（自分の投稿の画面の表示の組み立て）', () => {
  const builder = new MineViewBuilder();
  const buildWith = (response: MineSubmissionsResponse) => builder.build(response, CAMPAIGN);

  it('cellId から、市町村（エリア）と季節（期間）の表示名を引きます', () => {
    const view = buildWith(responseOf([item({ id: 'a' })]));
    expect(view.items[0]?.areaLabel).toBe('Naruto city');
    expect(view.items[0]?.seasonLabel).toBe('Spring season');
  });

  it('cellId がキャンペーンに無いときは、代わりの値を作らず、引けない旨を明示します', () => {
    const view = buildWith(responseOf([item({ id: 'a', cellId: 'unknown-cell' })]));
    expect(view.items[0]?.areaLabel).toBeNull();
    expect(view.items[0]?.seasonLabel).toBeNull();
    expect(view.items[0]?.cellUnknownNotice).toBe(MINE_STRINGS.cellUnknown);
  });

  it('引けたときは、引けない旨の注記を付けません', () => {
    const view = buildWith(responseOf([item({ id: 'a' })]));
    expect(view.items[0]?.cellUnknownNotice).toBeNull();
  });

  it('投稿が無いときは、空の一覧として扱います', () => {
    const view = buildWith(responseOf([]));
    expect(view.items).toEqual([]);
  });

  it('API は古い順なので、表示は新しい順（API の逆順）にします', () => {
    const view = buildWith(responseOf([item({ id: 'old' }), item({ id: 'new' })]));
    expect(view.items.map((entry) => entry.id)).toEqual(['new', 'old']);
  });

  it('状態の文言は、確認待ち・採用（デモ）・差し戻しの status.ts の文言を使います', () => {
    const view = buildWith(
      responseOf([item({ id: 'a' }), item({ id: 'b', status: 'accepted' }), returned('c')]),
    );
    const labels = new Map(view.items.map((entry) => [entry.id, entry.statusLabel]));
    expect(labels.get('a')).toBe(STATUS_LABELS.pending_review);
    expect(labels.get('b')).toBe(STATUS_LABELS.accepted);
    expect(labels.get('c')).toBe(STATUS_LABELS.returned);
  });

  it('採用（デモ）の項目だけに、実際の買取や権利の移転は行わない旨の注記を付けます', () => {
    const view = buildWith(responseOf([item({ id: 'a' }), item({ id: 'b', status: 'accepted' })]));
    const notices = new Map(view.items.map((entry) => [entry.id, entry.acceptedNotice]));
    expect(notices.get('a')).toBeNull();
    expect(notices.get('b')).toBe(STATUS_NOTICES.noRealTransaction);
  });

  it('差し戻しの項目には、区分の文言と自由記述（そのままの文字列）を入れます', () => {
    const freeText = '<script>alert(1)</script>';
    const view = buildWith(
      responseOf([returned('a', { reasonCode: 'other', freeText, resubmittable: true })]),
    );
    const entry = view.items[0];
    expect(entry?.returnView).not.toBeNull();
    expect(entry?.returnView?.reasonLabel).toBe(RETURN_REASON_LABELS.other);
    expect(entry?.returnView?.freeText).toBe(freeText);
  });

  it('再投稿できる差し戻しには、resubmit の query つきのリンクを入れます', () => {
    const view = buildWith(responseOf([returned('abc-123', { resubmittable: true })]));
    const returnView = view.items[0]?.returnView;
    expect(returnView?.resubmittable).toBe(true);
    expect(returnView?.resubmitHref).toBe(`${MINE_SUBMIT_LINK.path}?${MINE_SUBMIT_LINK.resubmitParam}=abc-123`);
  });

  it('再投稿できない差し戻しには、リンクを入れず、その旨を文字で示します', () => {
    const view = buildWith(responseOf([returned('a', { resubmittable: false })]));
    const returnView = view.items[0]?.returnView;
    expect(returnView?.resubmittable).toBe(false);
    expect(returnView?.resubmitHref).toBeNull();
    expect(returnView?.resubmitNotice).toBe(MINE_STRINGS.resubmitUnavailable);
  });

  it('差し戻し以外の項目には、差し戻しの内容を入れません', () => {
    const view = buildWith(responseOf([item({ id: 'a' }), item({ id: 'b', status: 'accepted' })]));
    expect(view.items.every((entry) => entry.returnView === null)).toBe(true);
  });

  it('画像は、自分の投稿の画像の経路（/api/submissions/:id/image）を指します', () => {
    const view = buildWith(responseOf([item({ id: 'abc-123' })]));
    expect(view.items[0]?.imageSrc).toBe('/api/submissions/abc-123/image');
  });

  it('撮影月と地点名と説明文を、そのまま表示用に渡します（空の値は空のまま）', () => {
    const view = buildWith(responseOf([item({ id: 'a', shotMonth: 11, spotName: '', caption: '' })]));
    const entry = view.items[0];
    expect(entry?.shotMonthLabel).toBe(MINE_STRINGS.shotMonthLabel(11));
    expect(entry?.spotName).toBe('');
    expect(entry?.caption).toBe('');
  });

  it('checking の投稿は一覧に含まれないため、受け取ったら対応が取れないものとして例外にします', () => {
    expect(() => buildWith(responseOf([item({ id: 'a', status: 'checking' })]))).toThrow(
      MINE_STRINGS.viewMismatch,
    );
  });

  it('差し戻しなのに差し戻しの内容が無い応答は、代わりの値を作らず例外にします', () => {
    expect(() => buildWith(responseOf([item({ id: 'a', status: 'returned', returnInfo: null })]))).toThrow(
      MINE_STRINGS.viewMismatch,
    );
  });

  it('差し戻し以外なのに差し戻しの内容がある応答は、例外にします', () => {
    expect(() =>
      buildWith(responseOf([item({ id: 'a', status: 'accepted', returnInfo: { reasonCode: 'ratio', freeText: '', resubmittable: true } })])),
    ).toThrow(MINE_STRINGS.viewMismatch);
  });
});

describe('MineApi（自分の投稿の API の読み込み）', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  it('自分の投稿とキャンペーンを同一オリジンで呼び、市町村・季節つきの表示に組み立てます', async () => {
    const calls: { input: string; method: string; credentials: string }[] = [];
    const fetcher: FetchLike = async (input, init) => {
      calls.push({ input, method: init.method, credentials: init.credentials });
      return input === MINE_API_PATHS.campaign ? jsonResponse(CAMPAIGN) : jsonResponse(responseOf([item({ id: 'a' })]));
    };
    const view = await new MineApi(new ApiClient(fetcher)).load();
    expect(calls).toEqual([
      { input: MINE_API_PATHS.mine, method: 'GET', credentials: 'same-origin' },
      { input: MINE_API_PATHS.campaign, method: 'GET', credentials: 'same-origin' },
    ]);
    expect(view.items.map((entry) => entry.id)).toEqual(['a']);
    expect(view.items[0]?.areaLabel).toBe('Naruto city');
    expect(view.items[0]?.seasonLabel).toBe('Spring season');
  });

  it('投稿の取得の失敗（500）は、代わりの一覧を作らず例外として外に出します', async () => {
    const fetcher: FetchLike = async () => jsonResponse({ code: 'internal_error', message: 'x' }, 500);
    await expect(new MineApi(new ApiClient(fetcher)).load()).rejects.toBeInstanceOf(ApiError);
  });

  it('キャンペーンの取得の失敗は、代わりの値を作らず例外として外に出します', async () => {
    const fetcher: FetchLike = async (input) =>
      input === MINE_API_PATHS.campaign
        ? jsonResponse({ code: 'campaign_not_found', message: 'x' }, 404)
        : jsonResponse(responseOf([item({ id: 'a' })]));
    await expect(new MineApi(new ApiClient(fetcher)).load()).rejects.toBeInstanceOf(ApiError);
  });
});
