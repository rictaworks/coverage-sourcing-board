# 基盤の仕様：型・環境・既定値と上限・文言（A2）

確認日：2026-10-16（JST）。この文書は、実装済みの基盤の仕様です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 共通の型（外部に依存しない） | `src/core/types.ts` |
| 表記ゆれの正規化（純粋な関数） | `src/core/text/normalize.ts` |
| デバッグのトレース | `src/core/trace.ts` |
| APP_ENV の判定 | `src/config/env.ts` |
| 既定値（requirements 3.0） | `src/config/defaults.ts` |
| 上限（requirements 3.8 と入力の上限） | `src/config/limits.ts` |
| 共通の文言・区切り文字 | `src/config/strings/common.ts` |
| ハードコード検査 | `test/unit/hardcode.test.ts` |

## 2. 環境の判定（APP_ENV）

- `resolveAppEnv(raw)` は `development` と `production` だけを受け付けます。
- 値が無い・空・その他の値は例外を投げます。フォールバックはしません。
- 例外の文言は `COMMON_STRINGS.errorInvalidAppEnv` です。値そのものは含めません。

## 3. トレース（DebugTracer）

- `summary` は development と production の両方で出力します。`detail` は development だけで出力します。
- 1 行の JSON です。`ts` は JST（`+09:00`）です。
- 値は数値・真偽値・null だけを受け付けます。文字列（IP、Cookie、説明文など）は型で拒否します。
- `name` とフィールド名は、`src/config/trace.ts` の許可リスト（`TRACE_NAMES`・`TRACE_FIELD_NAMES`）にあるものだけを受け付けます。型で拒否し、型を迂回した呼び出しは実行時に例外にします（例外の文言に拒否した値は含めません）。
- 出力先（sink）と時計は引数で渡します。

## 4. 既定値と上限

- 既定値は `RULE_DEFAULTS`、上限は `LIMITS` に数値で置きます。数値の出典は requirements 3.0・3.8 です。
- MB は 1,024 × 1,024 バイトとして扱います（5 MB は 5,242,880 バイト）。
- 次の値は requirements に数値がないため、仮の値です。実測や運用の結果で調整します。
  - 加工の偏り（彩度 0.05〜0.85、コントラスト 0.1〜0.8 の外は要確認）
  - 差し戻しの自由記述の上限（200 字）
  - 分類用の縮小画像の最大バイト数（150,000 バイト）
- 保存画像の上限 1,900,000 バイトは、Issue（A2）の値です。requirements の「2 MB 以下」を満たします。

## 5. 文言

- 画面・API の文言は `src/config/strings/` に置きます。共通の文言は `common.ts`、機能ごとの文言は機能の Issue が `<機能>.ts` に置きます。
- 複合表記の区切り（「・」）は `TEXT_SEPARATORS.compound` に置きます。

## 6. 表記ゆれの正規化

- `normalizeText` は、NFKC、空白の連続の除去と前後の除去、複合表記の区切りの前後の空白の除去を行います。
- 「美波町・海陽町」は 1 つの値として保たれます。

## 7. ハードコード検査

- 対象の拡張子は `.ts`・`.tsx`・`.js`・`.jsx`・`.mjs`・`.cjs`・`.mts`・`.cts` の 8 種です。
- 対象は `src/` と `test/` です。
- 除外は、次の 2 つのフォルダだけです。別の階層の同名フォルダ（例：`src/core/test/fixtures/`）は検査します。
  - リポジトリ直下の `src/config/`。別の階層の `config` フォルダは検査します。
  - リポジトリ直下の `test/fixtures/` だけです。テストの入力データ（と、その期待値）だけを置く場所で、表示文は置きません。行ごとの許可マーカーはありません。
  - 上の 2 つのほかに、リポジトリ直下の `out`・`.next`・`node_modules` を読み飛ばします（深い階層の同名フォルダは検査します）。
  - 検査器そのもの（`test/unit/hardcode.test.ts`）は、検査用の日本語データを持つため対象外です。
- TypeScript の AST で、文字列リテラル・テンプレートリテラル・JSX のテキストを調べます。コメントは対象外です。
- 日本語（ひらがな・カタカナ・漢字・全角記号）を含むものがあれば、ファイル名と行番号を出して失敗します。
