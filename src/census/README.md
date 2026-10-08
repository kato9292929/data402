# census

誰に払うことになるのかを、外から・支払わずに・継続して記録する層。形式と規則は
[`spec/11`](../../spec/11-observation-format.md)。

| | |
|---|---|
| `probe.mjs`, `probe-lib.mjs` | 定期プローブ（1回の実行） |
| `schedule.mjs` | `run_interval_hours` ごとに `probe.mjs` を回す |
| `data.ts`, `respond.ts` | 集計と応答（`app/v1/*` と一覧ページが使う） |
| `import-legacy.mjs` | 2026-10-08 の観測を spec/11 の形式に変換した一回限りのスクリプト |
| `research/` | x402-Interlock から移した前身のスクリプト（spec/10）。中身は移管時のまま |
