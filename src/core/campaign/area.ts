import { LIMITS } from '../../config/limits';
import { AREA_FORBIDDEN_CHARS } from '../../config/strings/campaign';
import { TEXT_SEPARATORS } from '../../config/strings/common';
import { normalizeText } from '../text/normalize';
import { CampaignError } from './period';

/**
 * 区分値（市町村など）。「・」区切りの複合地域は 1 つの区分値として保ちます（requirements 5 章）。
 * 地点の判定では、複合地域のどちらの町の名前でも一致とみなします。
 */
export class Area {
  /** 正規化した区分値（表示と重複の判定に使う）。 */
  readonly label: string;
  /** 複合地域の構成要素（単独の地域なら 1 つだけ）。 */
  readonly components: readonly string[];

  private constructor(label: string, components: readonly string[]) {
    this.label = label;
    this.components = components;
  }

  /** 表記を正規化して区分値を作ります。空、または構成要素が空になる値は例外にします。 */
  static fromLabel(raw: string): Area {
    const label = normalizeText(raw);
    if (label === '') {
      throw new CampaignError('AREA_INVALID');
    }
    if (AREA_FORBIDDEN_CHARS.test(label)) {
      throw new CampaignError('AREA_INVALID');
    }
    if ([...label].length > LIMITS.areaLabelMaxChars) {
      throw new CampaignError('AREA_TOO_LONG');
    }
    const components = label.split(TEXT_SEPARATORS.compound);
    if (components.some((component) => component === '')) {
      throw new CampaignError('AREA_INVALID');
    }
    return new Area(label, components);
  }

  /** 地名が、この区分値と一致するかを判定します。複合地域は、どちらの町の名前でも一致します。 */
  matchesPlace(placeName: string): boolean {
    const name = normalizeText(placeName);
    if (name === '') {
      return false;
    }
    return name === this.label || this.components.includes(name);
  }
}
