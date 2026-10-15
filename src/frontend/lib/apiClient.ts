import { COMMON_STRINGS } from '../../config/strings/common';
import { API_CLIENT_STRINGS } from '../../config/strings/layout';

/** 本文が不正なエラー応答のときの code。 */
export const MALFORMED_RESPONSE_CODE = 'malformed_response';

const API_PREFIX = '/api/';

/** サーバーのエラー応答（{ code, message }）。 */
export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
}

/** API が失敗したときの例外。code と HTTP の状態を持つ。 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** 呼び出しの設定。credentials は同一オリジンに固定する。 */
export interface ApiRequestInit {
  readonly method: 'GET' | 'POST';
  readonly credentials: 'same-origin';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

/** fetch と同じ形の関数（テストで差し替えられるように外から渡す）。 */
export type FetchLike = (input: string, init: ApiRequestInit) => Promise<Response>;

/** 同一オリジンの /api/ を呼ぶ薄いラッパー。バックエンドのドメインは書かない。 */
export class ApiClient {
  constructor(private readonly fetcher: FetchLike = (input, init) => fetch(input, init as RequestInit)) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, 'GET');
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, 'POST', JSON.stringify(body));
  }

  async request<T>(path: string, method: 'GET' | 'POST', body?: string): Promise<T> {
    if (!path.startsWith(API_PREFIX)) {
      throw new Error(API_CLIENT_STRINGS.invalidPath);
    }
    const headers: Record<string, string> = body === undefined ? {} : { 'content-type': 'application/json' };
    const response = await this.fetcher(path, { method, credentials: 'same-origin', headers, body });
    if (!response.ok) {
      throw await this.toApiError(response);
    }
    return (await response.json()) as T;
  }

  /** エラー応答の本文を読む。形式が合わないときは、代わりの値を作らず、形式の誤りとして扱う。 */
  private async toApiError(response: Response): Promise<ApiError> {
    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return new ApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, response.status);
    }
    if (isApiErrorBody(parsed)) {
      return new ApiError(parsed.code, parsed.message, response.status);
    }
    return new ApiError(MALFORMED_RESPONSE_CODE, COMMON_STRINGS.errorHeading, response.status);
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<Record<keyof ApiErrorBody, unknown>>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}
