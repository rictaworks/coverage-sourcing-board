import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { DailyCounterRepo } from '../../src/worker/repo/dailyCounterRepo';
import { applyMigrations } from '../helpers/d1Migrations';

async function readRow(dateUtc: string, kind: string): Promise<{ count: number; estimated_usd: number } | null> {
  return env.DB.prepare('SELECT count, estimated_usd FROM daily_counter WHERE date_utc = ? AND kind = ?')
    .bind(dateUtc, kind)
    .first<{ count: number; estimated_usd: number }>();
}

describe('DailyCounterRepo（D1 の daily_counter。予約は 1 文で上限を超えない）', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('上限まで予約でき、上限を超えると false を返して件数を増やしません', async () => {
    const repo = new DailyCounterRepo(env.DB);
    const results: boolean[] = [];
    for (let call = 0; call < 4; call += 1) {
      results.push(await repo.reserve('2040-01-01', 'classify', 3));
    }
    expect(results).toEqual([true, true, true, false]);
    expect(await readRow('2040-01-01', 'classify')).toMatchObject({ count: 3 });
  });

  it('同時の予約でも、上限を超えません', async () => {
    const repo = new DailyCounterRepo(env.DB);
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => repo.reserve('2040-01-02', 'classify', 3)));
    expect(outcomes.filter((ok) => ok)).toHaveLength(3);
    expect(await readRow('2040-01-02', 'classify')).toMatchObject({ count: 3 });
  });

  it('日付が違えば、別の行で数えます（UTC の日付ごとに 0 から）', async () => {
    const repo = new DailyCounterRepo(env.DB);
    expect(await repo.reserve('2040-01-03', 'classify', 1)).toBe(true);
    expect(await repo.reserve('2040-01-04', 'classify', 1)).toBe(true);
    expect(await readRow('2040-01-04', 'classify')).toMatchObject({ count: 1 });
  });

  it('推定費用は件数を変えずに加算されます', async () => {
    const repo = new DailyCounterRepo(env.DB);
    await repo.reserve('2040-01-05', 'classify', 10);
    await repo.addEstimatedUsd('2040-01-05', 'classify', 0.0000456);
    await repo.addEstimatedUsd('2040-01-05', 'classify', 0.0000456);
    const row = await readRow('2040-01-05', 'classify');
    expect(row?.count).toBe(1);
    expect(row?.estimated_usd).toBeCloseTo(0.0000912, 10);
  });
});
