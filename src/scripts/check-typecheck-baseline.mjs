#!/usr/bin/env node
// v62.2 CP4 — baseline gate. States: SENTINEL (no approved baseline → FAIL
// with the exact manual commands), APPROVED (compare). Fails on: total
// increase, new fingerprint, worsened count, ANY error in the critical set,
// ANY error in files modified this release. Passes when debt holds or shrinks
// (eliminated debt is reported). Recapture is never silent — see the
// candidate/approve flow.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { parseTscOutput, compareToBaseline } from "./lib/tscDiagnostics.mjs";

const BASELINE = "config/typecheck-baseline.json";

if (!fs.existsSync(BASELINE)) {
  console.error("typecheck:baseline FAIL — baseline missing. Manual flow:\n  npm run typecheck:baseline:candidate\n  (review the candidate)\n  npm run typecheck:baseline:approve -- --review-token=<sourceTreeHash> --confirm=APPROVE");
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
if (baseline.state !== "APPROVED" || !baseline.captured) {
  console.error("typecheck:baseline FAIL — baseline is a SENTINEL (not approved). Run the candidate/approve flow (see script header). ⏳ MANUAL REQUIRED once.");
  process.exit(1);
}

const criticalFiles = JSON.parse(fs.readFileSync("tsconfig.critical.json", "utf8")).include ?? [];
const modifiedFiles = JSON.parse(fs.readFileSync("config/release-touch-list.json", "utf8")).files ?? [];

const res = spawnSync("npx", ["tsc", "-p", "./jsconfig.json", "--pretty", "false"], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
});
const diags = parseTscOutput(`${res.stdout || ""}\n${res.stderr || ""}`);
const result = compareToBaseline(diags, baseline.entries, { criticalFiles, modifiedFiles });

if (result.eliminated > 0) {
  console.log(`typecheck:baseline — ${result.eliminated} baseline error(s) eliminated. Lock in the improvement via a NEW candidate/approve cycle.`);
}
if (!result.ok) {
  console.error(`typecheck:baseline FAIL — ${result.currentTotal} now vs ${baseline.totalErrors} approved:`);
  for (const f of result.failures.slice(0, 50)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`typecheck:baseline PASS — ${result.currentTotal} errors ≤ approved ${baseline.totalErrors}.`);