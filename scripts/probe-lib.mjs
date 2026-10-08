// Pure parts of the probe: which endpoints to observe, and how a response becomes one row.
// No network, no files. Format: spec/11.
import { createHash } from "node:crypto";

export const PROBE_VERSION = "data402-probe@1.0.1";
export const SOLANA_MAINNET = new Set(["solana", "solana:5eykt4usfv8p8njdtrepy1vzqkqzkvdp"]);
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** The catalog's host key: hostname, lower case, without a leading "www.". */
export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** spec/10 revision 2 (2ae1a94), unchanged: USDC, per call, price > 0, seen within 14 days of the catalog, Solana listed. */
export function eligible(catalog, network) {
  const gen = Date.parse(catalog.generated_at);
  return catalog.endpoints.filter(
    (r) =>
      r.price &&
      r.price.currency === "USDC" &&
      r.price.unit === "per-call" &&
      r.price.amount > 0 &&
      gen - Date.parse(r.last_seen) <= 14 * 86400_000 &&
      (r.networks ?? []).includes(network) &&
      hostOf(r.url),
  );
}

const rank = (seed, id) => createHash("sha256").update(`${seed}:${id}`).digest("hex");

/**
 * Up to `max` endpoints per host. Endpoints already observed stay in (earliest first observation
 * first), so the set does not drift from day to day; free places are filled in sha256(seed:id) order.
 * `firstSeen` maps endpoint_id -> ISO time of its first row in observations.jsonl.
 */
export function selectTargets(rows, { max, seed, firstSeen }) {
  const byHost = new Map();
  for (const r of rows) {
    const h = hostOf(r.url);
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push(r);
  }
  const out = [];
  for (const h of [...byHost.keys()].sort()) {
    const rs = byHost.get(h);
    const kept = rs.filter((r) => firstSeen.has(r.id)).sort((a, b) => firstSeen.get(a.id).localeCompare(firstSeen.get(b.id)) || a.id.localeCompare(b.id));
    const rest = rs.filter((r) => !firstSeen.has(r.id)).sort((a, b) => rank(seed, a.id).localeCompare(rank(seed, b.id)));
    for (const r of [...kept, ...rest].slice(0, max)) out.push({ endpoint_id: r.id, host: h, url: r.url });
  }
  return out;
}

function decodeHeader(v) {
  try {
    return JSON.parse(Buffer.from(v, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** The requirements a 402 carries: v2 in the PAYMENT-REQUIRED header (base64 JSON), v1 in the body. */
export function paymentRequirements(headerValue, bodyText) {
  const fromHeader = headerValue ? decodeHeader(headerValue) : null;
  if (fromHeader && Array.isArray(fromHeader.accepts)) return fromHeader;
  try {
    const body = JSON.parse(bodyText);
    if (body && Array.isArray(body.accepts)) return body;
  } catch {
    /* not JSON */
  }
  return null;
}

/** accepts[] entries on Solana mainnet, reduced to the payment fields; extra is kept whole. */
export function solanaAccepts(pr) {
  if (!pr) return [];
  return pr.accepts
    .filter((a) => a && SOLANA_MAINNET.has(String(a.network ?? "").toLowerCase()))
    .map((a) => ({
      scheme: a.scheme ?? null,
      network: a.network,
      amount: a.amount ?? a.maxAmountRequired ?? null,
      asset: a.asset ?? null,
      payTo: a.payTo ?? null,
      maxTimeoutSeconds: a.maxTimeoutSeconds ?? null,
      extra: a.extra ?? null,
    }));
}

/**
 * One observation row (spec/11). `res` is either { error, response_ms, method }
 * or { http_status, header, body, response_ms, method }.
 */
export function toRow(target, res, observedAt) {
  const base = {
    observed_at: observedAt,
    endpoint_id: target.endpoint_id,
    host: target.host,
    url: target.url,
    status: null,
    http_status: null,
    payTo: null,
    amount: null,
    asset: null,
    network: null,
    scheme: null,
    extra: null,
    response_ms: res.response_ms ?? null,
    probe_version: PROBE_VERSION,
    method: res.method ?? null,
  };
  if (res.error) return { ...base, status: "unreachable", error: res.error };
  base.http_status = res.http_status;
  if (res.http_status !== 402) return { ...base, status: "no_402" };
  const pr = paymentRequirements(res.header, res.body);
  const sol = solanaAccepts(pr);
  if (!sol.length) return { ...base, status: "no_solana", ...(pr ? {} : { error: "402_not_parsed" }) };
  const a = sol[0];
  return {
    ...base,
    status: "alive",
    payTo: typeof a.payTo === "string" && BASE58.test(a.payTo) ? a.payTo : null,
    amount: a.amount === null ? null : String(a.amount),
    asset: a.asset,
    network: "solana",
    scheme: a.scheme,
    extra: a.extra,
    x402_version: pr.x402Version ?? null,
    accepts: sol,
  };
}

/** Endpoints whose latest row is older than minHours (or that have none), oldest first. */
export function dueTargets(targets, lastSeen, now, minHours) {
  return targets
    .filter((t) => !lastSeen.has(t.endpoint_id) || now - Date.parse(lastSeen.get(t.endpoint_id)) >= minHours * 3600_000)
    .sort((a, b) => (lastSeen.get(a.endpoint_id) ?? "").localeCompare(lastSeen.get(b.endpoint_id) ?? "") || a.host.localeCompare(b.host));
}
