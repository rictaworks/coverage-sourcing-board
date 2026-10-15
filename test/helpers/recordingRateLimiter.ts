/**
 * テスト用の Rate Limiting のバインディングの代役（テストダブル）。
 * 戻り値を固定し、受け取ったキーを記録する。実装（src/worker/security）は呼ばない。
 */
export class RecordingRateLimiter implements RateLimit {
  readonly keys: string[] = [];

  constructor(private readonly success: boolean) {}

  async limit(options: RateLimitOptions): Promise<RateLimitOutcome> {
    this.keys.push(options.key);
    return { success: this.success };
  }
}
