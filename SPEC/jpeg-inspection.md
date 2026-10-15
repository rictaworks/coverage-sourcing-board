# JPEG の検査（B4）

確認日：2026-10-16（JST）。この文書は、実装済みの仕様です。

## 1. 目的

Worker が受け取った画像を、再エンコードせずに検査します。EXIF を含まない JPEG だけを保存するための、サーバー側の最後の関門です（CLAUDE.md 8、requirements 3.2）。

## 2. 配置

| 対象 | 場所 |
|---|---|
| 検査の関数と、クラス（`JpegInspector`） | `src/core/jpeg/jpegInspector.ts` |
| マーカーの符号と許可リスト | `src/core/jpeg/markers.ts` |
| テスト | `test/unit/core/jpeg/jpegInspector.test.ts` |
| テスト用の JPEG 組み立て | `test/helpers/jpegBytes.ts` |

外部に依存しません。Web 標準の `Uint8Array` だけを使うため、Workers でもテストの node でも動きます。

## 3. 戻り値

`inspectJpeg(bytes)` は例外を投げず、次のどちらかを返します。

- 合格：`{ ok: true, width, height, progressive }`。幅と高さは SOF（SOF0・SOF1・SOF2）から読みます。`progressive` は SOF2 のとき true です。
- 不合格：`{ ok: false, reason, offset }`。`offset` は問題のあったバイト位置です（デバッグ用。画像の内容は含みません）。

理由のコード（`reason`）：

| コード | 意味 |
|---|---|
| `not_jpeg` | 先頭が SOI（FF D8 FF）でない。空のバイト列を含む |
| `svg` | 先頭の空白（と UTF-8 の BOM）を除いて、`<svg` または `<?xml` で始まる（大文字と小文字は区別しない） |
| `forbidden_segment` | 許可リストにないマーカー（APP1・APP2〜APP15・COM、SOF3 など） |
| `malformed` | マーカーの構造が不正（マーカーの位置に FF が無い、長さが 2 未満、SOF の幅か高さが 0 など） |
| `trailing_bytes` | EOI の後ろに 1 バイトでも余分なバイトがある |
| `truncated` | 途中で切れている（セグメントの長さが範囲外、EOI が無い、スキャンの途中で終わる） |
| `missing_frame` | SOF が無い。または SOS が SOF より前にある |
| `missing_scan` | SOS が無い |

表示する文字列は持ちません（理由はコードで返します）。

## 4. 検査の内容

1. 先頭が FF D8 FF でなければ、`svg` か `not_jpeg` で不合格にします。
2. マーカーは許可リスト方式で検査します。許可するのは次だけです。
   - SOI、APP0（JFIF）、DQT、SOF0・SOF1・SOF2、DHT、DRI、SOS、RST0〜RST7、EOI
   - APP1（EXIF・XMP）、APP2〜APP15（APP13 の IPTC を含む）、COM、その他は `forbidden_segment` で不合格です。
   - APP0 は SOI の直後に 1 つだけ許し、識別子が `JFIF` と 0x00、セグメント長が 16、サムネイルの幅と高さが 0 のものに限ります。JFXX・複数の APP0・長さや中身が違うものは `forbidden_segment` で不合格です。
   - 先頭の SOI の後ろに再び SOI が現れたら `malformed` で不合格です。
   - 不合格の結果の offset は内部の診断用です。外部（API の応答・画面）には返さず、reason だけを返します。
3. SOS の後の圧縮データは、FF 00（スタッフィング）と RST0〜RST7 を読み飛ばし、次のマーカーを探します。圧縮データの中の FF xx（xx が 00・RST・FF 以外）は、マーカーとして検査します。プログレッシブの複数の SOS にも対応します。
4. EOI の後ろに 1 バイトでもあれば `trailing_bytes` で不合格にします。
5. セグメントの長さが範囲外、EOI が無い、などは `truncated` で不合格にします。

## 5. 計算量と時間

- 1 回の走査（O(n)）で終えます。画像を再エンコードしません（CPU 時間の制限のため）。
- 計測（node 22.23.2、WSL2、Linux。1,900,145 バイトの JPEG。esbuild で束ねたものを 30 回測った値）：中央値 4.1 ms、最小 4.0 ms、最大 7.0 ms。
- Workers の CPU 時間の上限は 1 リクエストあたり 10 ms です。この計測は node での値であり、Workers 上の値ではありません。Workers での確認は requirements 12.4 で行います。
- テストでは、1,900,000 バイトの入力が 1,000 ms 以内に終わることを確かめています（CI の揺れを見込んだ上限）。

## 6. 既知の制約

- Canvas が出す標準の JFIF の APP0（長さ 16、サムネイル 0x0）だけを通します。ブラウザごとの出力は D3 で確かめます。
- 本体（圧縮データ）の妥当性（ハフマン符号が正しいか）は検査しません。読み取りは構造だけです。
- ブラウザごとの Canvas の出力が合格するかは、D3 で確かめます。
- 合否の判定の結果を Worker がどう保存するかは、Worker の実装（後続の Issue）の範囲です。
