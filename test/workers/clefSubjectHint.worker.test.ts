import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLASSIFIER_CONFIG } from '../../src/config/classifier';
import { SUBJECT_HINT_STRINGS } from '../../src/config/strings/subjectHint';
import { CallLedger } from '../../src/core/ledger/callLedger';
import { DebugTracer } from '../../src/core/trace';
import { ClefSubjectHint, type ClefRequest, type ClefRunner } from '../../src/worker/ai/clefSubjectHint';
import { NoSubjectHint } from '../../src/worker/ai/noSubjectHint';
import { subjectHintFactory } from '../../src/worker/ai/subjectHintFactory';
import { DailyCounterRepo } from '../../src/worker/repo/dailyCounterRepo';
import { applyMigrations } from '../helpers/d1Migrations';
import { app1Exif, buildJpeg, com } from '../helpers/jpegBytes';

function toDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

const THUMB = toDataUrl(buildJpeg({ width: 512, height: 384 }));
const CAPTION = 'sample caption for the test';
const RUN_ID = '@cf/cloudflare/clef-flash';

/** AI バインディングの代役（テストダブル）。受け取った引数を記録し、用意した応答を返すか、例外を投げる。外部の AI は呼ばない。 */
class FakeClefRunner implements ClefRunner {
  readonly calls: Array<{ model: string; input: ClefRequest }> = [];

  constructor(private readonly respond: (input: ClefRequest) => Promise<unknown>) {}

  async run(model: string, input: ClefRequest): Promise<unknown> {
    this.calls.push({ model, input });
    return this.respond(input);
  }
}

/** 応答の例（clef-flash の応答の形。answers.subject と usage.input_tokens）。 */
function okResponse(choice: string, confidence: number, inputTokens = 1200): unknown {
  return { answers: { subject: { choice, confidence } }, usage: { input_tokens: inputTokens } };
}

/** 日付（UTC）を指定して、台帳と推定を組み立てる。トレースは配列に集める。 */
function hintOn(dateUtc: string, runner: FakeClefRunner, timeoutMs?: number): { hint: ClefSubjectHint; lines: string[] } {
  const clock = () => new Date(`${dateUtc}T01:00:00Z`);
  const ledger = new CallLedger(new DailyCounterRepo(env.DB), CLASSIFIER_CONFIG.dailyLimit, clock);
  const lines: string[] = [];
  const tracer = new DebugTracer('development', (line) => lines.push(line), clock);
  return { hint: new ClefSubjectHint({ runner, ledger, tracer, timeoutMs }), lines };
}

async function countOf(dateUtc: string): Promise<number | null> {
  const row = await env.DB.prepare("SELECT count FROM daily_counter WHERE date_utc = ? AND kind = 'classify'")
    .bind(dateUtc)
    .first<{ count: number }>();
  return row?.count ?? null;
}

describe('ClefSubjectHint（呼び出しの形）', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('AI のバインディングを、正しい model・data URL の 1 枚・4 つの選択肢で呼びます', async () => {
    const runner = new FakeClefRunner(async () => okResponse('landscape', 0.9));
    const { hint } = hintOn('2041-01-01', runner);
    await hint.suggest(THUMB, CAPTION, 10);

    expect(runner.calls).toHaveLength(1);
    const { model, input } = runner.calls[0];
    expect(model).toBe(RUN_ID);
    expect(input.model).toBe('clef-flash');
    expect(input.images).toHaveLength(1);
    expect(input.images[0].startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(input.questions.subject.type).toBe('choice');
    expect(Object.keys(input.questions.subject.criteria).sort()).toEqual(['closeup', 'landscape', 'other', 'people']);
  });

  it('説明文と撮影月は state だけに入り、質問の指示文には入りません', async () => {
    const runner = new FakeClefRunner(async () => okResponse('people', 0.9));
    const { hint } = hintOn('2041-01-02', runner);
    await hint.suggest(THUMB, CAPTION, 7);

    const input: ClefRequest = runner.calls[0].input;
    expect(input.state).toEqual({ caption: CAPTION, shot_month: 7 });
    expect(input.questions.subject.instructions).toContain(CLASSIFIER_CONFIG.stateIsDataNote);
    expect(JSON.stringify(input.questions)).not.toContain(CAPTION);
  });
});

