import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fortawesome/fontawesome-svg-core/styles.css';
import './globals.css';
import { APP_STRINGS } from '../../config/strings';
import { AmberBanner } from '../components/layout/AmberBanner';
import { Analytics } from '../components/layout/Analytics';
import { ConsultButton } from '../components/layout/ConsultButton';
import { SiteFooter } from '../components/layout/SiteFooter';
import { SiteHeader } from '../components/layout/SiteHeader';
import { shouldLoadAnalytics } from '../lib/appEnv';

export const metadata: Metadata = {
  title: APP_STRINGS.pageTitle,
};

/** 全画面の共通のレイアウト（requirements 4.1）。GA4 は APP_ENV が production のときだけ読み込む。 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AmberBanner />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <ConsultButton />
        <Analytics enabled={shouldLoadAnalytics(process.env.APP_ENV)} />
      </body>
    </html>
  );
}
