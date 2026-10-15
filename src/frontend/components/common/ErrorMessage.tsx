import { COMMON_STRINGS } from '../../../config/strings/common';
import styles from './common.module.css';

/** エラーの表示。message は呼び出し側が渡す文字列を、テキストとして描画する。 */
export function ErrorMessage({ message, id }: { readonly message: string; readonly id?: string }) {
  return (
    <div id={id} role="alert" className={styles.error}>
      <p className={styles.errorHeading}>{COMMON_STRINGS.errorHeading}</p>
      <p>{message}</p>
    </div>
  );
}
