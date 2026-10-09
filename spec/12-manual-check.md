# 12. 目視確認：census の記録と、人が開いた同じ URL の応答（規則を先に固定、2026-10-09）

人が同じ URL を開き、census が記録した `status` と `payTo` がその応答と一致するかを確かめる。判定・スコア・
ラベルは足さない。払わない。このファイルは抽出を実行する前にコミットする。抽出の結果（層の大きさ、選ばれた
ホスト）は、このコミットの時点で誰も見ていない。

## 1. スナップショット（固定）

| | |
|---|---|
| `observations.jsonl` | data402 のコミット `0414c41a174131861719bc4f61a4acf4da4dac25` の `data/observations.jsonl`（984 行） |
| 使う行の `observed_at` の上限 | `2026-10-08T15:07:38.717Z`（このコミットの最新の観測） |
| 母集団 | 同じコミットの `data/targets.json`：180 ホスト / 501 エンドポイント |
| カタログ | `kato9292929/endpoint` のコミット `432b3bf02947ef832d97041b188594d7ddee2657`（`endpoints_full.json.gz` の `generated_at` が `targets.json` の `catalog_generated_at` = `2026-10-08T13:30:54.578Z` と一致するもの）と、同じコミットの `data/rank.json` |
| 照合する行 | 選ばれたエンドポイントの、上限以前で最も新しい行 |

固定する理由：501 本すべてが再観測の期限に入っており、`data402-probe@1.1.0` の次の実行で各エンドポイントの
最新行が入れ替わる。カタログも日々動く。抽出と照合は、上の2つのコミットから決まる値だけを使う
（`git show <commit>:<path>` で読む。作業中のファイルは使わない）。

## 2. spec/09 section 3（`ad1a960`）との対応、当たらない点

抽出は 09-3 に従う。新しい抽出規則は作らない。ただし 09-3 は今回の母集団にそのまま当たらない点があるので、
先にここに書き、その扱いを決める。

| 09-3 の項 | 09-3 の内容 | 今回 | 当たらない点と扱い |
|---|---|---|---|
| 母集団 | endpoint@83e33d7 の対象の記録（全ネットワーク、3,324 ホスト）、単位はホスト | census の対象（1節）、単位はホスト | 照合する相手は census の行なので、母集団を census の対象 180 ホストに置き換える。それ以外の定義はそのまま |
| 層 | B ブランド / H 上位（`rank.json`）/ M 中位（`popularity` あり）/ L 下位。判定の順も同じ | 同じ。`research/observe-sample.mjs`（Interlock、ad1a960 の実装）と同じ判定を、カタログ（1節）のそのホストの対象の記録（spec/10 改訂2の条件：USDC・per-call・価格>0・14日以内・`networks` に Solana）すべてに当てる。ブランドの判定は endpoint の `scripts/brands.mjs` をそのまま使う | なし |
| 合計 | 100 ホスト | **40 ホスト** | 指示書の範囲が 30〜50。中央の 40 にする。層の大きさを見る前に決めている |
| 配分 | B を全件、残りを H・M・L に等分、端数は L、層が足りなければ全件 | 同じ（100 を 40 に読み替える） | 09-3 では B が合計を超えて成り立たなかった（B 102 > 100）。今回も B > 40 なら同じことが起きる。そのときは、09-3 の結果に書かれたオーナーの案（未採用、100 のうち B 34・H 全件・M 0・L で残り）を比で当てる：B から ⌈40 × 0.34⌉ = 14、H は全件（残りの枠まで）、M は全件（残りの枠まで）、L で残りを埋める。B・H・M・L の中からは種で選ぶ。B ≤ 40 なら 09-3 のとおり。どちらの場合も、L が足りなければ合計は 40 未満になり、それをそのまま使う |
| 層の中の選び方 | 種 `20261008`（mulberry32）、Fisher–Yates の並べ替えの先頭 | 同じ。乱数の列も observe-sample.mjs と同じ順で使う（H → M → L の選択、続いて B・H・M・L の順に各ホストのエンドポイント） | なし |
| 1ホスト1エンドポイント | 対象の記録から同じ種で無作為に（最安を選ばない） | そのホストの census の対象のエンドポイント（1節、最大4本、URL 順に並べる）から、同じ種で1本 | 照合する census の行があるのは対象のエンドポイントだけなので、選ぶ範囲を対象に限る |
| 測ること | 1. 支払いなしの 402、2. 支払いあり | 1 だけ | 2 はやらない（払わない） |
| 限界 | 選んだ範囲だけ、市場の代理としない | 同じ | 確認したのは抽出した 40 ホスト分であって全数ではない。抽出されなかったエンドポイントについては何も言わない |

