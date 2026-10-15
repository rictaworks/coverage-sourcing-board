import { describe, expect, it } from 'vitest';
import { CallLedger, estimateCostUsd, utcDateOf, type CounterStore, type LedgerKind } from '../../../src/core/ledger/callLedger';
import { LIMITS } from '../../../src/config/limits';

/** テスト用の計数の代役（テストダブル）。CounterStore の約束（上限を超えると増やさない）だけを真似る。 */
class InMemoryCounterStore implements CounterStore {
  readonly counts = new Map<string, number>();
  readonly usd = new Map<string, number>();

  async reserve(dateUtc: string, kind: LedgerKind, limit: number): Promise<boolean> {
    const key = `${dateUtc}:${kind}`;
    const current = this.counts.get(key) ?? 0;
    if (current >= limit) {
      return false;
    }
    this.counts.set(key, current + 1);
    return true;
  }

  async addEstimatedUsd(dateUtc: string, kind: LedgerKind, usd: number): Promise<void> {
    const key = `${dateUtc}:${kind}`;
    this.usd.set(key, (this.usd.get(key) ?? 0) + usd);
  }
}

function ledgerAt(store: InMemoryCounterStore, iso: string): CallLedger {
  return new CallLedger(store, LIMITS.dailyClassifyCalls, () => new Date(iso));
}

describe('CallLedger（分類の上限。1 日 2,000 回まで、UTC 0 時に数え直す）', () => {
  it('1,999 回目と 2,000 回目は予約でき、2,001 回目は予約できません', async () => {
    const store = new InMemoryCounterStore();
    const ledger = ledgerAt(store, '2026-10-16T01:00:00Z');
    const outcomes: boolean[] = [];
    for (let call = 1; call <= 2001; call += 1) {
      outcomes.push(await ledger.reserve('classify'));
    }
    expect(outcomes[1998]).toBe(true);
    expect(outcomes[1999]).toBe(true);
    expect(outcomes[2000]).toBe(false);
  });

  it('上限に達したあとは件数を増やしません', async () => {
    const store = new InMemoryCounterStore();
    const ledger = ledgerAt(store, '2026-10-16T01:00:00Z');
    for (let call = 0; call < 2005; call += 1) {
      await ledger.reserve('classify');
    }
    expect(store.counts.get('2026-10-16:classify')).toBe(2000);
  });

  it('UTC の日付が変わると 0 から数え直します（UTC 0 時 = JST 9 時）', async () => {
    const store = new InMemoryCounterStore();
    const late = ledgerAt(store, '2026-10-16T23:59:59Z');
    for (let call = 0; call < LIMITS.dailyClassifyCalls; call += 1) {
      await late.reserve('classify');
    }
    expect(await late.reserve('classify')).toBe(false);

    const next = ledgerAt(store, '2026-10-17T00:00:00Z');
    expect(await next.reserve('classify')).toBe(true);
    expect(store.counts.get('2026-10-17:classify')).toBe(1);
  });

  it('日付は UTC で決めます（JST の 2026-10-17 08:59 は UTC の 2026-10-16）', () => {
    expect(utcDateOf(new Date('2026-10-16T23:59:00Z'))).toBe('2026-10-16');
    expect(utcDateOf(new Date('2026-10-17T00:00:00Z'))).toBe('2026-10-17');
  });
});

describe('推定費用（入力 $0.038／100 万トークン）', () => {
  it('1,200 トークンの費用は約 0.0000456 USD です', () => {
    expect(estimateCostUsd(1200, 0.038)).toBeCloseTo(0.0000456, 10);
  });

  it('record は推定費用を当日の行に加算します', async () => {
    const store = new InMemoryCounterStore();
    const ledger = ledgerAt(store, '2026-10-16T01:00:00Z');
    const usd = estimateCostUsd(1200, 0.038);
    await ledger.record('classify', { inputTokens: 1200, usd });
    await ledger.record('classify', { inputTokens: 1200, usd });
    expect(store.usd.get('2026-10-16:classify')).toBeCloseTo(usd * 2, 12);
  });
});
