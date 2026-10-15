# 画像の特徴量の仕様（B2）

確認日：2026-10-16（JST）。この文書は、実装済みの純粋な関数の仕様です。実装は `src/core/image/` にあり、DOM・Canvas・Node 固有の API を使いません。

## 1. 共通

- 入力は画素の配列 `{ width, height, data }` です（`RgbaImage`、`data` は `Uint8Array` または `Uint8ClampedArray`。1 画素 4 バイトの RGBA、行優先）。構造は ImageData と同じです。
- 幅・高さが 1 以上の整数でない、または `data` の長さが `width × height × 4` と合わないときは `ImageInputError` を投げます。
- すべての関数は入力を書き換えません。
- アルファは使いません。
- エラーの文字列は `src/config/strings/image.ts`、既定値は `src/config/image.ts` にあります。
- 入力画素数の上限（4,000 万画素）は、この関数群を呼ぶ前に、ファイルのヘッダーから寸法を読んで判定します（D3 の担当）。この関数群は上限を判定しません。
- 縮小は呼び出し側の責任です。ラプラシアンと dHash の入力は、長辺 512 px 以下を前提とします。
- `scaleQuantTable` は、品質が 1〜100 の整数でないとき `ImageInputError` を投げます。

## 2. 関数

| 関数 | 入力 | 出力 |
|---|---|---|
| `toGrayscale(rgba)` | RGBA | `GrayImage`（1 画素 1 バイト）。ITU-R BT.601（0.299・0.587・0.114）で求め、四捨五入します。 |
| `estimateJpegQuality(bytes)` | JPEG のバイト列 | `{ status: 'estimated', quality }`（1〜100）または `{ status: 'unavailable', reason }`。reason は `not-jpeg`・`no-quantization-table`・`malformed` です。 |
| `laplacianVariance(gray)` | グレースケール | 3 × 3 のラプラシアン（中心 -4、上下左右 1）の応答の母分散。端の 1 画素は計算しません。3 × 3 未満は例外です。縮小は行いません（512 px への縮小は D3）。 |
| `dHash(gray)` | グレースケール | 面積平均で 9 × 8 に縮小し、各行で左の格子が右より暗ければ 1 とした 64 ビットを、16 文字の小文字の 16 進で返します。 |
| `hammingDistance(a, b)` | 2 つのハッシュ | ビットの違いの数（0〜64）。形式が不正なら例外です（大文字の 16 進は受け付けます）。 |
| `meanLuma(gray)` | グレースケール | 平均輝度（0〜255）。 |
| `colorStats(rgba)` | RGBA | `meanSaturation`（HSV の S の平均、0〜1）と `lumaStdDev`（輝度の母標準偏差、0〜255。コントラストの指標）。 |

### JPEG 品質の推定の方法

- マーカーを順に読み、DQT（量子化テーブル）を集めます。SOS（画像データの開始）または EOI で止まります。
- 8 ビットと 16 ビットの精度を扱います。ID 0（輝度）のテーブルを優先します。
- 品質 1〜100 のそれぞれについて、IJG の換算式で標準の輝度テーブルを換算し、DQT との差（絶対値の和）が最も小さい品質を返します。

## 3. 既定値（requirements.md 3.0 の値）

`src/config/image.ts` に置きます。B2 で使うのは `dHashGrid` だけです。ほかは B3 の判定で使います。

| 項目 | 値 |
|---|---|
| 差分ハッシュの格子 | 9 × 8 |
| ピントの縮小の長辺 | 512 px |
| JPEG 品質 | 50 未満は不合格、50〜59 は要確認 |
| ピント | 30 未満は不合格、30 以上 60 以下は要確認（`focusReviewMax`、上限を含む） |
| 同一画像の距離 | 4 以下は不合格、5〜8 は要確認 |
| 昼間（EXIF が無い場合） | 平均輝度 40 未満は要確認 |

値は requirements.md 3.0 の既定値です。調整したときは、調整の内容を記録します。
