# 画像の整形の仕様（D3）

確認日：2026-10-16（JST）。この文書は、実装済みの仕様です（requirements 3.2 の実装）。

## 1. 目的と範囲

投稿者が選んだ写真を、ブラウザだけで整えます。形式と寸法を確かめ、EXIF から判定に必要な値だけを読み、4:3 のトリミング枠で位置を決め、EXIF を含まない JPEG に再エンコードします。判定（昼間・ピント・重複など）と送信は、後続の Issue（D4 など）が担当します。

## 2. 配置

| 対象 | 場所 |
|---|---|
| 形式と寸法の判定（デコードの前） | `src/frontend/lib/image/fileProbe.ts`（`ImageFileProbe`） |
| EXIF の要約 | `src/frontend/lib/image/exifReader.ts`（`ExifReader`、exifr 7.1.3） |
| トリミング枠の計算（純粋な関数） | `src/frontend/lib/image/cropMath.ts` |
| Canvas の切り抜き・縮小・再エンコード | `src/frontend/lib/image/canvasEncoder.ts`（`CanvasEncoder`、`encodeWithinLimit`） |
| 特徴量（B2 の関数を呼ぶ） | `src/frontend/lib/image/featureExtractor.ts`（`FeatureExtractor`） |
| 整形の結果の型と手順（`ImagePreparer`） | `src/frontend/lib/image/preparedImage.ts` |
| 画面（選ぶ・枠・確定・確かめる） | `src/frontend/components/prepare/`（`ImagePicker`・`CropFrame`・`PreparedPreview`）。`PrepareFlow` は使われないため DELETE/ へ移しました |
| 投稿の画面 | `src/frontend/app/submit/page.tsx`（整形の手順だけ。入力欄と判定と送信は D4） |
| 文言 | `src/config/strings/prepare.ts`（`PREPARE_STRINGS`・`PREPARE_ERROR_STRINGS`。文言だけ） |
| 不要なセグメントの取り除き（バイト列の純粋な関数） | `src/core/jpeg/segmentStripper.ts`（`stripDisallowedSegments`。マーカーの定義は B4 の `markers.ts` と共通） |
| 数値の既定値・判定の閾値・上限 | `src/config/defaults.ts`（`PREPARE_DEFAULTS`・`RULE_DEFAULTS`）・`src/config/limits.ts`（`LIMITS`）・`src/config/image.ts` |

テスト：単体は `test/unit/frontend/image/` と `test/unit/core/jpeg/`、ブラウザは `test/e2e/prepare.spec.ts`（Chromium・Firefox・WebKit）。E2E の整形の待ちは 20 秒です（初回のコンパイルに時間がかかるため）。WebKit は、ホストで `sudo npx playwright install-deps webkit` を行うと起動します（確認日：2026-10-16）。

## 3. 処理の順序

`ImagePreparer` は 2 段階です。

1. `analyze(file)`（確定の前）
   1. ファイルの大きさを確かめます（5 MB を超えたら、読み込まずに拒否）。
   2. ファイルを読み、先頭のバイトで形式を判定します（JPEG の `FF D8 FF`、PNG の署名）。SVG・GIF などは拒否します。
   3. ヘッダーから寸法を読み、画素数を確かめます（4,000 万画素を超えたら、デコードせずに拒否）。
   4. EXIF を読みます（3 章）。
   5. JPEG のときは、量子化テーブルから品質を推定します（B2 の `estimateJpegQuality`）。
   6. `createImageBitmap(file, { imageOrientation: 'from-image' })` でデコードします。
   7. 表示の向きで高さが幅より大きい（縦向き）なら、「縦向きは不可」として拒否します（回転はしません）。
   8. 比率が 4:3 の許容（±1%）の外なら、トリミング枠を表示します。
