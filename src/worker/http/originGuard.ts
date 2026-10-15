import { WORKER_CONFIG } from '../../config/worker';
import type { AppEnv } from '../../core/types';

/**
 * 状態を変える要求の Origin を確認する（CLAUDE.md 8・requirements 2.3）。
 * 許可する Origin は APP_ENV で決まる。
 * - 自分のオリジン（要求の URL の origin）は、両方の環境で許可する。
 * - development だけ、開発サーバーの Origin（WORKER_CONFIG.developmentOrigins）を追加で許可する。
 */
export class OriginGuard {
  constructor(private readonly appEnv: AppEnv) {}

  isAllowed(request: Request): boolean {
    if (!this.requiresCheck(request.method)) {
      return true;
    }
    const origin = request.headers.get('origin');
    if (origin === null) {
      return false;
    }
    return this.allowedOrigins(request.url).includes(origin);
  }

  allowedOrigins(requestUrl: string): readonly string[] {
    const ownOrigin = new URL(requestUrl).origin;
    switch (this.appEnv) {
      case 'development':
        return [ownOrigin, ...WORKER_CONFIG.developmentOrigins];
      case 'production':
        return [ownOrigin];
    }
  }

  private requiresCheck(method: string): boolean {
    return WORKER_CONFIG.originCheckedMethods.includes(method);
  }
}
