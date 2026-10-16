import type { Metadata } from 'next';
import { PAGE_NAMES, PAGE_TITLES } from '../../../config/strings/layout';
import { MineScreen } from '../../components/mine/MineScreen';
import styles from '../../components/mine/mine.module.css';

export const metadata: Metadata = {
  title: PAGE_TITLES.mine,
};

/** 自分の投稿の画面（requirements 4 章）。一覧は読み込んだ後に描画します。 */
export default function MinePage() {
  return (
    <section className={styles.screen}>
      <h1>{PAGE_NAMES.mine}</h1>
      <MineScreen />
    </section>
  );
}
