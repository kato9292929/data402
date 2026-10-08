// One probe run: read the catalog, pick the Solana targets, ask each due endpoint for its 402
// without paying, and append one row per endpoint to data/observations.jsonl. Never rewrites a row.
// No payment header is ever sent. Settings: config/probe.json. Format: spec/11.
//
// Usage: node src/census/probe.mjs [--catalog <path or URL>] [--limit N] [--min-hours H] [--dry-run] [--out file]
// Behind an HTTP(S) proxy: NODE_USE_ENV_PROXY=1 node src/census/probe.mjs
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROBE_VERSION, dueTargets, eligible, selectTargets, toRow } from "./probe-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const cfg = JSON.parse(readFileSync(path.join(ROOT, "config/probe.json"), "utf8"));
const OUT = path.resolve(opt("--out", path.join(ROOT, "data/observations.jsonl")));
const TARGETS = path.join(path.dirname(OUT), "targets.json");
const LOCK = path.join(path.dirname(OUT), ".probe.lock");
const CATALOG = opt("--catalog", cfg.catalog);
const LIMIT = Number(opt("--limit", "0")) || Infinity;
const DRY = args.includes("--dry-run");
const MIN_HOURS = Number(opt("--min-hours", cfg.min_reobserve_hours));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadCatalog(src) {
  const buf = /^https?:\/\//.test(src) ? Buffer.from(await (await fetch(src, { signal: AbortSignal.timeout(120_000) })).arrayBuffer()) : readFileSync(src);
  const text = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  return JSON.parse(text);
}

function readRows(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function once(url, method) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { "user-agent": cfg.user_agent, accept: "application/json", ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      body: method === "POST" ? "{}" : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(cfg.request_timeout_ms),
    });
    const body = await res.text().catch(() => "");
    return { method, http_status: res.status, header: res.headers.get("payment-required"), body, retryAfter: res.headers.get("retry-after"), response_ms: Math.round(performance.now() - t0) };
  } catch (e) {
    const c = e?.cause;
    const err = e?.name === "TimeoutError" ? "timeout" : (c ? [c.code, c.message].filter((x) => x !== undefined && x !== "").join(": ") : String(e?.message ?? e)).slice(0, 160);
    return { method, error: err, response_ms: Math.round(performance.now() - t0) };
  }
}

/** One request with at most one retry: after a network error, or after a 429/503 (Retry-After, capped). */
async function request(url, method, state) {
  let r = await once(url, method);
  if (r.error) {
    await sleep(cfg.error_retry_wait_ms);
    r = await once(url, method);
  } else if (r.http_status === 429 || r.http_status === 503) {
    if (r.http_status === 429) state.n429++;
    await sleep(Math.min(cfg.max_retry_after_s, Number(r.retryAfter) || 30) * 1000);
    r = await once(url, method);
    if (r.http_status === 429) state.n429++;
  }
  return r;
}

/** GET first; some sellers answer 402 only to POST, so a non-402 answer is asked once more by POST. */
async function observe(t, state) {
  const observedAt = new Date().toISOString();
  let res = await request(t.url, "GET", state);
  if (!res.error && res.http_status !== 402 && state.n429 < 2) {
    await sleep(cfg.same_host_gap_ms);
    const p = await request(t.url, "POST", state);
    if (!p.error && p.http_status === 402) res = p;
  }
  return toRow(t, res, observedAt);
}

// ---- plan
const catalog = await loadCatalog(CATALOG);
const existing = readRows(OUT);
const firstSeen = new Map();
const lastSeen = new Map();
for (const r of existing) {
  if (!firstSeen.has(r.endpoint_id) || r.observed_at < firstSeen.get(r.endpoint_id)) firstSeen.set(r.endpoint_id, r.observed_at);
  if (!lastSeen.has(r.endpoint_id) || r.observed_at > lastSeen.get(r.endpoint_id)) lastSeen.set(r.endpoint_id, r.observed_at);
}
const pool = eligible(catalog, cfg.network);
const targets = selectTargets(pool, { max: cfg.max_endpoints_per_host, seed: cfg.selection_seed, firstSeen });
const due = dueTargets(targets, lastSeen, Date.now(), MIN_HOURS).slice(0, LIMIT);
const hosts = new Set(targets.map((t) => t.host));
console.log(`catalog ${catalog.generated_at}: ${pool.length} eligible endpoints; targets ${targets.length} endpoints on ${hosts.size} hosts; due ${due.length}`);

if (DRY) process.exit(0);

let lock;
try {
  lock = openSync(LOCK, "wx");
} catch {
  console.error(`another run holds ${LOCK}; remove it if no run is active`);
  process.exit(1);
}
const release = () => {
  try {
    closeSync(lock);
    unlinkSync(LOCK);
  } catch {
    /* already gone */
  }
};
process.on("SIGINT", () => {
  release();
  process.exit(130);
});

writeFileSync(
  TARGETS,
  JSON.stringify(
    {
      written_at: new Date().toISOString(),
      probe_version: PROBE_VERSION,
      catalog_source: CATALOG,
      catalog_generated_at: catalog.generated_at,
      rule: "USDC, per-call, price > 0, last_seen within 14 days of catalog generated_at, networks includes Solana (spec/10 revision 2, 2ae1a94); up to max_endpoints_per_host per host (spec/11)",
      network: cfg.network,
      max_endpoints_per_host: cfg.max_endpoints_per_host,
      selection_seed: cfg.selection_seed,
      hosts: hosts.size,
      endpoints: targets,
    },
    null,
    1,
  ) + "\n",
);

// ---- run: one worker per host at a time, requests to the same host spaced by same_host_gap_ms
const byHost = new Map();
for (const t of due) {
  if (!byHost.has(t.host)) byHost.set(t.host, []);
  byHost.get(t.host).push(t);
}
const queue = [...byHost.entries()];
const deadline = Date.now() + cfg.max_run_minutes * 60_000;
const counts = {};
let written = 0;
let stopped = null;

async function worker() {
  while (queue.length) {
    if (Date.now() > deadline) {
      stopped = `max_run_minutes (${cfg.max_run_minutes}) reached; the rest stays due for the next run`;
      return;
    }
    const [host, ts] = queue.shift();
    const state = { n429: 0 };
    for (const [i, t] of ts.entries()) {
      if (i > 0) await sleep(cfg.same_host_gap_ms);
      if (state.n429 >= 2) break; // a host that answered 429 twice gets no more requests this run
      if (Date.now() > deadline) break;
      const row = await observe(t, state);
      appendFileSync(OUT, JSON.stringify(row) + "\n");
      counts[row.status] = (counts[row.status] ?? 0) + 1;
      written++;
    }
    if (written && written % 50 < ts.length) console.log(`${written}/${due.length} rows (last host ${host})`);
  }
}

try {
  await Promise.all(Array.from({ length: cfg.concurrency }, worker));
} finally {
  release();
}
console.log(`wrote ${written} rows to ${path.relative(ROOT, OUT)}: ${JSON.stringify(counts)}`);
if (stopped) console.log(stopped);
if (written < due.length) console.log(`${due.length - written} due endpoints not observed this run; they come first next run`);
