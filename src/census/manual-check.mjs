// Manual check of census rows against what a person sees at the same URL (spec/12).
// The draw follows spec/09 section 3 (ad1a960) as adapted in spec/12 section 2, using the
// stratification and random stream of x402-Interlock research/observe-sample.mjs. Inputs are read
// from the pinned commits (spec/12 section 1), never from the working files.
//
//   node src/census/manual-check.mjs draw  <endpoint checkout>   -> data/manual-check-20261009-blank.csv
//   node src/census/manual-check.mjs merge <endpoint checkout>   -> data/manual-check-20261009.csv
//   node src/census/manual-check.mjs tally
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SNAPSHOT = "0414c41a174131861719bc4f61a4acf4da4dac25";
const UPPER = "2026-10-08T15:07:38.717Z";
const CATALOG_COMMIT = "432b3bf02947ef832d97041b188594d7ddee2657";
const SEED = 20261008;
const TOTAL = 40;
const DATE = "20261009";
const BLANK = path.join(ROOT, `data/manual-check-${DATE}-blank.csv`);
const FULL = path.join(ROOT, `data/manual-check-${DATE}.csv`);
const STATUSES = ["alive", "no_challenge", "no_solana", "unavailable", "no_402", "unreachable"];
const BLANK_COLS = ["host", "endpoint_id", "url", "method", "observed_at", "probe_version", "seen_status", "seen_payTo", "seen_amount", "checked_at", "checker"];
const FULL_COLS = ["host", "endpoint_id", "url", "method", "observed_at", "recorded_status", "recorded_http_status", "recorded_payTo", "recorded_amount", "recorded_asset", "recorded_error", "probe_version", "seen_status", "seen_payTo", "seen_amount", "match", "note", "checked_at", "gap_hours", "checker", "stratum"];
const MATCH = ["一致", "不一致", "判定不能"];

const gitShow = (cwd, commit, file) => execFileSync("git", ["-C", cwd, "show", `${commit}:${file}`], { maxBuffer: 1 << 30 });

// ---- csv
const q = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function writeCsv(file, header, cols, rows) {
  const lines = [...header.map((h) => `# ${h}`), cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))];
  writeFileSync(file, lines.join("\n") + "\n");
}
function readCsv(file) {
  const text = readFileSync(file, "utf8");
  const header = [];
  const records = [];
  let row = [], field = "", inQ = false, lineStart = true, comment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (lineStart && !inQ && c === "#") comment = true;
    lineStart = false;
    if (comment) {
      if (c === "\n") { header.push(field.replace(/^# ?/, "")); field = ""; comment = false; lineStart = true; } else field += c;
      continue;
    }
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') inQ = false; else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) records.push(row);
      row = []; lineStart = true;
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); records.push(row); }
  const [cols, ...data] = records;
  return { header, cols, rows: data.map((r) => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? "").trim()]))) };
}

