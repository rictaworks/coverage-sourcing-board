import { LAYOUT_STRINGS } from '../../../config/strings/layout';
import { Icon } from '../common/Icon';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import styles from './layout.module.css';

/** 全ページ最上部のアンバーバナー（requirements 4.1）。 */
export function AmberBanner() {
  return (
    <div className={styles.banner} data-testid="amber-banner">
      <Icon icon={faCircleInfo} />
      <div>
        <p>{LAYOUT_STRINGS.amberNoticeDemo}</p>
        <p>{LAYOUT_STRINGS.amberNoticeErase}</p>
      </div>
    </div>
  );
}
