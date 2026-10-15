/// <reference types="vite/client" />
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import templateRaw from '../../data/templates/shikoku-landscape.json?raw';
import { CAMPAIGN_API_CONFIG } from '../../src/config/campaignApi';
import { SUBMISSION_DEV_MESSAGES } from '../../src/config/strings/submission';
import { BROWSER_CHECK_ITEMS, SUBMISSION_CONFIG } from '../../src/config/submission';
import { WorkerApp } from '../../src/worker';
import { TemplateSeedBuilder, type TemplateDefinition } from '../../src/worker/db/templateSeed';
import { SubmissionRepo } from '../../src/worker/repo/submissionRepo';
import { DEVELOPMENT_WEB_ORIGIN, TEST_BASE_URL, WORKER_TEST_TIMEOUT_MS } from '../fixtures/workerRequests';
import { applyMigrations } from '../helpers/d1Migrations';
import { app1Exif, buildJpeg } from '../helpers/jpegBytes';

interface TraceLine {
  readonly name: string;
  readonly fields: Record<string, unknown>;
}

/** 秘密にすべき入力の値（トレースに出てはならない）。 */
const SECRET_CAPTION = 'SECRET-CAPTION-TEXT';
const SECRET_SPOT = 'SECRET-SPOT-NAME';

function uniqueIp(): string {
  return crypto.randomUUID();
}

function randomHash(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

class Harness {
  readonly lines: string[] = [];
  private readonly app = new WorkerApp((line) => this.lines.push(line));
  cookie = '';

  async start(): Promise<string> {
    const response = await this.app.fetch(new Request(`${TEST_BASE_URL}/api/session`, { headers: { 'cf-connecting-ip': uniqueIp() } }), env);
    this.cookie = `csid=${response.headers.get('set-cookie')?.match(/^csid=([^;]+)/)?.[1] ?? ''}`;
    const campaign = await this.app.fetch(
      new Request(`${TEST_BASE_URL}/api/campaign/template`, {
        method: 'POST',
        headers: { cookie: this.cookie, origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': uniqueIp(), 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: CAMPAIGN_API_CONFIG.defaultTemplateId }),
      }),
      env,
    );
    const body = (await campaign.json()) as { cells: { cellId: string }[] };
    return body.cells[0].cellId;
  }

  async post(cellId: string, image: Uint8Array, metaOverrides: Record<string, unknown> = {}, honeypot?: string): Promise<Response> {
    const form = new FormData();
    if (honeypot !== undefined) {
      form.set('website_url', honeypot);
    }
    form.set('image', new File([Uint8Array.from(image)], 'image.jpg', { type: 'image/jpeg' }));
    form.set('thumb', new File([Uint8Array.from(buildJpeg({ width: 512, height: 384 }))], 'thumb.jpg', { type: 'image/jpeg' }));
    form.set(
      'meta',
      JSON.stringify({
        cellId,
        shotMonth: 4,
        spotName: SECRET_SPOT,
        caption: SECRET_CAPTION,
        declaredOriginal: true,
        consent: true,
        phash: randomHash(),
        checks: BROWSER_CHECK_ITEMS.map((item) => ({ item, verdict: 'pass', reasonCode: 'passed' })),
        ...metaOverrides,
      }),
    );
    return this.app.fetch(
      new Request(`${TEST_BASE_URL}/api/submissions`, {
        method: 'POST',
        headers: { cookie: this.cookie, origin: DEVELOPMENT_WEB_ORIGIN, 'cf-connecting-ip': uniqueIp() },
        body: form,
      }),
      env,
    );
  }

  rejections(): TraceLine[] {
    return this.lines.map((line) => JSON.parse(line) as TraceLine).filter((line) => line.name === 'submission.rejected');
  }
}

describe('投稿の拒否のトレース（個人情報を含めない）', { timeout: WORKER_TEST_TIMEOUT_MS }, () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    const template = JSON.parse(templateRaw) as TemplateDefinition;
    const statements = new TemplateSeedBuilder(template).buildStatements();
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement.sql).bind(...statement.binds)));
  });

  it('EXIF つきの拒否で、拒否の種類だけを残し、入力の値は含めません', async () => {
    const harness = new Harness();
    const cellId = await harness.start();
    const response = await harness.post(cellId, buildJpeg({ width: 1600, height: 1200, extraSegments: [app1Exif()] }));
    expect(response.status).toBe(400);
    const rejections = harness.rejections();
    expect(rejections).toHaveLength(1);
    expect(rejections[0].fields).toMatchObject({ failureCode: 'metadata_not_allowed', status: 400 });
    const all = harness.lines.join('\n');
    for (const secret of [SECRET_CAPTION, SECRET_SPOT, harness.cookie, harness.cookie.slice(5)]) {
      expect(all).not.toContain(secret);
    }
  });

  it('理由つきの不合格は、理由のコードごとに 1 件ずつ残します', async () => {
    const harness = new Harness();
    const cellId = await harness.start();
    const response = await harness.post(cellId, buildJpeg({ width: 1200, height: 1600 }));
    expect(response.status).toBe(400);
    const rejections = harness.rejections();
    expect(rejections.some((line) => line.fields.reasonCode === 'orientation_portrait' && line.fields.failureCode === 'submission_rejected')).toBe(true);
  });

  it('ハニーポットの拒否も残します（値は含めません）', async () => {
    const harness = new Harness();
    const cellId = await harness.start();
    const response = await harness.post(cellId, buildJpeg({ width: 1600, height: 1200 }), {}, 'http://spam.example/secret');
    expect(response.status).toBe(400);
    expect(harness.rejections()[0].fields).toMatchObject({ failureCode: 'invalid_request', status: 400 });
    expect(harness.lines.join('\n')).not.toContain('spam.example');
  });

  it('上限による拒否は、どの上限かを failureCode に残します（総数は storage_paused、1 日の件数は daily_limit_reached）', async () => {
    const harness = new Harness();
    const cellId = await harness.start();
    const insert = async (): Promise<void> => {
      await env.DB.prepare(
        `INSERT INTO submission (id, session_id, cell_id, shot_month, spot_name, caption, image, phash, status, over_quota, declared_original, consent)
         SELECT ?, c.session_id, c.id, 4, '', '', x'ffd8ffd9', ?, 'pending_review', 0, 1, 1 FROM cell c WHERE c.id = ?`,
      )
        .bind(crypto.randomUUID(), randomHash(), cellId)
        .run();
    };
    for (let i = 0; i < SUBMISSION_CONFIG.dailySubmissionsPerSession; i += 1) {
      await insert();
    }
    const response = await harness.post(cellId, buildJpeg({ width: 1600, height: 1200 }));
    expect(response.status).toBe(429);
    expect(harness.rejections()[0].fields).toMatchObject({ failureCode: 'daily_limit_reached', status: 429 });
  });
});

describe('addCheck：投稿の行が無いとき', () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
  });

  it('外部キーの 500 ではなく、明示的な内部エラー（strings の文言）にします', async () => {
    const repo = new SubmissionRepo(env.DB);
    await expect(
      repo.addCheck('no-such-session', 'no-such-submission', { item: 'subject_kind', verdict: 'info', reason: 'none', confidence: null, model: null }),
    ).rejects.toThrow(SUBMISSION_DEV_MESSAGES.errorSubmissionMissing);
  });
});
