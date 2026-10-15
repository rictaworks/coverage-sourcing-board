import { faCommentDots } from '@fortawesome/free-solid-svg-icons';
import { LAYOUT_STRINGS } from '../../../config/strings/layout';
import { Icon } from '../common/Icon';
import styles from './layout.module.css';

/** 右下に固定の「ご相談はこちら」（requirements 4.1）。 */
export function ConsultButton() {
  return (
    <a className={styles.consult} href={LAYOUT_STRINGS.consultHref}>
      <Icon icon={faCommentDots} />
      <span>{LAYOUT_STRINGS.consultLabel}</span>
    </a>
  );
}