describe('ClefSubjectHint（応答と確信度）', () => {
  it('正常な応答では推定区分と確信度を返し、費用と件数を記録します', async () => {
    const runner = new FakeClefRunner(async () => okResponse('closeup', 0.82, 1200));
    const { hint } = hintOn('2041-02-01', runner);
    const result = await hint.suggest(THUMB, CAPTION, 5);

    expect(result).toMatchObject({ status: 'estimated', kind: 'closeup', confidence: 0.82, model: 'clef-flash', uncertain: false, notice: null });
    expect(await countOf('2041-02-01')).toBe(1);
    const row = await env.DB.prepare("SELECT estimated_usd FROM daily_counter WHERE date_utc = '2041-02-01' AND kind = 'classify'").first<{ estimated_usd: number }>();
    expect(row?.estimated_usd).toBeCloseTo((1200 * CLASSIFIER_CONFIG.inputUsdPerMillionTokens) / 1_000_000, 12);
  });

  it('確信度 0.59 は「判定が確かでない」の印を付け、0.60 は付けません', async () => {
    const low = hintOn('2041-02-02', new FakeClefRunner(async () => okResponse('other', 0.59)));
    const lowResult = await low.hint.suggest(THUMB, CAPTION, 5);
    expect(lowResult).toMatchObject({ status: 'estimated', uncertain: true, notice: SUBJECT_HINT_STRINGS.uncertainMessage });

    const edge = hintOn('2041-02-03', new FakeClefRunner(async () => okResponse('other', 0.6)));
    const edgeResult = await edge.hint.suggest(THUMB, CAPTION, 5);
    expect(edgeResult).toMatchObject({ status: 'estimated', uncertain: false, notice: null });
  });

  const malformed: Array<[string, unknown]> = [
    ['string-response', 'not an object'],
    ['null-response', null],
    ['missing-answers', { usage: { input_tokens: 1 } }],
    ['unknown-choice', okResponse('unknown-kind', 0.9)],
    ['confidence-out-of-range', okResponse('landscape', 1.5)],
    ['missing-usage', { answers: { subject: { choice: 'landscape', confidence: 0.9 } } }],
  ];
  for (const [label, response] of malformed) {
    it(`response shape is invalid (${label}): returns a failure without estimate`, async () => {
      const { hint } = hintOn('2041-02-10', new FakeClefRunner(async () => response));
      const result = await hint.suggest(THUMB, CAPTION, 5);
      expect(result).toEqual({ status: 'none', reason: 'failure', notice: SUBJECT_HINT_STRINGS.noneMessage, resumeNotice: null });
    });
  }
});

describe('ClefSubjectHint（失敗と上限）', () => {
  it('例外は握りつぶさず、推定なしの失敗にします。トレースには種類の番号だけを残します', async () => {
    const runner = new FakeClefRunner(async () => {
      throw new TypeError('secret detail that must not appear');
    });
    const { hint, lines } = hintOn('2041-03-01', runner);
    const result = await hint.suggest(THUMB, CAPTION, 5);

    expect(result).toMatchObject({ status: 'none', reason: 'failure', notice: SUBJECT_HINT_STRINGS.noneMessage });
    const skipped = lines.map((line) => JSON.parse(line) as { name: string; fields: Record<string, unknown> }).find((line) => line.name === 'classifier.skipped');
    expect(skipped?.fields).toEqual({ errorKind: 2 });
    expect(lines.join('\n')).not.toContain('secret detail');
    expect(lines.join('\n')).not.toContain(CAPTION);
  });

  it('タイムアウトは推定なしの失敗にします', async () => {
    const runner = new FakeClefRunner(() => new Promise<unknown>(() => undefined));
    const { hint } = hintOn('2041-03-02', runner, 20);
    const result = await hint.suggest(THUMB, CAPTION, 5);
    expect(result).toMatchObject({ status: 'none', reason: 'failure' });
  });

  it('上限（2,000 回）に達していれば、AI を呼ばずに推定なし（上限）を返します', async () => {
    const dateUtc = '2041-04-01';
    await env.DB.prepare("INSERT INTO daily_counter (date_utc, kind, count, estimated_usd) VALUES (?, 'classify', ?, 0)")
      .bind(dateUtc, CLASSIFIER_CONFIG.dailyLimit)
      .run();
    const runner = new FakeClefRunner(async () => okResponse('landscape', 0.9));
    const { hint } = hintOn(dateUtc, runner);
    const result = await hint.suggest(THUMB, CAPTION, 5);

    expect(runner.calls).toHaveLength(0);
    expect(result).toEqual({
      status: 'none',
      reason: 'limit',
      notice: SUBJECT_HINT_STRINGS.noneMessage,
      resumeNotice: SUBJECT_HINT_STRINGS.resumeMessage,
    });
    expect(await countOf(dateUtc)).toBe(CLASSIFIER_CONFIG.dailyLimit);
  });

  it('data URL でない画像は、AI を呼ばずに失敗にします', async () => {
    const runner = new FakeClefRunner(async () => okResponse('landscape', 0.9));
    const { hint } = hintOn('2041-04-02', runner);
    const result = await hint.suggest('https://example.com/a.jpg', CAPTION, 5);
    expect(result).toMatchObject({ status: 'none', reason: 'failure' });
    expect(runner.calls).toHaveLength(0);
  });
});

