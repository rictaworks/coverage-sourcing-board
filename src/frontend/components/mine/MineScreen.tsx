'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { COMMON_STRINGS } from '../../../config/strings/common';
import { MINE_STRINGS, MINE_SUBMIT_LINK } from '../../../config/strings/mine';
import { MineApi, type MineView } from '../../lib/api/mineApi';
import { ErrorMessage } from '../common/ErrorMessage';
import { MineList } from './MineList';
import styles from './mine.module.css';

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly view: MineView }
  | { readonly kind: 'error' };

/**
 * 自分の投稿の画面。API を読み、読み込み中・一覧（空を含む）・通信の失敗の 3 つの状態を明示的に分けます。
 * 失敗のときは代わりの値を作らず、エラーの表示だけを出します。
 */
export function MineScreen() {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const view = await new MineApi().load();
      setState({ kind: 'ready', view });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.screen}>
      <p>{MINE_STRINGS.lead}</p>
      <div>
        <button type="button" className={styles.button} onClick={() => void load()}>
          {MINE_STRINGS.reloadLabel}
        </button>
      </div>
      {renderBody(state)}
    </div>
  );
}

function renderBody(state: ScreenState) {
  if (state.kind === 'loading') {
    return <p role="status">{COMMON_STRINGS.loading}</p>;
  }
  if (state.kind === 'error') {
    return <ErrorMessage message={MINE_STRINGS.fetchFailed} />;
  }
  if (state.view.items.length === 0) {
    return (
      <section className={styles.section} aria-label={MINE_STRINGS.listLabel}>
        <p>{MINE_STRINGS.empty}</p>
        <p>
          <Link className={styles.link} href={MINE_SUBMIT_LINK.path}>
            {MINE_STRINGS.emptyLinkLabel}
          </Link>
        </p>
      </section>
    );
  }
  return <MineList items={state.view.items} />;
}
