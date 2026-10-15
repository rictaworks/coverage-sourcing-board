import { config, type IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

/** CSS を実行時に差し込まない（CSP の style-src を守るため）。CSS は layout.tsx で読み込む。 */
config.autoAddCss = false;

/** Font Awesome のアイコン。装飾として扱い、読み上げの対象から外す（絵文字は使わない）。 */
export function Icon({ icon }: { readonly icon: IconDefinition }) {
  return <FontAwesomeIcon icon={icon} fixedWidth />;
}
