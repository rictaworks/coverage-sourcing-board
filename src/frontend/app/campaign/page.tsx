import type { Metadata } from 'next';
import { CAMPAIGN_SETTINGS_STRINGS } from '../../../config/strings/campaignSettings';
import { PAGE_NAMES, PAGE_TITLES } from '../../../config/strings/layout';
import { CampaignSettings } from '../../components/campaign/CampaignSettings';
import styles from '../../components/campaign/campaign.module.css';

export const metadata: Metadata = {
  title: PAGE_TITLES.campaign,
};

/** キャンペーン設定の画面（D6）。編集の部品は、クライアントの部品（CampaignSettings）が持ちます。 */
export default function CampaignPage() {
  return (
    <div className={styles.page}>
      <h1>{PAGE_NAMES.campaign}</h1>
      <p>{CAMPAIGN_SETTINGS_STRINGS.intro}</p>
      <CampaignSettings />
    </div>
  );
}
