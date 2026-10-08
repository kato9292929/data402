# receipt

受け取ったものを照合する層。必須フィールドの有無・期間・行数・形式（HTTP の状態、JSON か）をコードで検査する。
モデルは使わない。記録するだけで、支払いを取り消したり、売り手を評価したりはしない。

x402-Interlock の旧 Delivery Review（`lib/delivery.ts`）のうち、コードの検査（`checkFields`、`fields_ok`）
だけを移した。判断モデルに聞く部分は移していない。

| ファイル | 中身 |
|---|---|
| `check.ts` | `checkFields`、`receiptOf`（本文のハッシュと大きさ、検査の結果。本文は残さない） |
| `history.ts` | 同じ購入先の直近の検査を数える規則（空が2回 → `DELIVERY_HISTORY_POOR`、`fields_ok` が偽で2回 → `DELIVERY_HISTORY_MISMATCH`、どちらもオーナーに聞く） |
| `config.ts` | `config/receipt.json` を読む。`mode: off` で記録しない |

budget のゲートが、支払いを終えたタスクの購入について `delivery_review` を台帳に記録する（`mode: record` のとき）。
