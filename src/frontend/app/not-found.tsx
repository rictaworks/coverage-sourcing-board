import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_STRINGS } from '../../config/strings';
import { LAYOUT_STRINGS, PAGE_TITLES } from '../../config/strings/layout';
import styles from '../components/layout/layout.module.css';

export const metadata: Metadata = {
  title: PAGE_TITLES.notFound,
};

export default function NotFound() {
  return (
    <section className={styles.pending}>
      <h1>{APP_STRINGS.notFoundMessage}</h1>
      <p>
        <Link href="/">{LAYOUT_STRINGS.backToTop}</Link>
      </p>
    </section>
  );
}
