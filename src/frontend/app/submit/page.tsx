import type { Metadata } from 'next';
import { PAGE_NAMES, PAGE_TITLES } from '../../../config/strings/layout';
import { PrepareFlow } from '../../components/prepare/PrepareFlow';

export const metadata: Metadata = {
  title: PAGE_TITLES.submit,
};

/** 投稿の画面。現時点では、画像の整形の手順だけを置きます（入力欄と判定と送信は後続の Issue が足します）。 */
export default function SubmitPage() {
  return (
    <section>
      <h1>{PAGE_NAMES.submit}</h1>
      <PrepareFlow />
    </section>
  );
}
