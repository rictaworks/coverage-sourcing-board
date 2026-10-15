import type { Metadata } from 'next';
import { LEGAL_STRINGS } from '../../../config/strings/legal';
import styles from '../../components/layout/layout.module.css';

export const metadata: Metadata = {
  title: LEGAL_STRINGS.title,
};

/** /legal：利用規約・免責事項・連絡先（仮置き）。 */
export default function LegalPage() {
  return (
    <article className={styles.prose}>
      <h1>{LEGAL_STRINGS.heading}</h1>
      <p className={styles.draftNote}>{LEGAL_STRINGS.draftNote}</p>
      {LEGAL_STRINGS.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <section>
        <h2>{LEGAL_STRINGS.contactHeading}</h2>
        <p>{LEGAL_STRINGS.contactLead}</p>
        <p>
          <a href={LEGAL_STRINGS.contactHref}>{LEGAL_STRINGS.contactEmail}</a>
        </p>
      </section>
    </article>
  );
}
