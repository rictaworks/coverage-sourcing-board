/**
 * Workers のバインディング（wrangler.toml の宣言と一致させる）。
 * Workers AI（AI）は production の環境だけに宣言するため、任意とする。
 */
export interface WorkerBindings {
  DB: D1Database;
  RATE_LIMITER: RateLimit;
  APP_ENV: string;
  AI?: Ai;
}

declare global {
  namespace Cloudflare {
    // cloudflare:test の env（テストの型）と、Workers の型を、同じバインディングに揃える。
    interface Env extends WorkerBindings {}
  }
}
