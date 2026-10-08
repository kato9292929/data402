// The one connection from budget to census (rebuild brief, section 4): just before a purchase,
// ask census what it last observed for the seller's host, and record it in the ledger.
// Record only. Nothing here changes a decision; whether census is ever used to decide is left
// until observations have accumulated.
import { hostOf } from "../census/probe-lib.mjs";

export interface CensusObservation {
  host: string | null;
  /** the request made: GET {base}/v1/hosts/{host} */
  census_url: string | null;
  /** observed: census has rows for the host; not_observed: census answered 404; unavailable: no usable answer */
  lookup: "observed" | "not_observed" | "unavailable";
  /** census's latest state of the host, copied as census gave it */
  status: string | null;
  payTo: string[] | null;
  last_seen: string | null;
  last_observed_at: string | null;
  probe_version: string[] | null;
  error?: string;
}

const empty = (host: string | null, census_url: string | null, lookup: CensusObservation["lookup"], error?: string): CensusObservation => ({
  host,
  census_url,
  lookup,
  status: null,
  payTo: null,
  last_seen: null,
  last_observed_at: null,
  probe_version: null,
  ...(error ? { error } : {}),
});

/** CENSUS_BASE_URL, else the gate's own base URL (census and budget are one Next.js app). */
export async function censusObservation(resourceUrl: string, baseUrl: string): Promise<CensusObservation> {
  const host = hostOf(resourceUrl);
  if (!host) return empty(null, null, "unavailable", "resource URL has no host");
  const base = (process.env.CENSUS_BASE_URL || baseUrl).replace(/\/+$/, "");
  const census_url = `${base}/v1/hosts/${encodeURIComponent(host)}`;
  try {
    const res = await fetch(census_url, { signal: AbortSignal.timeout(Number(process.env.CENSUS_TIMEOUT_MS) || 3000) });
    if (res.status === 404) return empty(host, census_url, "not_observed");
    if (!res.ok) return empty(host, census_url, "unavailable", `HTTP ${res.status}`);
    const j = (await res.json()) as { latest?: { status?: string; payTo?: string[]; last_seen?: string | null; last_observed_at?: string; probe_version?: string[] } };
    const l = j.latest;
    if (!l) return empty(host, census_url, "unavailable", "no latest in the answer");
    return {
      host,
      census_url,
      lookup: "observed",
      status: l.status ?? null,
      payTo: Array.isArray(l.payTo) ? l.payTo : null,
      last_seen: l.last_seen ?? null,
      last_observed_at: l.last_observed_at ?? null,
      probe_version: Array.isArray(l.probe_version) ? l.probe_version : null,
    };
  } catch (e) {
    return empty(host, census_url, "unavailable", (e as Error).name === "TimeoutError" ? "timeout" : String((e as Error).message).slice(0, 160));
  }
}
