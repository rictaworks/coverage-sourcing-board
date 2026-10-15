import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** src/core/campaign の実装ファイルの一覧です。 */
const CAMPAIGN_CORE_DIR = join(process.cwd(), 'src', 'core', 'campaign');
const CAMPAIGN_CORE_FILES = readdirSync(CAMPAIGN_CORE_DIR)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(CAMPAIGN_CORE_DIR, name));

/** ひらがな・カタカナ・漢字・全角記号の範囲です。 */
const JAPANESE_PATTERN = /[぀-ヿ㐀-鿿＀-￯]/;

/** コメント（/* ... *\/ と // ...）を取り除きます。コメントは日本語で書いてよいため、検査の対象は文字列とコードだけにします。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** DOM・fetch・Node 専用の API の名前です。 */
const PLATFORM_API_PATTERN =
  /\b(document|window|HTMLCanvasElement|fetch|Buffer|process|require|crypto|localStorage)\b/;

describe('src/core/campaign has no hard-coded Japanese strings or platform APIs', () => {
  it('finds the campaign core modules to check', () => {
    expect(CAMPAIGN_CORE_FILES.length).toBeGreaterThanOrEqual(6);
  });

  it.each(CAMPAIGN_CORE_FILES.map((file) => [file.split('/').pop(), file]))(
    '%s contains no Japanese characters',
    (_name, file) => {
      expect(stripComments(readFileSync(file, 'utf8'))).not.toMatch(JAPANESE_PATTERN);
    },
  );

  it.each(CAMPAIGN_CORE_FILES.map((file) => [file.split('/').pop(), file]))(
    '%s uses no DOM, fetch, or Node API',
    (_name, file) => {
      expect(stripComments(readFileSync(file, 'utf8'))).not.toMatch(PLATFORM_API_PATTERN);
    },
  );
});
