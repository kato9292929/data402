import { createHash } from "node:crypto";

// receipt: compare what came back from a paid purchase with what was asked for, by code only.
// Moved from x402-Interlock lib/delivery.ts (Delivery Review), keeping its deterministic checks
// (section 5-2 of Interlock spec/07) unchanged; the judge-model part was not moved. It records;
// it never refunds or reverses a payment, and a single check is not a score for the seller.

/** What the purchase was meant to obtain, given with the payment request. */
export interface Requirements {
  /** the period the data must cover, ISO dates */
  period?: { from: string; to: string };
  /** fields every returned item (or the body, if there are no items) must have */
  required_fields?: string[];
  /** minimum number of returned items */
  min_items?: number;
}

export function parseRequirements(v: unknown): Requirements | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const out: Requirements = {};
  const p = r.period as Record<string, unknown> | undefined;
  if (p && typeof p.from === "string" && typeof p.to === "string") out.period = { from: p.from, to: p.to };
  if (Array.isArray(r.required_fields)) out.required_fields = r.required_fields.filter((x): x is string => typeof x === "string").slice(0, 50);
  if (typeof r.min_items === "number" && r.min_items >= 0) out.min_items = Math.floor(r.min_items);
  return Object.keys(out).length ? out : undefined;
}

export interface FieldCheck {
  status_ok: boolean;
  json: boolean;
  item_count: number | null;
  /** required fields missing from at least one item (names only) */
  missing_fields: string[];
  period: "match" | "mismatch" | "absent" | "not_requested";
  min_items_ok: boolean | null;
  fields_ok: boolean;
}

/** The items in a body: the body itself if it is an array, else its first array-valued field. */
function itemsOf(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") for (const v of Object.values(body)) if (Array.isArray(v)) return v;
  return null;
}

/** Deterministic checks (section 5-2): status, JSON, item count, required fields, period. */
export function checkFields(status: number, text: string, req: Requirements | undefined): FieldCheck {
  let body: unknown;
  let json = true;
  try {
    body = JSON.parse(text);
  } catch {
    json = false;
  }
  const items = json ? itemsOf(body) : null;
  const missing = new Set<string>();
  for (const f of req?.required_fields ?? []) {
    const targets = items && items.length ? items : [body];
    if (targets.some((t) => !t || typeof t !== "object" || !(f in (t as object)))) missing.add(f);
  }
  let period: FieldCheck["period"] = "not_requested";
  if (req?.period) {
    const p = (body as { period?: { from?: unknown; to?: unknown } } | null)?.period;
    period = !p || typeof p.from !== "string" || typeof p.to !== "string" ? "absent" : p.from === req.period.from && p.to === req.period.to ? "match" : "mismatch";
  }
  const min_items_ok = req?.min_items === undefined ? null : (items?.length ?? 0) >= req.min_items;
  const status_ok = status >= 200 && status < 300;
  return {
    status_ok,
    json,
    item_count: items ? items.length : null,
    missing_fields: [...missing],
    period,
    min_items_ok,
    fields_ok: status_ok && json && missing.size === 0 && period !== "mismatch" && period !== "absent" && min_items_ok !== false,
  };
}

export const bodySha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** What receipt records for one paid purchase: the code checks, the body's hash and size, never the body. */
export interface Receipt {
  body_sha256: string;
  body_size: number;
  latency_ms: number;
  http_status: number;
  fields_ok: boolean;
  fields: FieldCheck;
  requirements: Requirements | null;
}

export function receiptOf(i: { status: number; text: string; latency_ms: number; requirements?: Requirements }): Receipt {
  const fields = checkFields(i.status, i.text, i.requirements);
  return {
    body_sha256: bodySha256(i.text),
    body_size: Buffer.byteLength(i.text, "utf8"),
    latency_ms: i.latency_ms,
    http_status: i.status,
    fields_ok: fields.fields_ok,
    fields,
    requirements: i.requirements ?? null,
  };
}
