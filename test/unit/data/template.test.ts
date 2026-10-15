import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULE_DEFAULTS } from '../../../src/config/defaults';
import { LIMITS } from '../../../src/config/limits';
import { TEXT_SEPARATORS } from '../../../src/config/strings/common';
import { PREFECTURE_NAMES } from '../../../src/config/strings/prefectures';
import { PREFECTURE_CODES } from '../../../src/core/api/contract';
import { normalizeText } from '../../../src/core/text/normalize';

interface TemplateArea {
  readonly id: string;
  readonly prefecture: string;
  readonly label: string;
}

interface TemplatePeriod {
  readonly id: string;
  readonly label: string;
  readonly months: readonly number[];
}

interface TemplateFile {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly requiredPerCell: number;
  readonly areas: readonly TemplateArea[];
  readonly periods: readonly TemplatePeriod[];
  readonly acceptRule: {
    readonly ratio: { readonly width: number; readonly height: number };
    readonly tolerance: number;
    readonly orientation: string;
    readonly formats: readonly string[];
    readonly minShortPx: number;
    readonly blurMin: number;
    readonly dupDistance: number;
    readonly daytimeRequired: boolean;
    readonly maxInputBytes: number;
    readonly maxPixels: number;
  };
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const template = JSON.parse(
  readFileSync(join(REPO_ROOT, 'data', 'templates', 'shikoku-landscape.json'), 'utf8'),
) as TemplateFile;

describe('テンプレート「四国 風景写真」（requirements 6 章のマスタデータの件数）', () => {
  it('エリアは 21 件で、県ごとに 徳島 6・香川 5・愛媛 3・高知 7 です', () => {
    expect(template.areas).toHaveLength(21);
    const countByPrefecture = new Map<string, number>();
    for (const area of template.areas) {
      countByPrefecture.set(area.prefecture, (countByPrefecture.get(area.prefecture) ?? 0) + 1);
    }
    expect(countByPrefecture.get('tokushima')).toBe(6);
    expect(countByPrefecture.get('kagawa')).toBe(5);
    expect(countByPrefecture.get('ehime')).toBe(3);
    expect(countByPrefecture.get('kochi')).toBe(7);
  });

  it('県のコードは英字で、表示名（config）を持ちます', () => {
    for (const area of template.areas) {
      expect((PREFECTURE_CODES as readonly string[]).includes(area.prefecture)).toBe(true);
    }
    expect(Object.keys(PREFECTURE_NAMES).sort()).toEqual([...PREFECTURE_CODES].sort());
  });

  it('正規化（normalizeText）した区分値に重複がありません', () => {
    const normalized = template.areas.map((area) => normalizeText(area.label));
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it('複合表記の 1 件（美波町・海陽町）は、1 つのエリアとして保たれます', () => {
    const compound = template.areas.filter((area) => normalizeText(area.label).includes(TEXT_SEPARATORS.compound));
    expect(compound).toHaveLength(1);
    expect(normalizeText(compound[0].label).split(TEXT_SEPARATORS.compound)).toHaveLength(2);
  });

  it('期間は 4 件で、各月（1〜12）がちょうど 1 つの期間に入ります', () => {
    expect(template.periods).toHaveLength(4);
    const counts = new Map<number, number>();
    for (const period of template.periods) {
      for (const month of period.months) {
        counts.set(month, (counts.get(month) ?? 0) + 1);
      }
    }
    for (let month = 1; month <= 12; month += 1) {
      expect(counts.get(month)).toBe(1);
    }
    expect(counts.size).toBe(12);
  });

  it('マスは エリア × 期間 で 84 件になります', () => {
    expect(template.areas.length * template.periods.length).toBe(84);
  });

  it('マスの必要数の初期値は 1 以上の整数で、全体が保存上限（200 件）に収まります', () => {
    expect(Number.isInteger(template.requiredPerCell)).toBe(true);
    expect(template.requiredPerCell).toBeGreaterThanOrEqual(1);
    const total = template.requiredPerCell * template.areas.length * template.periods.length;
    expect(total).toBeLessThanOrEqual(LIMITS.maxSavedSubmissions);
  });

  it('受入条件 1 件は、既定値（RULE_DEFAULTS）と一致します', () => {
    const rule = template.acceptRule;
    expect(rule.ratio.width / rule.ratio.height).toBeCloseTo(
      RULE_DEFAULTS.aspectRatio.width / RULE_DEFAULTS.aspectRatio.height,
      10,
    );
    expect(rule.tolerance).toBe(RULE_DEFAULTS.aspectTolerance);
    expect(rule.orientation).toBe(RULE_DEFAULTS.orientation);
    expect([...rule.formats].sort()).toEqual(['jpeg', 'png']);
    expect(rule.minShortPx).toBe(RULE_DEFAULTS.minShortSidePx);
    expect(rule.blurMin).toBe(RULE_DEFAULTS.focusFail);
    expect(rule.dupDistance).toBe(RULE_DEFAULTS.phashDuplicateMax);
    expect(rule.daytimeRequired).toBe(true);
    expect(rule.maxInputBytes).toBe(RULE_DEFAULTS.maxInputBytes);
    expect(rule.maxPixels).toBe(RULE_DEFAULTS.maxInputPixels);
  });

  it('境界データ（bbox）は持ちません。出典とライセンスは data/README.md に書きます', () => {
    for (const area of template.areas) {
      expect(Object.keys(area)).not.toContain('bbox');
    }
    expect(template.source.length).toBeGreaterThan(0);
  });
});
