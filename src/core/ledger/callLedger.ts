/** 台帳の種類（DAILY_COUNTER の kind）。 */
export type LedgerKind = 'classify';

/**
 * 件数と費用の保存先の約束。実装は D1（src/worker/repo/dailyCounterRepo.ts）。
 * reserve は、件数が limit 未満のときだけ 1 増やして true を返す（同時の要求でも limit を超えない）。
 */
export interface CounterStore {
  reserve(dateUtc: string, kind: LedgerKind, limit: number): Promise<boolean>;
  addEstimatedUsd(dateUtc: string, kind: LedgerKind, usd: number): Promise<void>;
}

/** 呼び出し 1 回の推定費用。inputTokens は応答の入力トークン数、usd は推定費用。 */
export interface CostEstimate {
  readonly inputTokens: number;
  readonly usd: number;
}

/** UTC の日付（YYYY-MM-DD）。台帳の日付は UTC で決めます（requirements 3.8）。 */
export function utcDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 推定費用（USD）。単価は 100 万トークンあたりの値。 */
export function estimateCostUsd(inputTokens: number, usdPerMillionTokens: number): number {
  return (inputTokens * usdPerMillionTokens) / 1_000_000;
}

/**
 * 呼び出しの台帳。呼び出しの前に reserve で件数を予約し、上限（dailyLimit）を超えたら false を返す。
 * 呼び出しのあとに record で推定費用を加算する。時計は外から渡す（テストで日付の境目を確かめられるように）。
 */
export class CallLedger {
  constructor(
    private readonly store: CounterStore,
    private readonly dailyLimit: number,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  reserve(kind: LedgerKind): Promise<boolean> {
    return this.store.reserve(utcDateOf(this.clock()), kind, this.dailyLimit);
  }

  record(kind: LedgerKind, estimate: CostEstimate): Promise<void> {
    return this.store.addEstimatedUsd(utcDateOf(this.clock()), kind, estimate.usd);
  }
}
