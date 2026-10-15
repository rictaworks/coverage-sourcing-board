import { describe, expect, it } from 'vitest';
import { BROWSER_CHECK_ITEMS } from '../../../src/config/submission';
import { SUBMISSION_FORM_FIELDS } from '../../../src/core/api/contract';
import type { PreparedImage } from '../../../src/frontend/lib/image/preparedImage';
import type { BrowserCheckResult } from '../../../src/frontend/lib/submit/runChecks';
import {
  SubmissionFormBuilder,
  SubmitApi,
  SubmitApiError,
  type SubmitPayload,
} from '../../../src/frontend/lib/submit/submitApi';

function prepared(): PreparedImage {
  return {
    saved: { blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), width: 1600, height: 1200, bytes: 4 },
    classifyImage: { blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), width: 512, height: 384 },
    features: {
      width: 1600,
      height: 1200,
      format: 'jpeg',
      quality: 90,
      blurScore: 500,
      meanLuma: 120,
      saturation: 0.4,
      contrast: 0.4,
      phash: '0123456789abcdef',
    },
    exif: { shotAt: new Date('2026-07-15T01:30:00Z'), offsetMinutes: 540, hasGps: true, hasDeviceInfo: true },
    crop: null,
  };
}

/** 10 項目を 1 件ずつ含む判定結果（ブラウザが送る形）。 */
function browserChecks(): BrowserCheckResult[] {
  return BROWSER_CHECK_ITEMS.map((item) => ({ item, verdict: 'pass', reasonCode: 'passed' }));
}

function payload(overrides: Partial<SubmitPayload> = {}): SubmitPayload {
  return {
    prepared: prepared(),
    cellId: 'cell-1',
    shotMonth: 7,
    spotName: '  spot  ',
    caption: 'evening sky',
    checks: browserChecks(),
    declaredOriginal: true,
    consent: true,
    honeypot: '',
    resubmittedFrom: null,
    ...overrides,
  };
}

describe('SubmissionFormBuilder（multipart の組み立て）', () => {
  const builder = new SubmissionFormBuilder();

  it('image・thumb・meta・ハニーポットの 4 つだけを含む', () => {
    const form = builder.build(payload());
    const names: string[] = [];
    form.forEach((_value, key) => names.push(key));
    names.sort();
    expect(names).toEqual([SUBMISSION_FORM_FIELDS.honeypot, SUBMISSION_FORM_FIELDS.image, SUBMISSION_FORM_FIELDS.meta, SUBMISSION_FORM_FIELDS.thumb].sort());
  });

  it('meta に位置情報と機種情報を含めない（EXIF の値を送らない）', () => {
    const form = builder.build(payload());
    const meta = JSON.parse(String(form.get(SUBMISSION_FORM_FIELDS.meta))) as Record<string, unknown>;
    const text = JSON.stringify(meta);
    for (const forbidden of ['lat', 'lng', 'latitude', 'longitude', 'gps', 'make', 'model', 'exif', 'shotAt', 'device']) {
      expect(text.toLowerCase()).not.toContain(forbidden);
    }
    expect(meta).toMatchObject({
      cellId: 'cell-1',
      shotMonth: 7,
      spotName: 'spot',
      caption: 'evening sky',
      phash: '0123456789abcdef',
      declaredOriginal: true,
      consent: true,
      resubmittedFrom: null,
    });
  });

  it('判定結果は 10 項目を 1 件ずつ含む', () => {
    const form = builder.build(payload());
    const meta = JSON.parse(String(form.get(SUBMISSION_FORM_FIELDS.meta))) as { checks: { item: string }[] };
    expect(meta.checks.map((check) => check.item).sort()).toEqual([...BROWSER_CHECK_ITEMS].sort());
  });

  it('再投稿の元の ID を付けられる', () => {
    const form = builder.build(payload({ resubmittedFrom: 'submission-9' }));
    const meta = JSON.parse(String(form.get(SUBMISSION_FORM_FIELDS.meta))) as { resubmittedFrom: string };
    expect(meta.resubmittedFrom).toBe('submission-9');
  });

  it('ハニーポットの値をそのまま送る（人は空のまま送る）', () => {
    const form = builder.build(payload({ honeypot: 'bot' }));
    expect(form.get(SUBMISSION_FORM_FIELDS.honeypot)).toBe('bot');
  });
});

/** 応答を返す偽の fetch。呼び出しの記録も残す。 */
function fakeFetch(status: number, body: unknown): { fetcher: typeof fetch; calls: { url: string; method: string }[] } {
  const calls: { url: string; method: string }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: String(init?.method) });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetcher, calls };
}

describe('SubmitApi（送信）', () => {
  it('201 の応答から、投稿の ID・状態・判定結果・被写体の推定を読む', async () => {
    const { fetcher, calls } = fakeFetch(201, {
      id: 'sub-1',
      status: 'pending_review',
      checks: [{ item: 'focus', verdict: 'pass', reasonCode: 'passed' }],
      subject: { status: 'none' },
    });
    const result = await new SubmitApi(fetcher).submit(payload());
    expect(result).toMatchObject({ id: 'sub-1', status: 'pending_review', subject: { status: 'none' } });
    expect(calls).toEqual([{ url: '/api/submissions', method: 'POST' }]);
  });

  it('submission_rejected は、理由の一覧つきのエラーとして返す', async () => {
    const { fetcher } = fakeFetch(400, {
      code: 'submission_rejected',
      message: 'x',
      reasons: [{ item: 'duplicate_image', reasonCode: 'duplicate_image_reject' }],
    });
    const error = await new SubmitApi(fetcher).submit(payload()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SubmitApiError);
    expect((error as SubmitApiError).code).toBe('submission_rejected');
    expect((error as SubmitApiError).reasons).toEqual([{ item: 'duplicate_image', reasonCode: 'duplicate_image_reject' }]);
  });

  it('上限の応答（429 daily_limit_reached）は、コードを保ったまま返す', async () => {
    const { fetcher } = fakeFetch(429, { code: 'daily_limit_reached', message: 'x' });
    const error = await new SubmitApi(fetcher).submit(payload()).catch((caught: unknown) => caught);
    expect((error as SubmitApiError).code).toBe('daily_limit_reached');
    expect((error as SubmitApiError).status).toBe(429);
  });

  it('本文の形式が合わない失敗は、代わりの値を作らず、形式の誤りとして扱う', async () => {
    const { fetcher } = fakeFetch(500, 'not json');
    const error = await new SubmitApi(fetcher).submit(payload()).catch((caught: unknown) => caught);
    expect((error as SubmitApiError).code).toBe('malformed_response');
  });
});
