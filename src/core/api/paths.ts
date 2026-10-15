/**
 * API の経路（requirements 3 章・8 章）。メソッドと経路を定数で持つ。
 * 経路の詳細（要求と応答）は contract.ts と SPEC/api.md に書く。
 */

export type HttpMethod = 'GET' | 'PUT' | 'POST';

export interface ApiEndpoint {
  readonly method: HttpMethod;
  /** `:id` は実行時に置き換える path パラメータ。 */
  readonly path: string;
}

export const API_ENDPOINTS = {
  health: { method: 'GET', path: '/api/health' },
  session: { method: 'GET', path: '/api/session' },
  campaignGet: { method: 'GET', path: '/api/campaign' },
  campaignPut: { method: 'PUT', path: '/api/campaign' },
  campaignTemplate: { method: 'POST', path: '/api/campaign/template' },
  campaignAreas: { method: 'POST', path: '/api/campaign/areas' },
  coverage: { method: 'GET', path: '/api/coverage' },
  submissionCreate: { method: 'POST', path: '/api/submissions' },
  submissionsMine: { method: 'GET', path: '/api/submissions/mine' },
  submissionImage: { method: 'GET', path: '/api/submissions/:id/image' },
  reviewQueue: { method: 'GET', path: '/api/review/queue' },
  reviewAccept: { method: 'POST', path: '/api/review/:id/accept' },
  reviewReturn: { method: 'POST', path: '/api/review/:id/return' },
  reviewRevoke: { method: 'POST', path: '/api/review/:id/revoke' },
} as const satisfies Record<string, ApiEndpoint>;

export type ApiEndpointName = keyof typeof API_ENDPOINTS;
