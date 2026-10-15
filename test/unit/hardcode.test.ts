import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const JAPANESE_PATTERN = /[　-〿぀-ヿ㐀-䶿一-鿿！-ﾟ]/;
const TARGET_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const SCAN_ROOTS = ['src', 'test'];
/** 検査器そのもの（日本語の検査用データを持つ）だけは、検査の対象から外す。 */
const SELF_FILE = 'test/unit/hardcode.test.ts';
const TEST_TITLE_CALLEES = new Set(['describe', 'it', 'test']);
/** リポジトリ直下のこれらのフォルダだけを読み飛ばす。深い階層の同名フォルダは検査する。 */
const SKIPPED_ROOT_DIRECTORIES = new Set(['node_modules', '.next', 'out']);
/** Next.js アプリ（src/frontend）が出力する生成物。ソースから作られるため検査の対象から外す。 */
const GENERATED_APP_DIRECTORIES = ['.next', 'out'];

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** 日本語の文字列リテラルと JSX のテキストを、AST で探す検査器。コメントは AST に含まれないため対象外になる。 */
class JapaneseLiteralScanner {
  scanSource(fileName: string, source: string): Violation[] {
    const kind = this.scriptKind(fileName);
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, kind);
    const violations: Violation[] = [];
    const visit = (node: ts.Node): void => {
      const text = this.literalText(node);
      if (text !== null && JAPANESE_PATTERN.test(text) && !this.isTestTitle(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({ file: fileName, line: line + 1, text: text.trim() });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return violations;
  }

  /** excludedDirs（絶対パス）と、repoRoot 直下の out・.next・node_modules だけを除く。同名の別の階層は除かない。 */
  listTargets(repoRoot: string, rootDir: string, excludedDirs: string[]): string[] {
    const targets: string[] = [];
    const excluded = new Set(excludedDirs.map((dir) => resolve(dir)));
    const repo = resolve(repoRoot);
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          const isSkippedRootDir = resolve(dir) === repo && SKIPPED_ROOT_DIRECTORIES.has(entry);
          if (!isSkippedRootDir && !excluded.has(resolve(path))) {
            walk(path);
          }
          continue;
        }
        if (TARGET_EXTENSIONS.some((extension) => entry.endsWith(extension))) {
          targets.push(path);
        }
      }
    };
    walk(rootDir);
    return targets;
  }

  scanProject(repoRoot: string): Violation[] {
    // src/frontend は Next.js のアプリの根のため、.next と out（生成物）は src/frontend 直下にできる。生成物は検査しない。
    const excludedDirs = [
      join(repoRoot, 'src', 'config'),
      join(repoRoot, 'test', 'fixtures'),
      ...GENERATED_APP_DIRECTORIES.map((dir) => join(repoRoot, 'src', 'frontend', dir)),
    ];
    return SCAN_ROOTS.flatMap((root) => this.listTargets(repoRoot, join(repoRoot, root), excludedDirs))
      .map((path) => relative(repoRoot, path).split(sep).join('/'))
      .filter((relativePath) => relativePath !== SELF_FILE)
      .flatMap((relativePath) => this.scanSource(relativePath, readFileSync(join(repoRoot, relativePath), 'utf8')));
  }

  private scriptKind(fileName: string): ts.ScriptKind {
    if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
    if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
    if (/\.(js|mjs|cjs)$/.test(fileName)) return ts.ScriptKind.JS;
    return ts.ScriptKind.TS;
  }

  /** テストの題名（describe・it・test の第 1 引数）は、説明文であり表示文ではない。 */
  private isTestTitle(node: ts.Node): boolean {
    const parent = node.parent;
    if (!parent || !ts.isCallExpression(parent) || parent.arguments[0] !== node) return false;
    // it.each(...)('題名') は、呼び出しの結果を呼び出す形になる。
    const target = ts.isCallExpression(parent.expression) ? parent.expression.expression : parent.expression;
    const callee = ts.isPropertyAccessExpression(target) ? target.expression : target;
    return ts.isIdentifier(callee) && TEST_TITLE_CALLEES.has(callee.text);
  }

  private literalText(node: ts.Node): string | null {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      return node.text;
    }
    return null;
  }
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('JapaneseLiteralScanner（検査器そのもの）', () => {
  const scanner = new JapaneseLiteralScanner();

  it('文字列リテラルの日本語を違反として、行番号つきで検出します', () => {
    const violations = scanner.scanSource('src/core/sample.ts', "const a = 1;\nconst label = '表示';\n");
    expect(violations).toEqual([{ file: 'src/core/sample.ts', line: 2, text: '表示' }]);
  });

  it('テンプレートリテラルと JSX のテキストの日本語も検出します', () => {
    expect(scanner.scanSource('src/core/a.ts', 'const t = `日本語 ${1}`;')).toHaveLength(1);
    expect(scanner.scanSource('src/frontend/b.tsx', 'export const C = () => <p>こんにちは</p>;')).toHaveLength(1);
  });

  it('コメントだけの日本語は検出しません（行コメント・ブロックコメント・JSX のコメント）', () => {
    const source = [
      '// 日本語のコメント',
      '/* 日本語のブロックコメント */',
      'export const C = () => <div>{/* 日本語のコメント */}</div>;',
    ].join('\n');
    expect(scanner.scanSource('src/frontend/c.tsx', source)).toEqual([]);
  });

  it('日本語を含まない文字列は検出しません', () => {
    expect(scanner.scanSource('src/core/d.ts', "const s = 'ABC 123';")).toEqual([]);
  });

  it('除外は src/config/ だけです。別の階層の config フォルダは検査します（抜け道の防止）', () => {
    const root = mkdtempSync(join(tmpdir(), 'hardcode-'));
    mkdirSync(join(root, 'src', 'config'), { recursive: true });
    mkdirSync(join(root, 'src', 'core', 'config'), { recursive: true });
    mkdirSync(join(root, 'src', 'frontend', 'config'), { recursive: true });
    writeFileSync(join(root, 'src', 'config', 'a.ts'), "export const a = '表示';");
    writeFileSync(join(root, 'src', 'core', 'config', 'b.ts'), "export const b = '表示';");
    writeFileSync(join(root, 'src', 'frontend', 'config', 'c.ts'), "export const c = '表示';");
    const targets = scanner.listTargets(root, join(root, 'src'), [join(root, 'src', 'config')]).map((p) => relative(root, p).split(sep).join('/'));
    expect(targets.sort()).toEqual(['src/core/config/b.ts', 'src/frontend/config/c.ts']);
  });

  it('読み飛ばすのはリポジトリ直下の out・.next・node_modules だけです。深い階層の同名フォルダは検査します', () => {
    const root = mkdtempSync(join(tmpdir(), 'hardcode-'));
    for (const dir of ['out', '.next', 'node_modules']) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'top.ts'), "export const a = '表示';");
      mkdirSync(join(root, 'src', 'core', dir), { recursive: true });
      writeFileSync(join(root, 'src', 'core', dir, 'deep.ts'), "export const a = '表示';");
    }
    const rel = (paths: string[]) => paths.map((p) => relative(root, p).split(sep).join('/')).sort();
    expect(rel(scanner.listTargets(root, root, [join(root, 'src', 'config')]))).toEqual([
      'src/core/.next/deep.ts',
      'src/core/node_modules/deep.ts',
      'src/core/out/deep.ts',
    ]);
  });

  it('行末にマーカーのような書き方があっても、日本語を検出します（マーカーの仕組みは存在しません）', () => {
    const source = [
      "expect(f('ＡＢＣ')).toBe('ABC'); // hardcode-allow: 入力データ",
      "const label = '表示'; // hardcode-allow",
    ].join('\n');
    expect(scanner.scanSource('src/core/x.ts', source).map((v) => v.line)).toEqual([1, 2]);
  });

  it('test/unit/ の日本語の表示文は検出し、test/fixtures/ の日本語は対象外です', () => {
    const root = mkdtempSync(join(tmpdir(), 'hardcode-'));
    mkdirSync(join(root, 'test', 'unit'), { recursive: true });
    mkdirSync(join(root, 'test', 'fixtures'), { recursive: true });
    mkdirSync(join(root, 'src', 'core', 'test', 'fixtures'), { recursive: true });
    writeFileSync(join(root, 'test', 'unit', 'a.test.ts'), "export const label = '表示';");
    writeFileSync(join(root, 'test', 'fixtures', 'data.ts'), "export const input = '入力';");
    writeFileSync(join(root, 'src', 'core', 'test', 'fixtures', 'deep.ts'), "export const input = '入力';");
    expect(scanner.scanProject(root).map((v) => v.file).sort()).toEqual(['src/core/test/fixtures/deep.ts', 'test/unit/a.test.ts']);
  });

  it('src/frontend/.next と src/frontend/out（ビルド成果物）は除外し、ほかの階層の同名フォルダは検査します', () => {
    const root = mkdtempSync(join(tmpdir(), 'hardcode-'));
    mkdirSync(join(root, 'test'), { recursive: true });
    for (const dir of ['src/frontend/.next', 'src/frontend/out', 'src/core/out', 'src/frontend/app/out']) {
      mkdirSync(join(root, dir), { recursive: true });
      writeFileSync(join(root, dir, 'built.js'), "export const a = '表示';");
    }
    expect(scanner.scanProject(root).map((v) => v.file).sort()).toEqual(['src/core/out/built.js', 'src/frontend/app/out/built.js']);
  });

  it('既存の日本語の表示文（画面の文言）を見逃しません', () => {
    const source = "export const Page = () => <h1>{'素材調達ボード'}</h1>;\nexport const msg = 'エラーが発生しました';";
    expect(scanner.scanSource('src/frontend/app/page.tsx', source)).toHaveLength(2);
  });

  it('.js・.jsx・.mjs・.cjs・.mts・.cts・.ts・.tsx のすべてを対象にし、日本語を検出します', () => {
    const root = mkdtempSync(join(tmpdir(), 'hardcode-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    const names = ['a.js', 'a.jsx', 'a.mjs', 'a.cjs', 'a.mts', 'a.cts', 'a.ts', 'a.tsx'];
    for (const name of names) {
      writeFileSync(join(root, 'src', name), name.endsWith('x') ? 'export const C = () => <p>表示</p>;' : "export const a = '表示';");
    }
    const targets = scanner.listTargets(root, join(root, 'src'), [join(root, 'src', 'config')]);
    expect(targets.map((p) => relative(join(root, 'src'), p)).sort()).toEqual([...names].sort());
    const found = targets.flatMap((p) => scanner.scanSource(p, readFileSync(p, 'utf8')));
    expect(found).toHaveLength(names.length);
  });

  it('テストの題名（describe・it・test の第 1 引数）は検出しませんが、ほかの日本語は検出します', () => {
    expect(scanner.scanSource('test/a.test.ts', "describe('題名', () => { it('題名', () => {}); });")).toEqual([]);
    expect(scanner.scanSource('test/a.test.ts', "it('題名', () => { const s = '表示'; });")).toHaveLength(1);
    expect(scanner.scanSource('test/a.test.ts', "it.each([1])('題名 %j', () => {});")).toEqual([]);
  });

  it('検査対象は src/ 以下の .ts・.tsx・.mjs などで、src/config/ を除き、既知のファイルを必ず含みます（TH2）', () => {
    const targets = scanner.listTargets(REPO_ROOT, join(REPO_ROOT, 'src'), [join(REPO_ROOT, 'src', 'config')]).map((path) => relative(REPO_ROOT, path).split(sep).join('/'));
    expect(targets).toContain('src/worker/index.ts');
    expect(targets).toContain('src/frontend/app/page.tsx');
    expect(targets).toContain('src/frontend/next.config.mjs');
    expect(targets.some((path) => path.startsWith('src/config/'))).toBe(false);
  });
});

