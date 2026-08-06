#!/usr/bin/env node
// v62.2 CP4 — generates config/typecheck-baseline.candidate.json from a REAL
// tsc run. A candidate is NOT a baseline: it must be reviewed and explicitly
// approved (typecheck-baseline-approve.mjs) before the gate consumes it.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { parseTscOutput } from "./lib/tscDiagnostics.mjs";
import { computeSourceTreeHash } from "./lib/sourceTreeHash.mjs";

const CANDIDATE = "config/typecheck-baseline.candidate.json";

const criticalFiles = JSON.parse(fs.readFileSync("tsconfig.critical.json", "utf8")).include ?? [];
const modifiedFiles = JSON.parse(fs.readFileSync("config/release-touch-list.json", "utf8")).files ?? [];

const res = spawnSync("npx", ["tsc", "-p", "./jsconfig.json", "--pretty", "false"], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
});
const diags = parseTscOutput(`${res.stdout || ""}\n${res.stderr || ""}`);

let tsVersion = null;
try { tsVersion = spawnSync("npx", ["tsc", "--version"], { encoding: "utf8" }).stdout.trim(); } catch { /* null */ }

const tree = computeSourceTreeHash(".");
const criticalSet = new Set(criticalFiles);
const modifiedSet = new Set(modifiedFiles);

fs.writeFileSync(CANDIDATE, JSON.stringify({
  state: "CANDIDATE",
  sourceTreeHash: tree.hash,
  typescriptVersion: tsVersion,
  generatedAt: new Date().toISOString(),
  total: diags.length,
  errors: diags.map((d) => ({
    file: d.file, line: d.line, code: d.code, message: d.message, fingerprint: d.fingerprint,
    inCriticalSet: criticalSet.has(d.file),
    modifiedThisRelease: modifiedSet.has(d.file),
  })),
}, null, 2) + "\n");

const inCritical = diags.filter((d) => criticalSet.has(d.file)).length;
const inModified = diags.filter((d) => modifiedSet.has(d.file)).length;
console.log(`candidate written: ${diags.length} errors (${inCritical} in critical set, ${inModified} in files modified this release) → ${CANDIDATE}`);
console.log(`review it, then approve with: npm run typecheck:baseline:approve -- --review-token=${tree.hash} --confirm=APPROVE`);