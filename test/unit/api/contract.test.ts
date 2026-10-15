import { describe, expect, it } from 'vitest';
import { API_ERROR_MESSAGES } from '../../../src/config/strings/apiErrors';
import { RETURN_REASON_LABELS } from '../../../src/config/strings/returnReasons';
import { STATUS_LABELS, STATUS_NOTICES } from '../../../src/config/strings/status';
import {
  API_ERROR_CODES,
  PREFECTURE_CODES,
  RETURN_REASON_CODES,
  SUBMISSION_FORM_FIELDS,
} from '../../../src/core/api/contract';
import { API_ENDPOINTS } from '../../../src/core/api/paths';

describe('API の経路（requirements 3・8 章に対応する一覧）', () => {
  it('14 件の経路が、メソッドつきで定義されています', () => {
    const routes = Object.values(API_ENDPOINTS).map((endpoint) => `${endpoint.method} ${endpoint.path}`).sort();
    expect(routes).toEqual(
      [
        'GET /api/health',
        'GET /api/session',
        'GET /api/campaign',
        'PUT /api/campaign',
        'POST /api/campaign/template',
        'POST /api/campaign/areas',
        'GET /api/coverage',
        'POST /api/submissions',
        'GET /api/submissions/mine',
        'GET /api/submissions/:id/image',
        'GET /api/review/queue',
        'POST /api/review/:id/accept',
        'POST /api/review/:id/return',
        'POST /api/review/:id/revoke',
      ].sort(),
    );
  });
});

describe('API の契約（contract）の定数', () => {
  it('投稿の multipart のフィールド名は image・thumb・meta と、ハニーポット欄です', () => {
    expect(SUBMISSION_FORM_FIELDS.image).toBe('image');
    expect(SUBMISSION_FORM_FIELDS.thumb).toBe('thumb');
    expect(SUBMISSION_FORM_FIELDS.meta).toBe('meta');
    expect(typeof SUBMISSION_FORM_FIELDS.honeypot).toBe('string');
  });

  it('県のコードは 4 件です', () => {
    expect([...PREFECTURE_CODES].sort()).toEqual(['ehime', 'kagawa', 'kochi', 'tokushima']);
  });

  it('差し戻しの理由のコードは 5 件です', () => {
    expect([...RETURN_REASON_CODES].sort()).toEqual(['other', 'ratio', 'resolution', 'shoot_declaration', 'subject']);
  });
});

describe('文言とコードの対応（漏れの検出）', () => {
  it('エラーのコードと、エラーの文言（apiErrors.ts）のキーが一致します', () => {
    expect(Object.keys(API_ERROR_MESSAGES).sort()).toEqual([...API_ERROR_CODES].sort());
  });

  it('エラーの文言は空ではなく、である調で終わりません', () => {
    for (const message of Object.values(API_ERROR_MESSAGES)) {
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toMatch(/である。?$|だ。$/);
    }
  });

  it('差し戻しの理由のコードと、表示（returnReasons.ts）のキーが一致します', () => {
    expect(Object.keys(RETURN_REASON_LABELS).sort()).toEqual([...RETURN_REASON_CODES].sort());
  });

  it('状態の表示は、確認待ち・採用・差し戻しの 3 つで、注記があります', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(['accepted', 'pending_review', 'returned']);
    expect(STATUS_NOTICES.noRealTransaction.length).toBeGreaterThan(0);
  });
});
