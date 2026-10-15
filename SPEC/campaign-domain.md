# キャンペーンのドメイン（B1）

確認日：2026-10-16（JST）。この文書は、実装済みのキャンペーンのドメインの仕様です。

## 1. 配置

| 対象 | 場所 |
|---|---|
| 季節・月・例外（CampaignError） | `src/core/campaign/period.ts` |
| 区分値（複合地域を含む） | `src/core/campaign/area.ts` |
| マス（区分値 × 季節） | `src/core/campaign/cell.ts` |
| キャンペーン | `src/core/campaign/campaign.ts` |
| キャンペーンの定義と検証 | `src/core/campaign/defineCampaign.ts` |
| 充足計算 | `src/core/campaign/coverageCalculator.ts` |
| 季節の表示名・例外の文言・コード | `src/config/strings/campaign.ts` |

外部（D1・fetch・DOM・Node 専用の API）には依存しません。日本語の文字列は、このフォルダに書きません（`test/unit/core/campaign/noHardcodedJapanese.test.ts` で確かめます）。

## 2. 季節（Period）

- 季節は `spring`（3〜5 月）、`summer`（6〜8 月）、`autumn`（9〜11 月）、`winter`（12・1・2 月）です。
- `Period.fromMonth(month)` は、1〜12 の整数だけを受け付けます。それ以外は `MONTH_INVALID` の例外にします。
- 冬は年をまたいでも同じ季節です（12 月と 1 月は同じ `winter`）。

## 3. 区分値（Area）

- `Area.fromLabel(raw)` は、`normalizeText`（A2）で正規化してから作ります。空の値、または構成要素が空になる値（先頭の「・」など）は `AREA_INVALID` にします。
- 「・」区切りの複合地域は、1 つの区分値として保ちます。`components` に構成要素を持ちます。
- `matchesPlace(name)` は、複合地域のどちらの町の名前でも `true` を返します。複合地域に含まれない町は `false` です。空の地名は `false` です。
- `Area.contains(lat, lng)` は実装しません。境界データ（requirements 12.5）を同梱しないためです。地点の判定は、境界データの出典とライセンスが決まってから行います。

## 4. マス（Cell）

- `Cell` は、区分値・季節・必要数を持ちます。必要数は 1 以上の整数だけを受け付けます。
- `isFull(acceptedCount)` は、採用数が必要数以上なら `true`（募集終了）を返します。確認待ちは含めません。採用数は 0 以上の整数だけを受け付けます。
- `id` は `季節:区分値` の形式です。同じ区分値と季節からは、同じ ID になります。

## 5. キャンペーンの定義（defineCampaign）

- 入力は名称、区分値の一覧、季節の一覧、必要数（一律の数、または全マスの個別の一覧）、受入条件（`AcceptRule`）、ID の生成関数です。ID は引数で受け取ります（外部に依存しないため）。
- 区分値は正規化した後で、制御文字・ゼロ幅の文字・双方向の制御文字を含むものを `AREA_INVALID` で拒否します。長さが上限（`LIMITS.areaLabelMaxChars`、仮の値 40 字）を超えると `AREA_TOO_LONG` で拒否します。
- 区分値は正規化してから重複を調べます。全角と半角の違いだけの値、空白の位置だけが違う複合地域も重複として `AREA_DUPLICATE` にします。
- 個別の必要数は、次の順で検査します。同じマスの重複（`REQUIRED_DUPLICATE`）、キャンペーンにないマス（`REQUIRED_UNKNOWN_CELL`）、必要数の値（`REQUIRED_INVALID`）、指定のないマス（`REQUIRED_MISSING`）。
- 受入条件は、比率が正、許容誤差が 0 以上 1 未満、向きが横、形式が JPEG または PNG の 1 つ以上、最小短辺・画素数・入力サイズが正の整数、ぼけの下限と重複の距離が 0 以上などを検査します（違えば `RULE_INVALID`）。
- マスの順は区分値の並び順、その中で季節の並び順です。
- 例外は `CampaignError` で、`code` を持ちます。文言は `CAMPAIGN_ERROR_MESSAGES[code]` から引きます（Worker とフロントが使います）。

## 6. 充足計算（CoverageCalculator）

- `compute(campaign, counts)` は、マスごとの採用数・確認待ち数・必要数・募集中かどうかを返します。件数の無いマスは、採用数と確認待ち数を 0 として扱います。
- 件数は `campaignId` を持ち、渡したキャンペーンの ID と一致しないものは `COUNT_CAMPAIGN_MISMATCH` で拒否します。
- 件数は、キャンペーンにないマス（`COUNT_UNKNOWN_CELL`）、同じマスの重複（`COUNT_DUPLICATE`）、負の数や小数（`COUNT_INVALID`）を拒否します。
- `wanted`（いま求めている場所）は、募集中のマスだけを次の順に並べます。
  1. 充足率（採用数 ÷ 必要数）の低い順（掛け算で比べます）
  2. 同率なら、必要数との差（必要数 − 採用数）の大きい順
  3. 同じなら、マスの並び順（区分値の並び順、その中で季節の並び順）

  同じ入力からは、毎回同じ順になります。
- 確認待ちは枠に含めません。採用を取り消して採用数が減ると、マスは再び募集中になります。

## 既知の制約

- 複合地域の並び違い（「美波町・海陽町」と「海陽町・美波町」）や、複合地域と単独の町との重なりは、重複と判定しません（Issue の範囲外）。
