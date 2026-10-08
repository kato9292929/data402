# budget

予算と期限の中に収める層。Solana Subscriptions の Fixed delegation（program
`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`）で、タスクごとに Allowance を作る。引き出し役
（delegate）はゲートの鍵で、エージェントは鍵を持たない。

x402-Interlock（`claude/tender-noether-7you3c`、`35cb7ff`）の `lib/` から配置し直したもの。ロジックは
書き直していない。

| ファイル | 中身 |
|---|---|
| `tasks.ts`, `solana/` | タスク単位の Allowance の作成・読み出し・引き出し・失効 |
| `gate.ts` | 支払いの判断、予約・確定・解放（二重払いの修正）、予算の予約、停止条件、World ID 承認の経路、送信前の照合を通したメッセージ送信 |
| `task-guard.ts` | 予算の予約額、結果の分からない支払い、連続失敗 |
| `reconcile.ts` | 時間切れの引き出しを、Allowance の使用額と台帳で突き合わせる |
| `protect.ts`, `actions.ts`, `inbox.ts` | 送信前の照合（オーナーの登録情報、日本の住所の表記ゆれを含む）、行為ごとの方針、送信先 |
| `world.ts` | 内容ハッシュに結び付けた World ID の承認 |
| `ledger.ts`, `lock.ts` | ハッシュ連鎖の台帳、複数プロセスの排他 |
| `policy.ts`, `amount.ts`, `signer.ts`, `http.ts`, `timeline.ts` | 金額の規則、金額の変換、署名、API の認証、画面用の整形 |

## 移さなかったもの

- 判断モデル（Jev / TypeSafe）への接続と Spend Guard。Interlock でも `mode: off` だった。
- Intercepta のスクリーニング。Base mainnet の代理アドレスで Solana の受取先を見る作りで、第三者のリスク判定でもある。
- Base（EVM）の支払い経路と署名。支払いはすべて Solana のタスクを通る（タスクのない支払いは `TASK_MISSING`、Solana 以外は `TASK_REQUIRES_SOLANA`）。
- 旧 APPE の評価用の道具、デモ用の販売者（`app/api/seller/*`）、ETHGlobal 向けの文書。

## 変えたところ

- 台帳と状態の置き場所を `data/` から `var/budget/`（git に入れない）に変えた。`data/` は census の公開データ。
- 受け取ったものの照合は `src/receipt/` に分けた（設定は `config/receipt.json`）。
- `test/tasks.integration.test.ts` の「同じ購入への同時の2要求」の検査：止められた側の理由として、
  評価の時点の `PURCHASE_IN_FLIGHT` も受け付けるようにした。Interlock ではスクリーニングの通信が
  間に入っていたため、予約の時点で止まるのが普通だった。「売り手に払われるのは1回」の検査は変えていない。

## 動かし方

```
cp .env.example .env.local      # 鍵とトークンを入れる
npm run task -- open ...        # タスクを開く（scripts/task.ts の先頭に使い方）
npm run dev                     # /gate /tasks /inbox /approve/{id}、API は /api/*
npm test                        # オフラインのテスト（devnet の1件は飛ばす）
npm run test:devnet             # devnet での Allowance の作成・読み出し・失効（鍵が要る）
```
