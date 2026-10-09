// /v1/hosts/{host} history: at most 90 rows, newest first (spec/11 section 4, brief section 3).
// Synthetic rows in a temporary data/ directory; the real data is not read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("hostDetail: 130 rows of one host -> history of 90, newest first; history_total 130", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "census-"));
  mkdirSync(path.join(dir, "data"));
  const rows = Array.from({ length: 130 }, (_, i) => ({
    observed_at: new Date(Date.UTC(2026, 9, 1) + i * 3600_000).toISOString(),
    endpoint_id: `e${i % 4}`,
    host: "h.example",
    url: `https://h.example/${i % 4}`,
    status: i % 2 ? "alive" : "unavailable",
    http_status: i % 2 ? 402 : 503,
    payTo: i % 2 ? "Pay1111111111111111111111111111111" : null,
    amount: null,
    asset: null,
    network: i % 2 ? "solana" : null,
    scheme: null,
    extra: null,
    response_ms: 1,
    probe_version: "test",
  }));
  writeFileSync(path.join(dir, "data", "observations.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const { hostDetail } = await import("../src/census/data");
    const d = hostDetail("h.example")!;
    assert.equal(d.history.length, 90);
    assert.equal(d.history_total, 130);
    assert.equal(d.history[0].observed_at, rows[129].observed_at);
    assert.equal(d.history[89].observed_at, rows[40].observed_at);
    assert.equal(d.latest.length, 4);
    assert.equal(d.summary.status, "alive");
  } finally {
    process.chdir(cwd);
  }
});
