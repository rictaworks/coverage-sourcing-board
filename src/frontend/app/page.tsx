import { APP_STRINGS } from '../../config/strings';

export default function HomePage() {
  return (
    <main>
      <h1>{APP_STRINGS.pageTitle}</h1>
      <p>{APP_STRINGS.devPageNotice}</p>
    </main>
  );
}
