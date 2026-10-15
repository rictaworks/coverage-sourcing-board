'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { COVERAGE_STRINGS, COVERAGE_SUBMIT_LINK } from '../../../config/strings/coverage';
import { TOP_ROLE_CONFIG, type Role } from '../../../config/strings/top';
import { RoleStore } from '../../lib/roleStore';
import type { WantedItemView } from '../../lib/api/coverageApi';
import styles from './coverage.module.css';

/** 投稿の画面へのリンク。エリアと季節を指定します（投稿の画面の初期値に使います）。 */
export function submitHref(areaId: string, periodId: string): string {
  const query = new URLSearchParams({
    [COVERAGE_SUBMIT_LINK.areaParam]: areaId,
    [COVERAGE_SUBMIT_LINK.periodParam]: periodId,
  });
  return `${COVERAGE_SUBMIT_LINK.path}?${query.toString()}`;
}

/**
 * いま求めている場所の一覧。並びは API の priority の順のまま表示します（画面では並べ替えません）。
 * 投稿者の役割のときだけ、各項目から投稿の画面へ移れます。役割は表示の切り替えにだけ使います。
 */
export function WantedList({ items }: { readonly items: readonly WantedItemView[] }) {
  const [role, setRole] = useState<Role>(TOP_ROLE_CONFIG.defaultRole);

  useEffect(() => {
    setRole(new RoleStore().read());
  }, []);

  if (items.length === 0) {
    return <p>{COVERAGE_STRINGS.wantedEmpty}</p>;
  }

  return (
    <ol className={styles.wantedList}>
      {items.map((item) => (
        <li key={item.cellId} className={styles.wantedItem}>
          <p className={styles.wantedTitle}>{COVERAGE_STRINGS.wantedTitle(item.areaLabel, item.seasonLabel)}</p>
          <p className={styles.wantedCount}>
            {COVERAGE_STRINGS.wantedCount(item.accepted, item.required, item.remaining)}
          </p>
          {role === 'submitter' ? (
            <Link
              className={styles.link}
              href={submitHref(item.areaId, item.periodId)}
            >
              {COVERAGE_STRINGS.wantedSubmitLabel(item.areaLabel, item.seasonLabel)}
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
