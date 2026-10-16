import Link from 'next/link';
import { APP_STRINGS } from '../../../config/strings';
import { LAYOUT_STRINGS } from '../../../config/strings/layout';
import styles from './layout.module.css';

/** ヘッダー。ナビの右端に区切り線つきの「← デモ一覧へ」を置く（requirements 4.1）。 */
export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.siteName}>
          {APP_STRINGS.pageTitle}
        </Link>
        <nav className={styles.nav} aria-label={LAYOUT_STRINGS.headerNavLabel}>
          <Link href="/" className={styles.topLink}>
            {LAYOUT_STRINGS.backToTop}
          </Link>
          <a className={styles.backLink} href={LAYOUT_STRINGS.backToDemoListHref}>
            {LAYOUT_STRINGS.backToDemoList}
          </a>
        </nav>
      </div>
    </header>
  );
}
