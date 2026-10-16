import type { Metadata } from 'next';
import { PAGE_NAMES, PAGE_TITLES } from '../../../config/strings/layout';
import { ReviewScreen } from '../../components/review/ReviewScreen';
import styles from '../../components/review/review.module.css';

export const metadata: Metadata = {
  title: PAGE_TITLES.review,
};

/** 確認キューの画面（D7）。API の読み書きと操作の部品は、クライアントの部品（ReviewScreen）が持ちます。 */
export default function ReviewPage() {
  return (
    <div className={styles.page}>
      <h1>{PAGE_NAMES.review}</h1>
      <ReviewScreen />
    </div>
  );
}
