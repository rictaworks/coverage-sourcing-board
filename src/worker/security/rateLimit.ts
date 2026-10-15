import { WORKER_STRINGS } from '../../config/strings/worker';
import { sha256Hex } from './sha256';

/**
 * IP ごとのレート制限（requirements 3.8：10 秒に 5 回まで）。
 * Rate Limiting のバインディングを使い、キーは CF-Connecting-IP の SHA-256 のハッシュにする（IP は保存もトレースもしない）。
 * バインディングや IP が無いときは例外にする（制限値の代用はしない）。
 */
export class RateLimitGuard {
  /** 要求を許可するなら true、超えたら false を返す。 */
  async isAllowed(request: Request, binding: RateLimit | undefined): Promise<boolean> {
    if (binding === undefined) {
      throw new Error(WORKER_STRINGS.errorRateLimiterMissing);
    }
    const ip = request.headers.get('cf-connecting-ip');
    if (ip === null || ip === '') {
      throw new Error(WORKER_STRINGS.errorClientIpMissing);
    }
    const outcome = await binding.limit({ key: await sha256Hex(ip) });
    return outcome.success;
  }
}
