import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { REVIEW_QUEUE_STRINGS } from '../../../src/config/strings/reviewQueue';
import { ReturnDialog, type ReturnTarget } from '../../../src/frontend/components/review/ReturnDialog';

function render(target: ReturnTarget | null): string {
  return renderToStaticMarkup(
    createElement(ReturnDialog, { target, busy: false, onSubmit: () => undefined, onDismiss: () => undefined }),
  );
}

describe('ReturnDialog の描画', () => {
  it('閉じているとき（target が null）は何も描画しません', () => {
    expect(render(null)).toBe('');
  });

  it('差し戻しのとき、差し戻しの表題を使います', () => {
    const html = render({ id: 'p1', mode: 'return', error: null });
    expect(html).toContain(REVIEW_QUEUE_STRINGS.returnTitle);
    expect(html).toContain(REVIEW_QUEUE_STRINGS.returnSubmitButton);
    expect(html).not.toContain(REVIEW_QUEUE_STRINGS.revokeTitle);
  });

  it('採用の取り消しのとき、取り消しの表題と注意を使います', () => {
    const html = render({ id: 'p1', mode: 'revoke', error: null });
    expect(html).toContain(REVIEW_QUEUE_STRINGS.revokeTitle);
    expect(html).toContain(REVIEW_QUEUE_STRINGS.revokeReturnNotice);
    expect(html).toContain(REVIEW_QUEUE_STRINGS.revokeSubmitButton);
    expect(html).not.toContain(REVIEW_QUEUE_STRINGS.returnTitle);
  });
});
