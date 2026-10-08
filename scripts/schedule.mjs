// Runs scripts/probe.mjs now and then every run_interval_hours (config/probe.json), in the
// foreground. For a machine with cron, a crontab line does the same (see README).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(path.join(ROOT, "config/probe.json"), "utf8"));
for (;;) {
  const started = Date.now();
  console.log(`[${new Date().toISOString()}] probe run`);
  spawnSync(process.execPath, [path.join(ROOT, "scripts/probe.mjs"), ...process.argv.slice(2)], { stdio: "inherit", cwd: ROOT });
  const wait = Math.max(60_000, cfg.run_interval_hours * 3600_000 - (Date.now() - started));
  console.log(`next run at ${new Date(Date.now() + wait).toISOString()}`);
  await new Promise((r) => setTimeout(r, wait));
}
