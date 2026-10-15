import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { APP_STRINGS } from '../../config/strings';

export const metadata: Metadata = {
  title: APP_STRINGS.pageTitle,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