2. `prepare(source, position)`（確定の時）
   1. 枠（中央基準で 0.5、動かした値）から切り抜く範囲を求めます。
   2. 切り抜きを長辺 1,600 px 以下に縮小して Canvas に描き、保存用の JPEG に再エンコードします（4 章）。
   3. 切り抜きを長辺 512 px に縮小し、特徴量を求め（5 章）、分類用の JPEG を作ります（保存しません）。
   4. 読み込みの画像（ImageBitmap）を解放し、結果（`PreparedImage`）を返します。

## 4. 保存用の画像と上限

- 形式：Canvas の `toBlob` で JPEG に再エンコードします。再エンコードにより、EXIF は残りません。`toBlob` の結果から、許可リスト以外のセグメント（ICC の APP2 など）を取り除きます（10 章）。保存するのは、この JPEG だけです。原寸は保存しません。
- 寸法：長辺 1,600 px 以下（`RULE_DEFAULTS.savedLongEdgePx`）。小さい画像は拡大しません。
- 品質：候補は 0.92・0.85・0.78・0.70・0.60 の順です（`PREPARE_DEFAULTS.saveQualities`、`src/config/defaults.ts`）。上限以下になった最初の品質を採用します。
- 上限：1,900,000 バイト（`RULE_DEFAULTS.savedMaxBytes`）。
- 下限でも超える場合は、保存しません。`save_too_large` の不合格として、「保存用の画像を 1.9 MB 以下にできませんでした」を表示します。品質を 0.60 より下げることはしません。

人が確かめる点：この扱い（品質を下げて、下限でも超えたら不合格）は、仕様の案です。超えたときに、長辺をさらに縮める方が良いか、不合格のままにするかは人が決めます。

## 5. 特徴量（`ImageFeatures`）

分類用の 512 px の画像から、B2 の関数で求めます。

| 項目 | 求め方 |
|---|---|
| `blurScore` | 長辺 512 px のグレースケールのラプラシアン分散（`laplacianVariance`） |
| `meanLuma` | 平均輝度（`meanLuma`） |
| `saturation` | 平均の彩度（`colorStats.meanSaturation`、0〜1） |
| `contrast` | 輝度の標準偏差 ÷ 255（0〜1） |
| `phash` | 差分ハッシュ（`dHash`、16 文字の 16 進） |
| `quality` | 元が JPEG で推定できたときだけ（`estimateJpegQuality`） |
| `width`・`height`・`format` | 元の画像の表示の向きでの寸法と形式 |

## 6. トリミング枠

- 比率：幅 ÷ 高さ が 4 ÷ 3 の ±1% の外のとき、枠を表示します（`requiresCrop`）。
- 位置：中央（0.5）が既定です。幅の広い画像（3:2 など）は左右、4:3 より縦長の横向き（5:4 など）は上下に動きます。
- 操作：枠のドラッグ、スライダー（`input type="range"`）、キーボードの矢印キー（スライダーの 5% 刻み）。スライダーには日本語の名前と、`aria-valuetext`（%）を付けます。
- 枠は画像の外に出ません（`cropRectAt` で丸めます）。

## 7. 向き（EXIF の Orientation）

- 回転は、自分では行いません。`createImageBitmap` の `imageOrientation: 'from-image'` で、ブラウザが EXIF の Orientation を適用した表示の向きでデコードします。
- 表示の向きで縦長の画像は「縦向きは不可」として拒否します（Orientation の 5〜8 で横の写真を縦に表示したものも、この扱いになります）。
- 人が確かめる点：古いブラウザで `imageOrientation` が効かない場合の扱い。この実装は、対応するブラウザ（3 種の E2E の対象）で確かめます。

## 8. EXIF の扱い

