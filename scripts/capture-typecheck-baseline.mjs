#!/usr/bin/env node
// v62.1 CP5.2 — captures the CURRENT global typecheck debt as a baseline.
// Each error is identified by a stable fingerprint (file + TS code + message,
// line/column excluded so unrelated edits don't shift identities).
// Overwriting an existing captured baseline requires --force — the baseline
// must never regenerate accidentally (that would silently absorb new debt).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

const OUT = "config/typecheck-baseline.json";
const force = process.argv.includes("--force");

if (fs.existsSync(OUT)) {
  const existing = JSON.parse(fs.readFileSync(OUT, "utf8"));
  if (existing.captured && !force) {
    console.error(`Baseline already captured (${existing.generatedAt}). Use --force to intentionally re-capture.`);
    process.exit(1);
  }
}

export function parseTscOutput(stdout) {
  const counts = new Map(); // fingerprint -> { file, code, message, count }
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/);
    if (!m) continue;
    const [, file, code, message] = m;
    const fp = crypto.createHash("sha256").update(`${file}|${code}|${message}`).digest("hex").slice(0, 16);
    const cur = counts.get(fp) || { file, code, message, count: 0 };
    cur.count += 1;
    counts.set(fp, cur);
  }
  return counts;
}

const res = spawnSync("npx", ["tsc", "-p", "./jsconfig.json", "--pretty", "false"], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const counts = parseTscOutput(`${res.stdout || ""}\n${res.stderr || ""}`);

const entries = {};
let total = 0;
for (const [fp, e] of [...counts.entries()].sort()) {
  entries[fp] = { file: e.file, code: e.code, count: e.count };
  total += e.count;
}
fs.writeFileSync(OUT, JSON.stringify({
  captured: true,
  generatedAt: new Date().toISOString(),
  totalErrors: total,
  distinctFingerprints: Object.keys(entries).length,
  entries,
}, null, 2) + "\n");
console.log(`typecheck baseline captured: ${total} errors, ${Object.keys(entries).length} fingerprints → ${OUT}`);