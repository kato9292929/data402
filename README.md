# data402

Solana を受け付ける x402 の出品を、支払いをせずに定期的に叩き、402 が返るか・受取先（payTo）・
提示金額を記録して公開する。観測した事実と観測日時だけを返し、判定は出さない。

- 生データ: [`data/observations.jsonl`](data/observations.jsonl)（追記のみ。過去の行は書き換えない）
- 今回の対象一覧: [`data/targets.json`](data/targets.json)
- 形式と規則: [`spec/11-observation-format.md`](spec/11-observation-format.md)
- 移管の記録: [`spec/00-provenance.md`](spec/00-provenance.md)（x402-Interlock から履歴ごと移した）

運営者は x402 のデータを扱っている（x402 出品カタログ [kato9292929/endpoint](https://github.com/kato9292929/endpoint) を運営している）。

## 観測方法

- 各エンドポイントに GET を送る。402 でなければ同じ URL に空の JSON で POST を1回送る。
  支払いのヘッダーは一切付けない。リダイレクトは追わない。
- 402 の `PAYMENT-REQUIRED` ヘッダー（x402 v2）か本文（v1）から `accepts` を読み、Solana
  メインネットの項目の `payTo`・`amount`・`asset`・`scheme`・`extra`（`feePayer` を含む）を記録する。
- 失敗（応答なし、402 以外）も1行として記録する。
- 同一ホストへの要求は順番に、`same_host_gap_ms` の間隔を空けて送る。429 を2回返したホストには
  その回はそれ以上送らない。

## 対象の選び方

カタログ（`kato9292929/endpoint` の `data/endpoints_full.json.gz`）のうち、USDC・1回ごとの価格・
価格が0より大きい・カタログ生成時刻から14日以内に確認されている・`networks` に `Solana` を含む
出品。1ホストにつき最大4エンドポイント（一度観測したものを優先し、残りはハッシュ順）。詳細は
spec/11 の4節。対象はカタログに合わせて変わる。2026-10-08 の時点で 180 ホスト・501 エンドポイント
（最初の観測を取った時点のカタログでは 177 ホスト・483 エンドポイント）。

## 何を保証しないか

- `alive` は、観測した時刻にその URL が Solana の支払い要求を返したということだけを示す。支払えば
  データが返ること、データの中身、出品者が誰であるかは確かめていない。
- `payTo` は 402 が名乗った受取先であり、実際に支払った場合の着金先は確かめていない。
- 出品者の評価・格付け・分類はしない。同じ `payTo` を複数のホストが示していても、その関係は
  述べない（決済基盤やファシリテーターを共有している場合もある）。
- 観測の時刻・経路（ネットワーク、プロキシ）によって応答が変わることがある。`unreachable` は
  こちらから届かなかったことを示し、相手が止まっていることを示すとは限らない。
- カタログにない出品、Solana 以外のネットワークは対象外。
- 最初の 483 行（2026-10-08）は前身のスクリプトで取ったもので、`extra` と応答時間がない（spec/11 の5節）。

## 動かし方

Node.js 22.21 以上。

```
npm install
npm run probe                  # 1回実行（期限の来たエンドポイントだけ叩く）
npm run probe -- --dry-run     # 対象と件数だけ表示
npm run probe:schedule         # 前面で 24 時間ごとに実行し続ける
npm run dev                    # http://localhost:3000
npm test
```

プロキシ経由の環境では `NODE_USE_ENV_PROXY=1` を付ける。設定は [`config/probe.json`](config/probe.json):

| key | 意味 |
|---|---|
| `run_interval_hours` | 実行の間隔（`probe:schedule`） |
| `min_reobserve_hours` | 同じエンドポイントを再び叩くまでの最短時間 |
| `same_host_gap_ms` | 同一ホストへの連続した要求の間隔 |
| `concurrency` | 同時に扱うホスト数 |
| `max_run_minutes` | 1回の実行の上限。残りは次回に先に回る |
| `max_endpoints_per_host` | 1ホストあたりの対象エンドポイント数 |
| `catalog` | カタログの場所（URL またはローカルパス。`--catalog` で上書き） |

cron で回す場合の例:

```
17 3 * * * cd /path/to/data402 && node scripts/probe.mjs >> probe.log 2>&1
```

観測を公開するには、実行後に `data/observations.jsonl` と `data/targets.json` をコミットする。
配置先（サーバー、定期実行の場所）は決めていない。

## 照会エンドポイント

認証なし。すべての応答に `disclosure`（運営者が x402 のデータを扱っていること、支払いなしの 402
読み取りであること、Solana のみであること）と `data`（行数、最新の観測日時、プローブのバージョン）が入る。

| | |
|---|---|
| `GET /v1/hosts` | 全ホストの最新の観測: `host`, `status`, `payTo`, `amount`, `last_seen`, `first_seen`, `last_observed_at`, `in_current_targets`, `probe_version` |
| `GET /v1/hosts/{host}` | 1ホストの最新の観測（エンドポイントごと）と、過去の観測（新しい順、最大90件） |
| `GET /v1/payto/{address}` | その受取先を示したホストの一覧（最初と最後に示した時刻、最新の観測で示しているか） |

一覧ページは `/`。

## ファイル

| | |
|---|---|
| `scripts/probe.mjs`, `scripts/probe-lib.mjs` | プローブ |
| `scripts/schedule.mjs` | 定期実行 |
| `scripts/import-legacy.mjs` | 2026-10-08 の観測を spec/11 の形式に変換した一回限りのスクリプト |
| `lib/data.ts` | 集計（API と一覧ページが使う） |
| `app/` | Next.js（API 3本と一覧ページ） |
| `research/`, `spec/09-*`, `spec/10-*`, `data/payto-observations.jsonl` | x402-Interlock から移した前身の調査。記録として残している（`research/payto-summary.mjs` のためだけに devDependency の `tldts` がある） |
