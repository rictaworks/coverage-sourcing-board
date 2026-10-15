import { faCircleCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { COVERAGE_STRINGS } from '../../../config/strings/coverage';
import type { CoverageCellView, CoverageView } from '../../lib/api/coverageApi';
import { Icon } from '../common/Icon';
import styles from './coverage.module.css';

/** 表の 1 マス。未充足と募集終了は、文字とアイコンで示し、色だけに頼らない（QC07）。 */
export function CoverageCell({ cell }: { readonly cell: CoverageCellView }) {
  const closed = cell.state === 'closed';
  return (
    <td className={closed ? styles.cellClosed : styles.cellUnfilled}>
      <span className={styles.count}>
        {cell.accepted}
        {COVERAGE_STRINGS.countSeparator}
        {cell.required}
      </span>
      <span className={styles.badge}>
        <Icon icon={closed ? faCircleCheck : faTriangleExclamation} />
        {closed ? COVERAGE_STRINGS.closedBadge : COVERAGE_STRINGS.unfilledBadge}
      </span>
      <span className={styles.pending}>{COVERAGE_STRINGS.pendingCount(cell.pendingReview)}</span>
    </td>
  );
}

/** エリア×季節の表。県ごとに tbody をまとめ、横に広いときは枠の中だけでスクロールします。 */
export function CoverageTable({ view }: { readonly view: CoverageView }) {
  return (
    <div className={styles.tableWrap} role="region" aria-label={COVERAGE_STRINGS.tableRegionLabel} tabIndex={0}>
      <table className={styles.table}>
        <caption>{COVERAGE_STRINGS.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{COVERAGE_STRINGS.columnPrefecture}</th>
            <th scope="col">{COVERAGE_STRINGS.columnArea}</th>
            {view.seasons.map((season) => (
              <th scope="col" key={season.id}>
                {season.label}
              </th>
            ))}
          </tr>
        </thead>
        {view.groups.map((group) => (
          <tbody key={group.prefecture}>
            {group.rows.map((row, index) => (
              <tr key={row.areaId}>
                {index === 0 ? (
                  <th scope="rowgroup" rowSpan={group.rows.length} className={styles.prefecture}>
                    {group.label}
                  </th>
                ) : null}
                <th scope="row" className={styles.areaName}>
                  {row.areaLabel}
                </th>
                {row.cells.map((cell) => (
                  <CoverageCell key={cell.cellId} cell={cell} />
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