## 3. 一覧

`data/manual-check-20261009-blank.csv`（記入用）と `data/manual-check-20261009.csv`（照合用）。1行1エンドポイント、
`endpoint_id` で結合する。先頭の `#` の行に、1節のスナップショット・上限・母集団の大きさ・種と規則・層ごとの件数を書く。

記入用の列：`host, endpoint_id, url, method, observed_at, probe_version, seen_status, seen_payTo, seen_amount, checked_at, checker`

照合用の列：`host, endpoint_id, url, method, observed_at, recorded_status, recorded_http_status, recorded_payTo,
recorded_amount, recorded_asset, recorded_error, probe_version, seen_status, seen_payTo, seen_amount, match, note,
checked_at, gap_hours, checker, stratum`

- `method`（指示書の列に足したもの）：照合する行が GET と POST のどちらを記録したか。プローブは GET が 402 で
  なければ POST を1回試す（spec/11 3節）ので、同じ要求を出すのに要る。応答の中身ではないので記入用に残す。
- `stratum`（足したもの）：09-3 の層。照合用だけに置く。
- `recorded_error`（足したもの）：照合する行の `error`。5節の版の読み方（`402_not_parsed`）に要る。照合用だけに置く。
- 記入用を先に配る。照合用は、記入用が埋まった後に `merge` で作る（1節のコミットから決まるので、いつ作っても同じ）。
  記録値を見ながら記入すると確認ではなく追認になる。ただし `observations.jsonl` は公開されているので、伏せる
  ことは手順で守るしかない：記入が終わるまで、記入者は `observations.jsonl`、census の照会、一覧ページを見ない。

## 4. 手順

- 1エンドポイントにつき、`method` の要求を1回だけ送る。支払いヘッダは付けない。リダイレクトは追わない。POST は
  本文 `{}`、`content-type: application/json`。例：
  `curl -sS -o body.txt -D headers.txt --max-time 15 [-X POST -H 'content-type: application/json' --data '{}'] '<url>'`
- 402 の中身は、`PAYMENT-REQUIRED` ヘッダ（base64 の JSON、x402 v2）、なければ本文（v1）から読む。
- `seen_status` は spec/11 2節の6区分（`alive` / `no_challenge` / `no_solana` / `unavailable` / `no_402` /
  `unreachable`）から選ぶ。`unavailable` や `no_challenge` に当たったらそのまま記録する。再試行しない（spec/11 3節の
  再試行はプローブの規則で、目視確認の手順ではない）。
- `seen_payTo`：402 の `accepts` の最初の Solana mainnet エントリ（network が `solana` か
  `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`）の `payTo` を写す。Solana のエントリが無ければ空欄にし、`seen_status` に反映する。
- `seen_amount`：同じエントリの `amount`（v1 は `maxAmountRequired`）を、書かれたまま（最小単位の整数）写す。
- `checked_at`：要求を送った時刻、ISO 8601 UTC。`checker`：確認した人。

## 5. 照合（`match`）

`match` は 一致 / 不一致 / 判定不能。照合用を見て人が付ける。

- **一致**：`seen_status` が `recorded_status` に対応し、かつ `alive` のときは `seen_payTo` が `recorded_payTo` と
  文字どおり同じ。金額は照合の条件に入れない（記録は残す）。
- **版の違いの読み方**：照合する行はすべて 1.1.0 より前の版で書かれている（1節の上限より後に 1.1.0 が入った）。
  その版では 429/5xx は `no_402`、払う情報の無い 402 は `no_solana`（`error: 402_not_parsed`）と書かれた（spec/11 2節）。
  したがって `recorded_status = no_402` かつ `recorded_http_status` が 429 か 5xx のときは `seen_status = unavailable`
  を対応とみなし、`recorded_status = no_solana` で `error = 402_not_parsed` の行は `no_challenge` を対応とみなす。
  それ以外は同じ名前どうしが対応する。
