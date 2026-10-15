import type { Metadata } from 'next';
import { PAGE_NAMES, PAGE_TITLES } from '../../../config/strings/layout';
import { CoverageScreen } from '../../components/coverage/CoverageScreen';
import styles from '../../components/coverage/coverage.module.css';

export const metadata: Metadata = {
  title: PAGE_TITLES.coverage,
};

/** 充足マップの画面（requirements 4 章）。表と「いま求めている場所」は、読み込んだ後に描画します。 */
export default function CoveragePage() {
  return (
    <section className={styles.page}>
      <h1>{PAGE_NAMES.coverage}</h1>
      <CoverageScreen />
    </section>
  );
}
