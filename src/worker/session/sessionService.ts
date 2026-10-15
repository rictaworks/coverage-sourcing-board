import { WORKER_STRINGS } from '../../config/strings/worker';
import { sha256Hex } from '../security/sha256';
import { SessionCookie } from './cookie';

/** セッションの解決の結果。sessionIdHash は session テーブルの id_hash（Cookie の値の SHA-256）。 */
export interface SessionResolution {
  readonly sessionIdHash: string;
  /** 新しいセッションを作ったときだけ Set-Cookie の値を入れる。既存のセッションでは null。 */
  readonly setCookie: string | null;
}

/** セッションの発行と検証。DB には Cookie の値のハッシュだけを保存する。 */
export class SessionService {
  constructor(
    private readonly db: D1Database,
    private readonly cookie: SessionCookie = new SessionCookie(),
  ) {}

  async resolve(cookieHeader: string | null): Promise<SessionResolution> {
    const token = this.cookie.readToken(cookieHeader);
    if (token !== null) {
      const hash = await sha256Hex(token);
      const row = await this.db.prepare('SELECT id_hash FROM session WHERE id_hash = ?').bind(hash).first<{ id_hash: string }>();
      if (row !== null) {
        return { sessionIdHash: row.id_hash, setCookie: null };
      }
    }
    const newToken = this.cookie.createToken();
    const newHash = await sha256Hex(newToken);
    await this.db.prepare('INSERT INTO session (id_hash) VALUES (?)').bind(newHash).run();
    return { sessionIdHash: newHash, setCookie: this.cookie.buildSetCookie(newToken) };
  }

  /** このセッションのキャンペーンがあるかどうか（campaign テーブルを session_id で数える）。 */
  async hasCampaign(sessionIdHash: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT COUNT(*) AS n FROM campaign WHERE session_id = ?')
      .bind(sessionIdHash)
      .first<{ n: number }>();
    if (row === null) {
      throw new Error(WORKER_STRINGS.errorSessionCountMissing);
    }
    return row.n > 0;
  }
}
