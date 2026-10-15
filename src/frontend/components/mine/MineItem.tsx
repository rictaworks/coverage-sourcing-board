import Link from 'next/link';
import { MINE_STRINGS } from '../../../config/strings/mine';
import type { MineItemView } from '../../lib/api/mineApi';
import styles from './mine.module.css';

/**
 * 投稿の 1 件。状態は文字で示し（色だけに頼らない）、地点名・説明文・自由記述は、テキストとして描画します。
 */
export function MineItem({ item }: { readonly item: MineItemView }) {
  const headingId = `mine-item-${item.id}`;
  return (
    <li className={styles.item}>
      <article className={styles.article} aria-labelledby={headingId}>
        <img className={styles.thumb} src={item.imageSrc} alt={MINE_STRINGS.imageAlt} loading="lazy" />
        <div className={styles.body}>
          <h2 id={headingId} className={styles.status}>
            {item.statusLabel}
          </h2>
          {item.acceptedNotice === null ? null : <p className={styles.notice}>{item.acceptedNotice}</p>}
          <p className={styles.meta}>{item.shotMonthLabel}</p>
          <dl className={styles.fields}>
            <dt>{MINE_STRINGS.spotNameLabel}</dt>
            <dd>{item.spotName === '' ? MINE_STRINGS.emptyValue : item.spotName}</dd>
            <dt>{MINE_STRINGS.captionLabel}</dt>
            <dd>{item.caption === '' ? MINE_STRINGS.emptyValue : item.caption}</dd>
          </dl>
          {item.returnView === null ? null : (
            <section className={styles.returnBox} aria-label={MINE_STRINGS.returnReasonLabel}>
              <dl className={styles.fields}>
                <dt>{MINE_STRINGS.returnReasonLabel}</dt>
                <dd>{item.returnView.reasonLabel}</dd>
                <dt>{MINE_STRINGS.freeTextLabel}</dt>
                <dd>{item.returnView.freeText === '' ? MINE_STRINGS.noFreeText : item.returnView.freeText}</dd>
              </dl>
              <p className={styles.meta}>{item.returnView.resubmitNotice}</p>
              {item.returnView.resubmitHref === null ? null : (
                <p>
                  <Link className={styles.link} href={item.returnView.resubmitHref}>
                    {MINE_STRINGS.resubmitLabel}
                  </Link>
                </p>
              )}
            </section>
          )}
        </div>
      </article>
    </li>
  );
}
