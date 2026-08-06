#!/usr/bin/env node
// v62.1 CP5.2 — fails when global typecheck debt INCREASES vs the captured
// baseline; passes when it stays equal or shrinks (and reports eliminated debt).
// A missing/uncaptured baseline is a hard fail with instructions — never a
// silent pass.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

const BASELINE = "config/typecheck-baseline.json";

if (!fs.existsSync(BASELINE)) {
  console.error(`typecheck:baseline FAIL — ${BASELINE} missing. Run: npm run typecheck:baseline:capture`);
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
if (!baseline.captured) {
  console.error("typecheck:baseline FAIL — baseline not captured yet (sentinel file). Run: npm run typecheck:baseline:capture");
  process.exit(1);
}

const res = spawnSync("npx", ["tsc", "-p", "./jsconfig.json", "--pretty", "false"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const current = new Map();
for (const line of `${res.stdout || ""}\n${res.stderr || ""}`.split(/\r?\n/)) {
  const m = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/);
  if (!m) continue;
  const [, file, code, message] = m;
  const fp = crypto.createHash("sha256").update(`${file}|${code}|${message}`).digest("hex").slice(0, 16);
  const cur = current.get(fp) || { file, code, count: 0 };
  cur.count += 1;
  current.set(fp, cur);
}

const newErrors = [];
let currentTotal = 0;
for (const [fp, e] of current.entries()) {
  currentTotal += e.count;
  const base = baseline.entries[fp];
  if (!base) newErrors.push(`${e.file} ${e.code} ×${e.count} (new fingerprint)`);
  else if (e.count > base.count) newErrors.push(`${e.file} ${e.code} ×${e.count} (baseline ×${base.count})`);
}
const eliminated = Object.entries(baseline.entries)
  .filter(([fp]) => !current.has(fp))
  .reduce((n, [, e]) => n + e.count, 0);

if (eliminated > 0) console.log(`typecheck:baseline — ${eliminated} baseline error(s) eliminated. Consider re-capturing with --force to lock in the improvement.`);
if (newErrors.length > 0) {
  console.error(`typecheck:baseline FAIL — debt increased (${currentTotal} now vs ${baseline.totalErrors} baseline). New/worsened:`);
  for (const n of newErrors.slice(0, 50)) console.error(`  ${n}`);
  process.exit(1);
}
console.log(`typecheck:baseline PASS — ${currentTotal} errors ≤ baseline ${baseline.totalErrors}.`);