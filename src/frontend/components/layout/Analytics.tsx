import Script from 'next/script';
import { GA4_MEASUREMENT_ID, GA4_SCRIPT_URL } from '../../../config/analytics';

/**
 * GA4 の読み込み。enabled が false のとき（開発など）は何も出力しない。
 * enabled の判定は呼び出し側（layout.tsx）が shouldLoadAnalytics で行う。
 */
export function Analytics({ enabled }: { readonly enabled: boolean }) {
  if (!enabled) {
    return null;
  }
  const configScript = `window.dataLayer = window.dataLayer || []; function gtag(){window.dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${GA4_MEASUREMENT_ID}');`;
  return (
    <>
      <Script src={`${GA4_SCRIPT_URL}?id=${GA4_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="ga4-config" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: configScript }} />
    </>
  );
}