describe('ハードコード検査（実リポジトリ）', () => {
  it('src/config/ の外（src と test）に、日本語の文字列リテラルと JSX のテキストがないこと', () => {
    const violations = new JapaneseLiteralScanner().scanProject(REPO_ROOT);
    expect(violations.map((v) => `${v.file}:${v.line} ${v.text}`)).toEqual([]);
  });

  it('Next.js の生成物（src/frontend/.next・out）は検査せず、ソースの日本語は検出します', () => {
    const root = mkdtempSync(join(tmpdir(), 'hardcode-'));
    mkdirSync(join(root, 'src', 'frontend', '.next', 'dev'), { recursive: true });
    mkdirSync(join(root, 'src', 'frontend', 'out'), { recursive: true });
    mkdirSync(join(root, 'src', 'frontend', 'app'), { recursive: true });
    mkdirSync(join(root, 'test'), { recursive: true });
    writeFileSync(join(root, 'src', 'frontend', '.next', 'dev', 'chunk.js'), "export const a = '表示';");
    writeFileSync(join(root, 'src', 'frontend', 'out', 'index.js'), "export const a = '表示';");
    writeFileSync(join(root, 'src', 'frontend', 'app', 'page.tsx'), "export const a = '表示';");
    const files = new JapaneseLiteralScanner().scanProject(root).map((v) => v.file);
    expect(files).toEqual(['src/frontend/app/page.tsx']);
  });
});
