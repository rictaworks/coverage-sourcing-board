'use client';

import { PREPARE_STRINGS } from '../../../config/strings/prepare';
import type { PreparedImage } from '../../lib/image/preparedImage';
import styles from './prepare.module.css';

/** 整形後の画像（保存用）と、寸法・バイト数を表示します。 */
export function PreparedPreview({
  prepared,
  previewUrl,
}: {
  readonly prepared: PreparedImage;
  readonly previewUrl: string;
}) {
  return (
    <div className={styles.preview}>
      <img src={previewUrl} alt={PREPARE_STRINGS.previewHeading} className={styles.previewImage} />
      <ul className={styles.facts}>
        <li>{PREPARE_STRINGS.previewSize(prepared.saved.width, prepared.saved.height)}</li>
        <li>{PREPARE_STRINGS.previewBytes(Math.round(prepared.saved.bytes / 1024))}</li>
        <li>{PREPARE_STRINGS.previewLongSide}</li>
      </ul>
    </div>
  );
}
