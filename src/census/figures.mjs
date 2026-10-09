// The submission figures, computed once from one pinned snapshot (spec/13).
// W and W' come from src/census/research/payto-summary.mjs, unchanged: the code that implements
// spec/10 c856aae (W) and c56f71a (platform candidates, W'). Its input format is the 2026-10-08
// one, so the snapshot's rows are converted to it first (spec/13 section 2).
//
//   node src/census/figures.mjs <snapshot commit> <observed_at upper bound> <endpoint checkout at 432b3bf>
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CATALOG_COMMIT = "432b3bf02947ef832d97041b188594d7ddee2657";
const [SNAPSHOT, UPPER, checkout] = process.argv.slice(2);
if (!SNAPSHOT || !UPPER || !checkout) throw new Error("usage: figures.mjs <snapshot commit> <observed_at upper bound> <endpoint checkout>");
const head = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"]).toString().trim();
if (head !== CATALOG_COMMIT) throw new Error(`endpoint checkout is at ${head}, not ${CATALOG_COMMIT}`);
const show = (file) => execFileSync("git", ["-C", ROOT, "show", `${SNAPSHOT}:${file}`], { maxBuffer: 1 << 30 }).toString("utf8");

const rows = show("data/observations.jsonl").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const targets = JSON.parse(show("data/targets.json"));
const inTargets = new Set(targets.endpoints.map((e) => e.endpoint_id));
const latest = new Map();
for (const r of rows) {
  if (r.observed_at > UPPER || !inTargets.has(r.endpoint_id)) continue;
  const cur = latest.get(r.endpoint_id);
  if (!cur || r.observed_at > cur.observed_at) latest.set(r.endpoint_id, r);
}
const missing = targets.endpoints.filter((e) => !latest.has(e.endpoint_id)).map((e) => e.endpoint_id);

// spec/13 section 2: the latest row of each target endpoint, in the 2026-10-08 format
const legacy = [...latest.values()].map((r) => ({
  observed_at: r.observed_at,
  endpoint_id: r.endpoint_id,
  url: r.url,
  host: r.host,
  own: false,
  method: r.method,
  status: r.http_status,
  accepts: (r.accepts ?? []).map((a) => ({ network: a.network, network_norm: "solana", asset: a.asset, amount: a.amount, payTo: a.payTo, scheme: a.scheme })),
  failure: r.status === "alive" ? null : r.status,
}));
const tmp = path.join(ROOT, "var", "figures");
mkdirSync(tmp, { recursive: true });
const legacyFile = path.join(tmp, `latest-${SNAPSHOT.slice(0, 7)}.jsonl`);
writeFileSync(legacyFile, legacy.map((x) => JSON.stringify(x)).join("\n") + "\n");
const summary = execFileSync(process.execPath, [path.join(ROOT, "src/census/research/payto-summary.mjs"), checkout, legacyFile, "--network", "Solana"], { cwd: ROOT }).toString("utf8");
const line = (label) => summary.split("\n").find((l) => l.startsWith(label)) ?? "";
const num = (label, re) => {
  const m = line(label).match(re);
  if (!m) throw new Error(`payto-summary: no "${label}" line matching ${re}`);
  return m.slice(1).map(Number);
};
const [readable] = num("payTo readable (X)", /\(X\)\s+(\d+)/);
const [W, wHosts, wPayTo] = num("W hosts / distinct payTo", /\(line 1\.5\)\s+([\d.]+).*\((\d+) hosts, (\d+) payTo\)/);
const [largest] = num("  hosts paid to the largest payTo", /payTo\s+(\d+)/);
const [cand, candHosts] = num("platform candidates (N=5", /domains\)\s+(\d+) payTo, (\d+) hosts/);
const [W2, w2Hosts, w2PayTo] = num("W' without them", /\(line 1\.5\)\s+([\d.]+).*\((\d+) hosts, (\d+) payTo\)/);

// host status: the rule of spec/11 section 4 (alive if any endpoint's latest row is alive, else the newest latest row)
const byHost = new Map();
for (const r of latest.values()) byHost.set(r.host, [...(byHost.get(r.host) ?? []), r]);
const hostStatus = {};
for (const rs of byHost.values()) {
  const s = rs.some((r) => r.status === "alive") ? "alive" : rs.reduce((a, b) => (a.observed_at >= b.observed_at ? a : b)).status;
  hostStatus[s] = (hostStatus[s] ?? 0) + 1;
}
const endpointStatus = {};
for (const r of latest.values()) endpointStatus[r.status] = (endpointStatus[r.status] ?? 0) + 1;
const upto = rows.filter((r) => r.observed_at <= UPPER);
const out = {
  snapshot: SNAPSHOT,
  observed_at_upper_bound: UPPER,
  catalog: { commit: CATALOG_COMMIT, generated_at: targets.catalog_generated_at },
  unit_note: "Hosts are a full count of the targets; endpoints are not: at most 4 per host.",
  target_hosts: targets.hosts,
  target_endpoints: targets.endpoints.length,
  eligible_endpoints_in_catalog: Number((execFileSync(process.execPath, [path.join(ROOT, "src/census/probe.mjs"), "--catalog", path.join(checkout, "data/endpoints_full.json.gz"), "--dry-run"], { cwd: ROOT }).toString().match(/(\d+) eligible endpoints/) ?? [])[1]),
  endpoints_without_a_row: missing.length,
  latest_rows_used: latest.size,
  latest_rows_probe_versions: [...new Set([...latest.values()].map((r) => r.probe_version))],
  hosts_with_payTo_read: readable,
  distinct_payTo: wPayTo,
  W: { value: W, hosts: wHosts, payTo: wPayTo, rule: "spec/10 c856aae" },
  platform_candidates: { payTo: cand, hosts: candHosts, rule: "spec/10 c56f71a, N=5" },
  W_prime: { value: W2, hosts: w2Hosts, payTo: w2PayTo, rule: "spec/10 c56f71a" },
  hosts_paid_to_largest_payTo: largest,
  host_status: hostStatus,
  endpoint_status: endpointStatus,
  observation_rows: upto.length,
  rows_with_feePayer: upto.filter((r) => r.extra && typeof r.extra === "object" && "feePayer" in r.extra).length,
  payto_summary_output: summary.trim().split("\n"),
};
console.log(JSON.stringify(out, null, 2));
