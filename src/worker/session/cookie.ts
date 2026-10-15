import { WORKER_CONFIG } from '../../config/worker';

/**
 * セッションの Cookie（csid）の読み書き（requirements 2.3）。
 * 値は 16 バイト以上の乱数を base64url で表す。Cookie の値はログに出さない。
 */
export class SessionCookie {
  private readonly tokenPattern: RegExp;

  constructor(private readonly name: string = WORKER_CONFIG.sessionCookieName) {
    const length = Math.ceil((WORKER_CONFIG.sessionTokenBytes * 4) / 3);
    this.tokenPattern = new RegExp(`^[A-Za-z0-9_-]{${length}}$`);
  }

  /** Cookie ヘッダーから値を取り出す。無い・形式が不正なら null。 */
  readToken(cookieHeader: string | null): string | null {
    if (cookieHeader === null) {
      return null;
    }
    for (const part of cookieHeader.split(';')) {
      const index = part.indexOf('=');
      if (index < 0 || part.slice(0, index).trim() !== this.name) {
        continue;
      }
      const value = part.slice(index + 1).trim();
      return this.tokenPattern.test(value) ? value : null;
    }
    return null;
  }

  createToken(): string {
    const bytes = new Uint8Array(WORKER_CONFIG.sessionTokenBytes);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  buildSetCookie(token: string): string {
    return `${this.name}=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=${WORKER_CONFIG.sessionMaxAgeSeconds}; Path=/`;
  }
}