// ---- the draw (spec/12 section 2)
async function draw(checkout) {
  const catalog = JSON.parse(gunzipSync(gitShow(checkout, CATALOG_COMMIT, "data/endpoints_full.json.gz")).toString("utf8"));
  const rank = JSON.parse(gitShow(checkout, CATALOG_COMMIT, "data/rank.json").toString("utf8"));
  const targets = JSON.parse(gitShow(ROOT, SNAPSHOT, "data/targets.json").toString("utf8"));
  if (catalog.generated_at !== targets.catalog_generated_at) throw new Error(`catalog ${catalog.generated_at} is not the one targets.json was drawn from (${targets.catalog_generated_at})`);
  // brands.mjs as of the catalog commit, unchanged
  const brandsFile = path.join(ROOT, "var", "manual-check", `brands-${CATALOG_COMMIT.slice(0, 7)}.mjs`);
  execFileSync("mkdir", ["-p", path.dirname(brandsFile)]);
  writeFileSync(brandsFile, gitShow(checkout, CATALOG_COMMIT, "scripts/brands.mjs"));
  const { BRANDS, hostOf, firstPartyBrand, borrowedBrand } = await import(pathToFileURL(brandsFile).href);

  const gen = Date.parse(catalog.generated_at);
  const eligible = catalog.endpoints.filter((r) => r.price && r.price.currency === "USDC" && r.price.unit === "per-call" && r.price.amount > 0 && gen - Date.parse(r.last_seen) <= 14 * 86400_000 && (r.networks ?? []).includes("Solana"));
  const population = new Set(targets.endpoints.map((e) => e.host));
  const labels = [...new Set(Object.values(BRANDS))];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordRe = labels.map((l) => new RegExp(`(^|[^a-z0-9])${esc(l.toLowerCase())}([^a-z0-9]|$)`));
  const brandish = (r, host) => !!firstPartyBrand(host) || !!borrowedBrand(host) || wordRe.some((re) => re.test(`${r.name ?? ""} ${r.description ?? ""}`.toLowerCase()));

  const byHost = new Map();
  for (const r of eligible) {
    const h = hostOf(r.url);
    if (!h || !population.has(h)) continue;
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push(r);
  }
  const missing = [...population].filter((h) => !byHost.has(h));
  if (missing.length) throw new Error(`hosts in targets.json without catalog records: ${missing.join(", ")}`);
  const top = new Set(rank.rows.map((x) => x.host));
  const strata = { B: [], H: [], M: [], L: [] };
  for (const [h, rs] of byHost) {
    if (rs.some((r) => brandish(r, h))) strata.B.push(h);
    else if (top.has(h)) strata.H.push(h);
    else if (rs.some((r) => r.popularity !== undefined)) strata.M.push(h);
    else strata.L.push(h);
  }
  for (const k of Object.keys(strata)) strata[k].sort();

  // mulberry32, seed 20261008, used in the order of observe-sample.mjs
  let s = SEED;
  const rnd = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (arr, n) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, n);
  };
  const chosen = {};
  let rule;
  if (strata.B.length <= TOTAL) {
    rule = "09-3 as fixed: B all, the rest split equally over H, M, L, remainder to L";
    chosen.B = strata.B;
    const each = Math.floor((TOTAL - strata.B.length) / 3);
    chosen.H = pick(strata.H, Math.min(each, strata.H.length));
    chosen.M = pick(strata.M, Math.min(each, strata.M.length));
    chosen.L = pick(strata.L, Math.max(0, TOTAL - chosen.B.length - chosen.H.length - chosen.M.length));
  } else {
    rule = "B > total: the owner's 09-3 proposal scaled (B ceil(0.34 x total), H all, M all, L the rest)";
    chosen.B = pick(strata.B, Math.ceil(TOTAL * 0.34));
    chosen.H = pick(strata.H, Math.min(strata.H.length, TOTAL - chosen.B.length));
    chosen.M = pick(strata.M, Math.min(strata.M.length, TOTAL - chosen.B.length - chosen.H.length));
    chosen.L = pick(strata.L, Math.max(0, TOTAL - chosen.B.length - chosen.H.length - chosen.M.length));
  }

  // the rows to check: the newest row at or before UPPER of the chosen endpoint
  const obs = gitShow(ROOT, SNAPSHOT, "data/observations.jsonl").toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const latest = new Map();
  for (const r of obs) {
    if (r.observed_at > UPPER) continue;
    const cur = latest.get(r.endpoint_id);
    if (!cur || r.observed_at > cur.observed_at) latest.set(r.endpoint_id, r);
  }
  const out = [];
  for (const [k, hosts] of Object.entries(chosen)) {
    for (const h of hosts) {
      const ts = targets.endpoints.filter((e) => e.host === h).sort((a, b) => a.url.localeCompare(b.url));
      const t = ts[Math.floor(rnd() * ts.length)];
      const r = latest.get(t.endpoint_id);
      if (!r) throw new Error(`no row for ${t.endpoint_id} at or before ${UPPER}`);
      out.push({ stratum: k, target: t, row: r });
    }
  }
  return { strata, chosen, rule, out, targets };
}

function headerLines(d) {
  return [
    `spec: spec/12-manual-check.md`,
    `observations.jsonl: data402 commit ${SNAPSHOT}`,
    `observed_at upper bound: ${UPPER}`,
    `population: ${d.targets.hosts} hosts / ${d.targets.endpoints.length} endpoints (data/targets.json at ${SNAPSHOT.slice(0, 7)}; catalog endpoint@${CATALOG_COMMIT.slice(0, 7)}, generated_at ${d.targets.catalog_generated_at})`,
    `draw: seed ${SEED} (mulberry32), spec/09 section 3 (ad1a960) as adapted in spec/12 section 2; total ${TOTAL} hosts, 1 endpoint per host; rule used: ${d.rule}`,
    `strata (hosts in population): B ${d.strata.B.length}, H ${d.strata.H.length}, M ${d.strata.M.length}, L ${d.strata.L.length}; drawn: B ${d.chosen.B.length}, H ${d.chosen.H.length}, M ${d.chosen.M.length}, L ${d.chosen.L.length}`,
  ];
}

