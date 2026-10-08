import { test } from "node:test";
import assert from "node:assert/strict";
import { dueTargets, selectTargets, toRow } from "../src/census/probe-lib.mjs";

const t = { endpoint_id: "e1", host: "a.example", url: "https://a.example/x" };
const at = "2026-10-08T00:00:00.000Z";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
const SOL = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const PAY = "DiBRhfjnY6BmnwPpAUK6UYS5mtS7ME9HKUYDVeHfQ9qW";

test("v2 header: first Solana entry, extra kept whole", () => {
  const hdr = b64({ x402Version: 2, accepts: [{ network: "eip155:8453", payTo: "0xabc", amount: "1" }, { scheme: "exact", network: SOL, amount: "300000", asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", payTo: PAY, extra: { feePayer: "Fee1111111111111111111111111111111" } }] });
  const r = toRow(t, { method: "GET", http_status: 402, header: hdr, body: "", response_ms: 12 }, at);
  assert.equal(r.status, "alive");
  assert.equal(r.payTo, PAY);
  assert.equal(r.amount, "300000");
  assert.equal(r.network, "solana");
  assert.deepEqual(r.extra, { feePayer: "Fee1111111111111111111111111111111" });
  assert.equal(r.accepts.length, 1);
  assert.equal(r.response_ms, 12);
});

test("v1 body with maxAmountRequired", () => {
  const body = JSON.stringify({ x402Version: 1, accepts: [{ scheme: "exact", network: "solana", maxAmountRequired: "5000", asset: "X", payTo: PAY }] });
  const r = toRow(t, { method: "POST", http_status: 402, header: null, body }, at);
  assert.equal(r.status, "alive");
  assert.equal(r.amount, "5000");
  assert.equal(r.extra, null);
});

test("unreadable payTo is null, the row stays alive", () => {
  const hdr = b64({ accepts: [{ network: SOL, amount: "1", payTo: "not an address" }] });
  const r = toRow(t, { http_status: 402, header: hdr, body: "" }, at);
  assert.equal(r.status, "alive");
  assert.equal(r.payTo, null);
});

test("other statuses", () => {
  assert.equal(toRow(t, { error: "timeout" }, at).status, "unreachable");
  assert.equal(toRow(t, { http_status: 404, body: "" }, at).status, "no_402");
  const base = toRow(t, { http_status: 402, header: b64({ accepts: [{ network: "eip155:8453", payTo: "0x1", amount: "1" }] }), body: "" }, at);
  assert.equal(base.status, "no_solana");
  const junk = toRow(t, { http_status: 402, header: null, body: "<html>" }, at);
  assert.equal(junk.status, "no_solana");
  assert.equal(junk.error, "402_not_parsed");
  const devnet = toRow(t, { http_status: 402, header: b64({ accepts: [{ network: "solana-devnet", payTo: PAY, amount: "1" }] }), body: "" }, at);
  assert.equal(devnet.status, "no_solana");
});

test("selection keeps observed endpoints, then fills by hash; at most max per host", () => {
  const rows = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, url: `https://www.h.example/${id}` }));
  const firstSeen = new Map([["f", "2026-10-01T00:00:00Z"], ["e", "2026-10-02T00:00:00Z"]]);
  const s = selectTargets(rows, { max: 4, seed: 1, firstSeen });
  assert.equal(s.length, 4);
  assert.deepEqual(s.slice(0, 2).map((x) => x.endpoint_id), ["f", "e"]);
  assert.equal(s[0].host, "h.example");
  assert.deepEqual(selectTargets(rows, { max: 4, seed: 1, firstSeen }), s);
});

test("due: never observed or older than min hours, oldest first", () => {
  const ts = [{ endpoint_id: "x", host: "a" }, { endpoint_id: "y", host: "b" }, { endpoint_id: "z", host: "c" }];
  const now = Date.parse("2026-10-09T12:00:00Z");
  const last = new Map([["x", "2026-10-09T00:00:00Z"], ["y", "2026-10-08T00:00:00Z"]]);
  assert.deepEqual(dueTargets(ts, last, now, 20).map((t) => t.endpoint_id), ["z", "y"]);
});
