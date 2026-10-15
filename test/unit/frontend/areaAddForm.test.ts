import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AreaAddForm } from '../../../src/frontend/components/campaign/AreaAddForm';

function render(error: string | null): string {
  return renderToStaticMarkup(
    createElement(AreaAddForm, { areaLabels: [], busy: false, error, onAdd: async () => false }),
  );
}

describe('AreaAddForm のエラーの関連づけ', () => {
  it('エラーがあるとき、入力欄の aria-describedby がエラーの要素の id を含みます', () => {
    const html = render('sample error text');
    const describedBy = /aria-describedby="([^"]+)"/.exec(html);
    expect(describedBy).not.toBeNull();
    const ids = (describedBy as RegExpExecArray)[1].split(' ');
    expect(ids).toHaveLength(2);
    const errorId = ids[1];
    expect(html).toContain(`id="${errorId}"`);
    expect(html).toContain('sample error text');
  });

  it('エラーがないとき、aria-describedby は補足の説明だけを指します', () => {
    const html = render(null);
    const describedBy = /aria-describedby="([^"]+)"/.exec(html);
    expect((describedBy as RegExpExecArray)[1].split(' ')).toHaveLength(1);
  });
});
