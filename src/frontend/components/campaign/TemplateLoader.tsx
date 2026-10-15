'use client';

import { CAMPAIGN_SETTINGS_STRINGS } from '../../../config/strings/campaignSettings';
import styles from './campaign.module.css';

/** キャンペーンが無いときの読み込みの部品。押すと、テンプレートを読み込みます。 */
export function TemplateLoader({
  busy,
  onLoad,
}: {
  readonly busy: boolean;
  readonly onLoad: () => void;
}) {
  return (
    <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={busy} onClick={onLoad}>
        {CAMPAIGN_SETTINGS_STRINGS.loadButton}
      </button>
      {busy ? <p role="status" className={styles.help}>{CAMPAIGN_SETTINGS_STRINGS.loadingTemplate}</p> : null}
    </div>
  );
}
