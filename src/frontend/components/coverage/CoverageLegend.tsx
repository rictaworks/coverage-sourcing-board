import { faCircleCheck, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { COVERAGE_STRINGS } from '../../../config/strings/coverage';
import { Icon } from '../common/Icon';
import styles from './coverage.module.css';

/** 表の見方。記号（アイコン）と文字で、未充足と募集終了を説明します。 */
export function CoverageLegend() {
  return (
    <section className={styles.section} aria-labelledby="coverage-legend-heading">
      <h2 id="coverage-legend-heading" className={styles.heading}>
        {COVERAGE_STRINGS.legendHeading}
      </h2>
      <ul className={styles.legendList}>
        <li>{COVERAGE_STRINGS.legendCount}</li>
        <li>
          <span className={styles.badge}>
            <Icon icon={faTriangleExclamation} />
            {COVERAGE_STRINGS.unfilledBadge}
          </span>{' '}
          {COVERAGE_STRINGS.legendUnfilled}
        </li>
        <li>
          <span className={styles.badge}>
            <Icon icon={faCircleCheck} />
            {COVERAGE_STRINGS.closedBadge}
          </span>{' '}
          {COVERAGE_STRINGS.legendClosed}
        </li>
      </ul>
    </section>
  );
}