describe('ClefSubjectHint（送る前の検査）', () => {
  it('EXIF（APP1）を含む縮小画像は、AI を呼ばず、台帳にも数えず、推定なしにします', async () => {
    const runner = new FakeClefRunner(async () => okResponse('landscape', 0.9));
    const { hint } = hintOn('2041-05-01', runner);
    const withExif = toDataUrl(buildJpeg({ width: 512, height: 384, extraSegments: [app1Exif()] }));
    const result = await hint.suggest(withExif, CAPTION, 5);
    expect(result).toMatchObject({ status: 'none', reason: 'failure', notice: SUBJECT_HINT_STRINGS.noneMessage });
    expect(runner.calls).toHaveLength(0);
    expect(await countOf('2041-05-01')).toBeNull();
  });

  it('COM を含む縮小画像や、JPEG として壊れた画像も、AI を呼びません', async () => {
    const runner = new FakeClefRunner(async () => okResponse('landscape', 0.9));
    const { hint } = hintOn('2041-05-02', runner);
    const withCom = toDataUrl(buildJpeg({ extraSegments: [com('x')] }));
    const trailing = toDataUrl(buildJpeg({ trailing: [1, 2, 3] }));
    const broken = toDataUrl(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]));
    for (const url of [withCom, trailing, broken]) {
      const result = await hint.suggest(url, CAPTION, 5);
      expect(result).toMatchObject({ status: 'none', reason: 'failure' });
    }
    expect(runner.calls).toHaveLength(0);
  });

  it('base64 として読めない画像は、AI を呼ばずに失敗にします', async () => {
    const runner = new FakeClefRunner(async () => okResponse('landscape', 0.9));
    const { hint } = hintOn('2041-05-03', runner);
    const result = await hint.suggest('data:image/jpeg;base64,@@@not-base64@@@', CAPTION, 5);
    expect(result).toMatchObject({ status: 'none', reason: 'failure' });
    expect(runner.calls).toHaveLength(0);
  });

  it('説明文が 60 字ちょうどなら送り、61 字なら切り詰めずに AI を呼ばず失敗にします', async () => {
    const runner = new FakeClefRunner(async () => okResponse('landscape', 0.9));
    const { hint } = hintOn('2041-05-04', runner);
    const max = 'a'.repeat(CLASSIFIER_CONFIG.captionMaxChars);
    const ok = await hint.suggest(THUMB, max, 5);
    expect(ok.status).toBe('estimated');
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0].input.state.caption).toBe(max);

    const over = await hint.suggest(THUMB, `${max}a`, 5);
    expect(over).toMatchObject({ status: 'none', reason: 'failure' });
    expect(runner.calls).toHaveLength(1);
  });
});

describe('subjectHintFactory（AI のバインディングの有無で実装を選ぶ）', () => {
  const fakeAi = new FakeClefRunner(async () => okResponse('landscape', 0.9));

  it('AI が無ければ NoSubjectHint を返します（開発）', () => {
    const hint = subjectHintFactory({ DB: env.DB, RATE_LIMITER: env.RATE_LIMITER, APP_ENV: 'development' });
    expect(hint).toBeInstanceOf(NoSubjectHint);
  });

  it('AI が無ければ NoSubjectHint を返します（本番）', () => {
    const hint = subjectHintFactory({ DB: env.DB, RATE_LIMITER: env.RATE_LIMITER, APP_ENV: 'production' });
    expect(hint).toBeInstanceOf(NoSubjectHint);
  });

  it('AI があれば ClefSubjectHint を返します（開発と本番の両方）', () => {
    for (const appEnv of ['development', 'production']) {
      const hint = subjectHintFactory({ DB: env.DB, RATE_LIMITER: env.RATE_LIMITER, APP_ENV: appEnv, AI: fakeAi as unknown as Ai });
      expect(hint).toBeInstanceOf(ClefSubjectHint);
    }
  });

  it('APP_ENV が不正なら例外にします', () => {
    expect(() => subjectHintFactory({ DB: env.DB, RATE_LIMITER: env.RATE_LIMITER, APP_ENV: 'staging' })).toThrow();
  });
});

describe('NoSubjectHint（表示用の文言）', () => {
  it('推定なしの結果が、表示用の文言を持ちます', async () => {
    const result = await new NoSubjectHint().suggest(THUMB, CAPTION, 5);
    expect(result).toMatchObject({ status: 'none', notice: SUBJECT_HINT_STRINGS.noneMessage });
  });
});

describe('ClefSubjectHint（費用の記録の失敗）', () => {
  it('record が例外を出しても、成功した結果を返し、記録の失敗をトレースに残します', async () => {
    const clock = () => new Date('2041-06-01T01:00:00Z');
    class FailingRecordLedger extends CallLedger {
      override async record(): Promise<void> {
        throw new Error('record failed secret-detail');
      }
    }
    const ledger = new FailingRecordLedger(new DailyCounterRepo(env.DB), CLASSIFIER_CONFIG.dailyLimit, clock);
    const lines: string[] = [];
    const tracer = new DebugTracer('development', (line) => lines.push(line), clock);
    const runner = new FakeClefRunner(async () => okResponse('landscape', 0.9));
    const hint = new ClefSubjectHint({ runner, ledger, tracer });
    const result = await hint.suggest(THUMB, CAPTION, 5);
    expect(result).toMatchObject({ status: 'estimated', kind: 'landscape' });
    expect(lines.some((l) => l.includes('classifier.recordFailed'))).toBe(true);
    expect(lines.join('\n')).not.toContain('secret-detail');
  });
});
