import type { Metadata } from 'next';
import { Suspense } from 'react';
import { COMMON_STRINGS } from '../../../config/strings/common';
import { PAGE_NAMES, PAGE_TITLES } from '../../../config/strings/layout';
import { SubmitScreen } from '../../components/submit/SubmitScreen';

export const metadata: Metadata = {
  title: PAGE_TITLES.submit,
};

/** 投稿の画面（写真・入力・一次判定・送信・判定結果）。判定結果は同じ画面に出します（独立した URL は作りません）。 */
export default function SubmitPage() {
  return (
    <section>
      <h1>{PAGE_NAMES.submit}</h1>
      <Suspense fallback={<p role="status">{COMMON_STRINGS.loading}</p>}>
        <SubmitScreen />
      </Suspense>
    </section>
  );
}
