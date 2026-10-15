# テスト用の画像

このフォルダの画像は、すべて自作です（人物・個人情報・他人の著作物は含みません）。

| ファイル | 作り方 | 用途 |
|---|---|---|
| `sample.svg` | テキストの SVG を手で書きました（青い四角 1 つ）。 | SVG を拒否することの確認（`test/unit/frontend/image/fileProbe.test.ts`） |

JPEG・PNG のテスト用の画像は、このフォルダには置きません。次の方法で、テストの中で作ります。

- JPEG の骨組み：`test/helpers/jpegBytes.ts` の `buildJpeg`（寸法とマーカーを指定して組み立てます）。
- EXIF（撮影日時・時差・機種・GPS）：`test/helpers/exifFixture.ts` の `buildExifApp1`。値はすべて架空です。
- 画素のあるカラーの JPEG：E2E（`test/e2e/prepare.spec.ts`）で、ブラウザの Canvas から作ります。