- 読む値：撮影日時（`DateTimeOriginal`）、時差（`OffsetTimeOriginal`）、機種（`Make`・`Model` の有無）、GPS（`GPSLatitude`・`GPSLongitude` の有無）。
- 結果は `ExifSummary`（`shotAt`・`offsetMinutes`・`hasGps`・`hasDeviceInfo`）だけです。緯度経度と機種名の値は、結果にも状態にも残しません。
- 撮影地（GPS から市町村を求めること）と、GPS の座標を使った昼間の判定は行いません（境界データが無いため、Issue の決定）。
- `shotAt`（撮影日時の全部）は、D4 の判定（撮影月の照合と昼間の判定。昼間の判定には時刻が必要です）の中だけで使います。保存にも送信にも含めません。
- 時差（`OffsetTimeOriginal`）が無いときは、`shotAt` を null にします（時差の無い時刻を、推定で補いません）。月の照合に使う場合は、D4 で扱います。
- EXIF が読めなかったときは、EXIF が無いものとして扱います（`hasGps`・`hasDeviceInfo` は false、`shotAt` は null）。推定の値で補うことはしません。原因が残るように、失敗の種類の番号だけをトレース（`image.exif_read_failed`、`errorKind`）に残します。メッセージ・値は残しません。
- `PreparedImage.exif` は D4 の判定に渡します。判定が済んだら、D4 が破棄します。

## 9. 不合格の理由

| reason | 扱い | 表示 |
|---|---|---|
| `unsupported_format` | 不合格（SVG・GIF などを含む） | JPEG または PNG の画像を選んでください |
| `too_large` | 不合格（5 MB 超。読み込み前） | 5 MB 以下 |
| `too_many_pixels` | 不合格（4,000 万画素超。デコード前） | 4,000 万画素以下 |
| `unreadable` | 不合格（寸法が読めない） | 寸法を読み取れませんでした |
| `decode_failed` | 不合格（ブラウザがデコードできない） | 読み込めませんでした |
| `portrait` | 不合格（縦向き） | 縦向きは不可です |
| `save_too_large` | 不合格（保存用の上限を超えた） | 1.9 MB 以下にできませんでした |
| `encode_failed` | 不合格（Canvas の失敗） | 変換に失敗しました |

上の不合格は、投稿者がその場で直せる項目です（requirements 5 章）。判定（ピント・昼間など）の閾値はここでは使いません。

## 10. ブラウザごとの出力（B4 との関係）

- Chromium の Canvas の JPEG には、ICC プロファイルの APP2 セグメントが入ります（実測：`ICC_PROFILE`、472 バイト）。B4 の Worker の検査は APP2 を拒否します。Worker の検査は厳しいままです。
- そこで、ブラウザ側で `toBlob` の結果から不要なセグメントを取り除きます（`stripDisallowedSegments`、`CanvasEncoder` の保存用・分類用の両方）。取り除くのは、B4 の許可リスト（`ALLOWED_MARKERS`）にないセグメント（APP1・APP2・APP13・COM など）です。APP0（JFIF）と、画像に必要なセグメント（DQT・SOF・DHT・SOS・DRI など）は残します。
- この処理はバイト単位です。圧縮データ（画素）は 1 バイトも変わらず、再エンコードもしません。構造が不正で読めないときは `encode_failed` にします。
- 出力の JPEG は、B4 の `inspectJpeg` に当てて確かめます（単体と E2E）。E2E は、保存される JPEG に APP2 が無いこと、ブラウザで画像として読めること、`inspectJpeg` に合格することを、Chromium・Firefox・WebKit で確かめます。

## 11. 既定値の置き場所

- 整形の既定値（保存用の品質の候補、分類用の品質、トリミング枠の刻み）は `src/config/defaults.ts` の `PREPARE_DEFAULTS` に置きます。
- 上限（5 MB・4,000 万画素・長辺・保存用の上限・分類用の上限）は、`RULE_DEFAULTS` と `LIMITS` を使います。
- `src/config/strings/prepare.ts` には、文言だけを置きます。

## 12. プライバシー

- 投稿者の画像は、サーバーに送りません（この Issue の範囲）。
- 保存用の画像に EXIF・GPS・機種情報は残りません（再エンコード）。E2E で、保存用の画像に `Exif`・機種名・メーカー名の文字列が無いことを確かめます。
- 位置情報と機種情報の値は、`ExifSummary` にも状態にも残しません。
