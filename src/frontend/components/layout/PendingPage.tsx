import Link from 'next/link';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { LAYOUT_STRINGS } from '../../../config/strings/layout';
import { Icon } from '../common/Icon';
import styles from './layout.module.css';

/** 準備中の画面の共通の部品。各機能の Issue が、自分の画面をこの部品から置き換える。 */
export function PendingPage({ title }: { readonly title: string }) {
  return (
    <section className={styles.pending}>
      <h1>{title}</h1>
      <p>
        <Icon icon={faCircleInfo} /> {LAYOUT_STRINGS.pendingNotice}
      </p>
      <p>
        <Link href="/">{LAYOUT_STRINGS.backToTop}</Link>
      </p>
    </section>
  );
}
