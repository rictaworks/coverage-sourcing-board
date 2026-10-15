import type { Metadata } from 'next';
import { PAGE_NAMES, PAGE_TITLES } from '../../../config/strings/layout';
import { PendingPage } from '../../components/layout/PendingPage';

export const metadata: Metadata = {
  title: PAGE_TITLES.campaign,
};

/** 準備中の画面。後続の Issue がこの画面を置き換える。 */
export default function CampaignPage() {
  return <PendingPage title={PAGE_NAMES.campaign} />;
}