const rowOf = (x) => ({
  host: x.target.host,
  endpoint_id: x.target.endpoint_id,
  url: x.target.url,
  method: x.row.method ?? "GET",
  observed_at: x.row.observed_at,
  probe_version: x.row.probe_version,
  recorded_status: x.row.status,
  recorded_http_status: x.row.http_status,
  recorded_payTo: x.row.payTo,
  recorded_amount: x.row.amount,
  recorded_asset: x.row.asset,
  recorded_error: x.row.error,
  stratum: x.stratum,
});

const [cmd, checkout] = process.argv.slice(2);
if (cmd === "draw") {
  if (existsSync(BLANK) && !process.argv.includes("--force")) throw new Error(`${path.relative(ROOT, BLANK)} exists; it may already be filled in`);
  const d = await draw(path.resolve(checkout));
  writeCsv(BLANK, headerLines(d), BLANK_COLS, d.out.map(rowOf));
  console.log(`${path.relative(ROOT, BLANK)}: ${d.out.length} endpoints on ${d.out.length} hosts; ${headerLines(d).at(-1)}`);
} else if (cmd === "merge") {
  if (existsSync(FULL) && !process.argv.includes("--force")) throw new Error(`${path.relative(ROOT, FULL)} exists; match may already be filled in`);
  const d = await draw(path.resolve(checkout));
  const filled = readCsv(BLANK);
  const seen = new Map(filled.rows.map((r) => [r.endpoint_id, r]));
  const problems = [];
  const rows = d.out.map((x) => {
    const r = rowOf(x);
    const f = seen.get(r.endpoint_id);
    if (!f) problems.push(`${r.endpoint_id}: not in the filled sheet`);
    const seen_status = f?.seen_status ?? "";
    if (seen_status && !STATUSES.includes(seen_status)) problems.push(`${r.endpoint_id}: seen_status ${seen_status} is not one of ${STATUSES.join(", ")}`);
    const checked = f?.checked_at ? Date.parse(f.checked_at) : NaN;
    if (f?.checked_at && Number.isNaN(checked)) problems.push(`${r.endpoint_id}: checked_at ${f.checked_at} is not a time`);
    return {
      ...r,
      seen_status,
      seen_payTo: f?.seen_payTo ?? "",
      seen_amount: f?.seen_amount ?? "",
      match: "",
      note: "",
      checked_at: f?.checked_at ?? "",
      gap_hours: Number.isNaN(checked) ? "" : ((checked - Date.parse(r.observed_at)) / 3600_000).toFixed(1),
      checker: f?.checker ?? "",
    };
  });
  if (problems.length) throw new Error(`filled sheet: ${problems.join("; ")}`);
  writeCsv(FULL, headerLines(d), FULL_COLS, rows);
  console.log(`${path.relative(ROOT, FULL)}: ${rows.length} rows; fill in match (and note) per spec/12 section 5, then run tally`);
} else if (cmd === "tally") {
  const { rows } = readCsv(FULL);
  const counts = Object.fromEntries(MATCH.map((m) => [m, 0]));
  const bad = rows.filter((r) => !MATCH.includes(r.match));
  if (bad.length) throw new Error(`match missing or not one of ${MATCH.join(" / ")}: ${bad.map((r) => r.endpoint_id).join(", ")}`);
  for (const r of rows) counts[r.match]++;
  const gaps = rows.map((r) => Number(r.gap_hours)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  console.log(JSON.stringify({ rows: rows.length, ...counts, gap_hours: gaps.length ? { min: gaps[0], max: gaps.at(-1) } : null }));
  console.log("A mismatch cannot be told apart as a probe error or a change after the observation; read it with gap_hours (spec/12 section 6). Only the drawn endpoints were checked.");
} else {
  console.log("usage: node src/census/manual-check.mjs draw|merge <endpoint checkout> | tally");
}
