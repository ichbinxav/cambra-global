#!/usr/bin/env node
// v62.2 CP4 — generates config/typecheck-baseline.candidate.json from a REAL
// tsc run. A candidate is NOT a baseline: it must be reviewed and explicitly
// approved (typecheck-baseline-approve.mjs) before the gate consumes it.
//
// v62.2.1 fixes two defects:
//   1. The candidate file is EXCLUDED from sourceTreeHash (see
//      lib/sourceTreeHash.mjs), so writing it no longer changes the tree and
//      the approve step can never call its own fresh candidate "stale".
//   2. tsc execution is VERIFIED (assertTscRan): a spawn failure or an
//      unparseable non-zero exit aborts instead of minting a fake 0-error
//      candidate.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import { parseTscOutput, assertTscRan } from "./lib/tscDiagnostics.mjs";
import { computeSourceTreeHash } from "./lib/sourceTreeHash.mjs";

const CANDIDATE = "config/typecheck-baseline.candidate.json";

const criticalFiles = JSON.parse(fs.readFileSync("tsconfig.critical.json", "utf8")).include ?? [];
const modifiedFiles = JSON.parse(fs.readFileSync("config/release-touch-list.json", "utf8")).files ?? [];

const res = spawnSync("npx", ["tsc", "-p", "./jsconfig.json", "--pretty", "false"], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024, shell: process.platform === "win32",
});
const diags = parseTscOutput(`${res.stdout || ""}\n${res.stderr || ""}`);

const ran = assertTscRan(res, diags.length);
if (!ran.ok) {
  console.error(`candidate FAIL — ${ran.reason}`);
  process.exit(1);
}

let tsVersion = null;
try {
  const v = spawnSync("npx", ["tsc", "--version"], { encoding: "utf8", shell: process.platform === "win32" });
  tsVersion = v.status === 0 ? (v.stdout || "").trim() || null : null;
} catch { /* null, never invented */ }

const tree = computeSourceTreeHash(".");
const criticalSet = new Set(criticalFiles);
const modifiedSet = new Set(modifiedFiles);

fs.writeFileSync(CANDIDATE, JSON.stringify({
  state: "CANDIDATE",
  sourceTreeHash: tree.hash,
  typescriptVersion: tsVersion,
  tscExitCode: res.status,
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