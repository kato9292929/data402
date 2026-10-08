// Reads data/observations.jsonl and data/targets.json and groups the rows. Facts only: every value
// here is copied from a row or counted from rows. Grouping rules: spec/11 section 4.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export type Status = "alive" | "no_402" | "unreachable" | "no_solana";

export type Observation = {
  observed_at: string;
  endpoint_id: string;
  host: string;
  url: string;
  status: Status;
  http_status: number | null;
  payTo: string | null;
  amount: string | null;
  asset: string | null;
  network: string | null;
  scheme: string | null;
  extra: Record<string, unknown> | null;
  response_ms: number | null;
  probe_version: string;
  method?: string | null;
  error?: string;
  x402_version?: number | null;
  accepts?: unknown[];
};

export const DISCLOSURE = {
  ja: "data402 の運営者は、x402 のデータを扱っている（x402 出品カタログ kato9292929/endpoint を運営している）。ここにある観測は、支払いを行わずに各エンドポイントへ要求を送り、返ってきた 402 を読み取ったものである。対象は Solana を受け付ける出品のみ。観測した事実と観測日時だけを返し、出品者についての判定は行わない。",
  en: "The operator of data402 works with x402 data (it runs the x402 catalog kato9292929/endpoint). Each observation is a request sent without payment and a reading of the 402 that came back. Only listings that accept Solana are covered. Only observed facts and observation times are returned; no judgement about any seller is made.",
  method: "HTTP GET (then POST with an empty JSON body if GET did not answer 402), no payment header, redirects not followed; payment requirements read from the PAYMENT-REQUIRED header (x402 v2) or the response body (v1). See spec/11.",
  source: "https://github.com/kato9292929/data402",
};

const DATA = path.join(process.cwd(), "data");
const OBS = path.join(DATA, "observations.jsonl");
const TARGETS = path.join(DATA, "targets.json");

let cache: { mtime: number; size: number; rows: Observation[] } | null = null;

export function observations(): Observation[] {
  if (!existsSync(OBS)) return [];
  const st = statSync(OBS);
  if (cache && cache.mtime === st.mtimeMs && cache.size === st.size) return cache.rows;
  const rows = readFileSync(OBS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Observation);
  cache = { mtime: st.mtimeMs, size: st.size, rows };
  return rows;
}

export type Targets = { catalog_generated_at: string; hosts: number; endpoints: { endpoint_id: string; host: string; url: string }[] };

export function targets(): Targets | null {
  if (!existsSync(TARGETS)) return null;
  return JSON.parse(readFileSync(TARGETS, "utf8")) as Targets;
}

const later = (a: Observation, b: Observation) => (a.observed_at >= b.observed_at ? a : b);

export type HostSummary = {
  host: string;
  status: Status;
  payTo: string[];
  amount: { amount: string | null; asset: string | null; scheme: string | null }[];
  last_seen: string | null;
  first_seen: string | null;
  last_observed_at: string;
  endpoints: number;
  in_current_targets: boolean;
  probe_version: string[];
};

function uniqBy<T>(xs: T[], key: (x: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of xs) if (!m.has(key(x))) m.set(key(x), x);
  return [...m.values()];
}

/** Latest row of each endpoint of a host. */
function latestPerEndpoint(rows: Observation[]): Observation[] {
  const m = new Map<string, Observation>();
  for (const r of rows) m.set(r.endpoint_id, m.has(r.endpoint_id) ? later(m.get(r.endpoint_id)!, r) : r);
  return [...m.values()].sort((a, b) => a.url.localeCompare(b.url));
}

function summarize(host: string, rows: Observation[], current: Set<string>): { summary: HostSummary; latest: Observation[] } {
  const latest = latestPerEndpoint(rows);
  const aliveNow = latest.filter((r) => r.status === "alive");
  const newest = latest.reduce(later);
  const alive = rows.filter((r) => r.status === "alive").map((r) => r.observed_at).sort();
  return {
    latest,
    summary: {
      host,
      // spec/11 section 4: "alive" if the latest row of any endpoint is alive, else the status of the newest latest row
      status: aliveNow.length ? "alive" : newest.status,
      payTo: [...new Set(aliveNow.map((r) => r.payTo).filter((x): x is string => !!x))].sort(),
      amount: uniqBy(
        aliveNow.map((r) => ({ amount: r.amount, asset: r.asset, scheme: r.scheme })),
        (x) => `${x.amount}|${x.asset}|${x.scheme}`,
      ),
      last_seen: alive.at(-1) ?? null,
      first_seen: alive[0] ?? null,
      last_observed_at: newest.observed_at,
      endpoints: latest.length,
      in_current_targets: current.has(host),
      probe_version: [...new Set(latest.map((r) => r.probe_version))],
    },
  };
}

function byHost(): Map<string, Observation[]> {
  const m = new Map<string, Observation[]>();
  for (const r of observations()) {
    if (!m.has(r.host)) m.set(r.host, []);
    m.get(r.host)!.push(r);
  }
  return m;
}

function currentHosts(): Set<string> {
  return new Set((targets()?.endpoints ?? []).map((e) => e.host));
}

export function allHosts(): HostSummary[] {
  const cur = currentHosts();
  return [...byHost()].map(([h, rs]) => summarize(h, rs, cur).summary).sort((a, b) => a.host.localeCompare(b.host));
}

export function hostDetail(host: string, historyLimit = 90) {
  const rs = byHost().get(host.toLowerCase());
  if (!rs) return null;
  const { summary, latest } = summarize(host.toLowerCase(), rs, currentHosts());
  const history = [...rs].sort((a, b) => b.observed_at.localeCompare(a.observed_at)).slice(0, historyLimit);
  return { summary, latest, history, history_total: rs.length };
}

export function payToHosts(address: string) {
  const rows = observations().filter((r) => r.status === "alive" && r.payTo === address);
  if (!rows.length) return null;
  const cur = currentHosts();
  const latestByHost = new Map([...byHost()].map(([h, rs]) => [h, latestPerEndpoint(rs)]));
  const m = new Map<string, Observation[]>();
  for (const r of rows) {
    if (!m.has(r.host)) m.set(r.host, []);
    m.get(r.host)!.push(r);
  }
  return [...m]
    .map(([host, rs]) => {
      const ts = rs.map((r) => r.observed_at).sort();
      return {
        host,
        first_seen_with_this_payTo: ts[0],
        last_seen_with_this_payTo: ts.at(-1)!,
        // whether the latest row of any of the host's endpoints names this payTo
        named_in_latest_observation: (latestByHost.get(host) ?? []).some((r) => r.status === "alive" && r.payTo === address),
        endpoints_naming_it: new Set(rs.map((r) => r.endpoint_id)).size,
        in_current_targets: cur.has(host),
      };
    })
    .sort((a, b) => a.host.localeCompare(b.host));
}

export function meta() {
  const rows = observations();
  const last = rows.reduce<string | null>((m, r) => (m === null || r.observed_at > m ? r.observed_at : m), null);
  return {
    observations: rows.length,
    last_observed_at: last,
    probe_versions: [...new Set(rows.map((r) => r.probe_version))],
    catalog_generated_at: targets()?.catalog_generated_at ?? null,
  };
}

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
