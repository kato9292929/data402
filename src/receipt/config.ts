import { readFileSync } from "node:fs";
import path from "node:path";

// receipt settings (config/receipt.json). Replaces the delivery_review part of Interlock's
// config/appe-thresholds.json; the values are the same.
export interface ReceiptConfig {
  /** record: check each paid task purchase and write a delivery_review event; off: do nothing */
  mode: "off" | "record";
  /** stage 6 rules over the latest `window` checks of the same target (src/receipt/history.ts) */
  history: { window: number; poor_at: number; mismatch_at: number };
}

export function loadReceiptConfig(file = process.env.RECEIPT_CONFIG_PATH ?? path.join(process.cwd(), "config", "receipt.json")): ReceiptConfig {
  const t = JSON.parse(readFileSync(file, "utf8")) as ReceiptConfig;
  if (!["off", "record"].includes(t.mode)) throw new Error("receipt mode must be off or record");
  return t;
}