- **判定不能**：応答が読めなかった、要求を送れなかったなど、照合の材料が無いとき。`note` に理由を書く。
- `note` は 不一致・判定不能 のときだけ書く。

## 6. 不一致の読み方（結果にも書く）

不一致は「プローブの誤り」と「観測の後の変化」に分けられない。確認時刻と観測時刻が離れるほど後者が増える。
分けられないことを結果に書き、各行に `gap_hours`（`checked_at - observed_at`、時間）を併記して、読み手が判断できる
形にする。今回の行の観測は 2026-10-08 14:54〜15:07 UTC なので、間隔は少なくとも約1日になる。

## 7. 結果

- 一致 / 不一致 / 判定不能 の件数と、`gap_hours` の範囲を出す（`tally`）。それ以上の要約や評価は足さない。
- `observations.jsonl` の既存行は書き換えない。確認の結果はこの2つの CSV に置く。
- 抽出されなかったエンドポイントについては何も言わない。

## 8. 道具

`src/census/manual-check.mjs`（このファイルと同じコミット）：

```
node src/census/manual-check.mjs draw  <endpoint checkout>          # 記入用を書く（1節のコミットを git show で読む）
node src/census/manual-check.mjs merge <endpoint checkout>          # 記入済みの記入用 + 1節の記録 → 照合用（gap_hours を計算）
node src/census/manual-check.mjs tally                              # 照合用の match を数える
```

## 9. 抽出の結果（2026-10-09、規則のコミット `9bc8672` の後に実行）

- 層の大きさ（母集団 180 ホスト）：B 39、H 5、M 0、L 136。
- B（39）≤ 40 なので、09-3 のとおり B を全件、残り 1 を H・M・L に等分（各 0）、端数 1 を L に入れた。
  抽出は **B 39 + L 1 = 40 ホスト、40 エンドポイント**。照合する行はすべて `data402-probe@1.0.0`（GET 31、POST 9）。
- この配分は 09-3 の規則をそのまま当てた結果で、抽出の後に規則は変えていない。B 以外の層がほとんど入らないので、
  この確認で分かるのは、ほぼブランドを名乗る（または自社の）ホストの行についてである。別の配分で確かめたいなら、
  新しい規則を先にコミットしてから抽出し直す（オーナーが決める）。
- 記入用：`data/manual-check-20261009-blank.csv`。照合用は記入の後に `merge` で作る。

## 10. スナップショットの切り替え（2026-10-09、抽出し直す前に固定）

census 単体の仕上げの指示書（2026-10-09）が、数字の確定と目視確認を同じ1つのスナップショットの上で行うよう求めた。
`data402-probe@1.1.0` で全件を再実行し、そのスナップショットに切り替える。抽出の規則（2〜5節）は変えない。

| | |
|---|---|
| `observations.jsonl` | data402 のコミット `176457101c92994bd509e48519bf694dfa3eff46`（1,485 行） |
| 使う行の `observed_at` の上限 | `2026-10-09T16:44:03.484Z`（1.1.0 の実行の最新の観測） |
| 母集団 | 同じコミットの `data/targets.json`：180 ホスト / 501 エンドポイント（対象の一覧は `0414c41` と同じ。変わったのは書き込み時刻、版、`catalog_source` の3行。`catalog_source` は手元のカタログのパスになっているが、中身は `endpoint@432b3bf` で、`catalog_generated_at` は同じ） |
| カタログ | 1節と同じ `endpoint@432b3bf` |
| 照合する行 | 選ばれたエンドポイントの、上限以前で最も新しい行。すべて `data402-probe@1.1.0` で書かれた行になる |

- 同じカタログ・同じ対象・同じ種なので、抽出されるホストとエンドポイントは9節と同じになるはずである。違えば、
  そのことを結果に書く（規則は変えない）。
- 照合する行が 1.1.0 で書かれるので、5節の版の読み方（1.1.0 より前の行の扱い）はこの組では使わない。
- 9節の記入用（`data/manual-check-20261009-blank.csv`）は使わない。記録として残す。この組の一覧は
  `data/manual-check-20261009b-blank.csv`（記入用）と `data/manual-check-20261009b.csv`（照合用、記入の後に `merge`）。
- 道具：`node src/census/manual-check.mjs draw|merge 20261009b <endpoint checkout>`、`tally 20261009b`。
