import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** src/core/validation の実装ファイルの一覧です。 */
const VALIDATION_CORE_DIR = join(process.cwd(), 'src', 'core', 'validation');
const VALIDATION_CORE_FILES = readdirSync(VALIDATION_CORE_DIR)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(VALIDATION_CORE_DIR, name));

/** ひらがな・カタカナ・漢字・全角記号の範囲です。 */
const JAPANESE_PATTERN = /[぀-ヿ㐀-鿿＀-￯]/;

/** コメント（/* ... *\/ と // ...）を取り除きます。コメントは日本語で書いてよいため、検査の対象は文字列とコードだけにします。 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** DOM・Canvas・fetch・Node 固有の API の名前です。判定はこれらに依存しません。 */
const PLATFORM_API_PATTERN =
  /\b(document|window|HTMLCanvasElement|OffscreenCanvas|CanvasRenderingContext2D|fetch|Buffer|process|require)\b/;

describe('src/core/validation has no hard-coded Japanese strings or platform APIs', () => {
  it('finds the validation core modules to check', () => {
    expect(VALIDATION_CORE_FILES.length).toBeGreaterThanOrEqual(4);
  });

  it.each(VALIDATION_CORE_FILES.map((file) => [file.split('/').pop(), file]))(
    '%s contains no Japanese characters',
    (_name, file) => {
      expect(stripComments(readFileSync(file, 'utf8'))).not.toMatch(JAPANESE_PATTERN);
    },
  );

  it.each(VALIDATION_CORE_FILES.map((file) => [file.split('/').pop(), file]))(
    '%s uses no DOM, Canvas, fetch, or Node API',
    (_name, file) => {
      expect(stripComments(readFileSync(file, 'utf8'))).not.toMatch(PLATFORM_API_PATTERN);
    },
  );
});
