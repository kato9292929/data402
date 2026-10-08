// One-time: turn the 2026-10-08 run (data/payto-observations.jsonl, written by Interlock's
// research/probe-catalog.mjs at 8debcd5) into spec/11 rows, so they open data/observations.jsonl.
// That probe kept neither accepts[].extra nor response times: both are null in these rows.
// Usage: node scripts/import-legacy.mjs > rows.jsonl
import { readFileSync } from "node:fs";

const LEGACY = "legacy:x402-Interlock@8debcd5/research/probe-catalog.mjs";
const rows = readFileSync("data/payto-observations.jsonl", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
rows.sort((a, b) => a.observed_at.localeCompare(b.observed_at) || a.endpoint_id.localeCompare(b.endpoint_id));
for (const r of rows) {
  const base = { observed_at: r.observed_at, endpoint_id: r.endpoint_id, host: r.host, url: r.url, status: null, http_status: r.status, payTo: null, amount: null, asset: null, network: null, scheme: null, extra: null, response_ms: null, probe_version: LEGACY, method: r.method };
  let row;
  if (r.status === null) row = { ...base, status: "unreachable", error: r.detail ? `${r.failure}: ${r.detail}` : r.failure };
  else if (r.status !== 402) row = { ...base, status: "no_402" };
  else {
    const sol = r.accepts.filter((a) => a.network_norm === "solana");
    if (!sol.length) row = { ...base, status: "no_solana", ...(r.failure === "unknown_format" ? { error: "402_not_parsed" } : {}) };
    else {
      const a = sol[0];
      row = { ...base, status: "alive", payTo: a.payTo, amount: a.amount === null ? null : String(a.amount), asset: a.asset, network: "solana", scheme: a.scheme, x402_version: r.format === "v2" ? 2 : r.format === "v1" ? 1 : null, accepts: sol.map(({ network_norm, ...x }) => ({ ...x, maxTimeoutSeconds: null, extra: null })) };
    }
  }
  console.log(JSON.stringify(row));
}
