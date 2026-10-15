import { APP_STRINGS } from '../../config/strings';
import { TOP_STRINGS } from '../../config/strings/top';
import { Icon } from '../components/common/Icon';
import { faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { RoleSwitch } from '../components/top/RoleSwitch';
import styles from './top.module.css';

/** トップ：役割の切替、データの消去時刻の表示、役割に応じた画面へのリンク。 */
export default function HomePage() {
  return (
    <>
      <h1>{APP_STRINGS.pageTitle}</h1>
      <p>{TOP_STRINGS.lead}</p>
      <p className={styles.erase}>
        <Icon icon={faTrashCan} /> {TOP_STRINGS.eraseNotice}
      </p>
      <RoleSwitch />
    </>
  );
}
