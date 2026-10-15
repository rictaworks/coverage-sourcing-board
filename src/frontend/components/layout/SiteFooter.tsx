import Link from 'next/link';
import { LAYOUT_STRINGS } from '../../../config/strings/layout';
import styles from './layout.module.css';

/** フッター。/legal へのリンクを置く。 */
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <Link href={LAYOUT_STRINGS.footerLegalHref}>{LAYOUT_STRINGS.footerLegalLabel}</Link>
      </div>
    </footer>
  );
}
