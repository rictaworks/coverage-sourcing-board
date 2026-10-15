'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { COMMON_STRINGS } from '../../../config/strings/common';
import { COVERAGE_STRINGS } from '../../../config/strings/coverage';
import { STATUS_LABELS, STATUS_NOTICES } from '../../../config/strings/status';
import { CoverageApi, type CoverageLoadResult, type CoverageView } from '../../lib/api/coverageApi';
import { ErrorMessage } from '../common/ErrorMessage';
import { CoverageLegend } from './CoverageLegend';
import { CoverageTable } from './CoverageTable';
import { WantedList } from './WantedList';
import styles from './coverage.module.css';

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly campaignName: string; readonly view: CoverageView }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'error' };

/**
 * 充足マップの画面。API を読み、読み込み中・表示・キャンペーンが無い・通信の失敗の 4 つの状態を明示的に分けます。
 * 失敗のときは代わりの値を作らず、エラーの表示だけを出します。
 */
export function CoverageScreen() {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const result: CoverageLoadResult = await new CoverageApi().load();
      setState(
        result.kind === 'ready'
          ? { kind: 'ready', campaignName: result.campaignName, view: result.view }
          : { kind: 'notFound' },
      );
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.screen}>
      <p>{COVERAGE_STRINGS.lead}</p>
      <div>
        <button type="button" className={styles.button} onClick={() => void load()}>
          {COVERAGE_STRINGS.reloadLabel}
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
    return <ErrorMessage message={COVERAGE_STRINGS.fetchFailed} />;
  }
  if (state.kind === 'notFound') {
    return (
      <section className={styles.section} aria-labelledby="coverage-not-found-heading">
        <h2 id="coverage-not-found-heading" className={styles.heading}>
          {COVERAGE_STRINGS.campaignNotFoundHeading}
        </h2>
        <p>{COVERAGE_STRINGS.campaignNotFoundBody}</p>
        <p>
          <Link className={styles.link} href={COVERAGE_STRINGS.campaignLinkHref}>
            {COVERAGE_STRINGS.campaignLinkLabel}
          </Link>
        </p>
      </section>
    );
  }
  return (
    <>
      <p>
        {COVERAGE_STRINGS.campaignNamePrefix}
        {state.campaignName}
      </p>
      <p className={styles.notice}>{STATUS_LABELS.accepted}</p>
      <p className={styles.notice}>{STATUS_NOTICES.noRealTransaction}</p>
      <CoverageLegend />
      <section className={styles.section} aria-labelledby="coverage-table-heading">
        <h2 id="coverage-table-heading" className={styles.heading}>
          {COVERAGE_STRINGS.tableCaption}
        </h2>
        <CoverageTable view={state.view} />
      </section>
      <section className={styles.section} aria-labelledby="coverage-wanted-heading">
        <h2 id="coverage-wanted-heading" className={styles.heading}>
          {COVERAGE_STRINGS.wantedHeading}
        </h2>
        <p>{COVERAGE_STRINGS.wantedDescription}</p>
        <WantedList items={state.view.wanted} />
      </section>
    </>
  );
}
