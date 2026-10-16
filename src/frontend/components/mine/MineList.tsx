import { MINE_STRINGS } from '../../../config/strings/mine';
import type { MineItemView } from '../../lib/api/mineApi';
import { MineItem } from './MineItem';
import styles from './mine.module.css';

/** 自分の投稿の一覧（新しい順）。 */
export function MineList({ items }: { readonly items: readonly MineItemView[] }) {
  return (
    <ul className={styles.list} aria-label={MINE_STRINGS.listLabel}>
      {items.map((item) => (
        <MineItem key={item.id} item={item} />
      ))}
    </ul>
  );
}
