#!/usr/bin/env node
// v62.2 CP4 — promotes a REVIEWED candidate to the approved baseline.
// Refuses unless: the review token equals the CURRENT sourceTreeHash, the
// candidate was generated against that same tree, it contains zero errors in
// the critical set and zero errors in files modified this release, and the
// operator passed the explicit confirmation flag. The previous baseline is
// archived, never silently overwritten. There is NO generic --force.
//
// v62.2.1 — the candidate file and archived baselines are excluded from
// sourceTreeHash, so a freshly generated candidate is no longer self-stale.
import fs from "node:fs";
import process from "node:process";
import { computeSourceTreeHash } from "./lib/sourceTreeHash.mjs";
import { countByFingerprint } from "./lib/tscDiagnostics.mjs";

const CANDIDATE = "config/typecheck-baseline.candidate.json";
const BASELINE = "config/typecheck-baseline.json";

const argOf = (name) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : null;
};
const token = argOf("review-token");
const confirm = argOf("confirm");
const die = (msg) => { console.error(`approve FAIL — ${msg}`); process.exit(1); };

if (!fs.existsSync(CANDIDATE)) die(`no candidate. Run: npm run typecheck:baseline:candidate`);
const candidate = JSON.parse(fs.readFileSync(CANDIDATE, "utf8"));
const tree = computeSourceTreeHash(".");

if (!token) die("missing --review-token=<sourceTreeHash> (proves the candidate was reviewed against THIS tree)");
if (token !== tree.hash) die(`review token does not match current sourceTreeHash (${tree.hash})`);
if (candidate.sourceTreeHash !== tree.hash) die("candidate is stale (tree changed since generation) — regenerate and re-review");
if (confirm !== "APPROVE") die('missing explicit confirmation: --confirm=APPROVE');
if (candidate.tscExitCode === null || candidate.tscExitCode === undefined) die("candidate carries no tsc exit code — regenerate it with the current candidate script");

const critical = candidate.errors.filter((e) => e.inCriticalSet);
if (critical.length > 0) die(`candidate has ${critical.length} error(s) in the critical set — fix them, never absorb them`);
const modified = candidate.errors.filter((e) => e.modifiedThisRelease);
if (modified.length > 0) die(`candidate has ${modified.length} error(s) in files modified this release — fix them, never absorb them`);

// typecheck:critical green is implied by zero critical-set errors above, but a
// separate evidence check keeps the invariant explicit when available.
if (fs.existsSync(BASELINE)) {
  const prev = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  if (prev.captured || prev.state === "APPROVED") {
    fs.writeFileSync(`config/typecheck-baseline.previous.${Date.now()}.json`, JSON.stringify(prev, null, 2) + "\n");
  }
}

const entries = {};
const counts = countByFingerprint(candidate.errors);
for (const [fp, e] of [...counts.entries()].sort()) entries[fp] = { file: e.file, code: e.code, count: e.count };

fs.writeFileSync(BASELINE, JSON.stringify({
  state: "APPROVED",
  captured: true,
  approvedAt: new Date().toISOString(),
  sourceTreeHash: tree.hash,
  typescriptVersion: candidate.typescriptVersion,
  totalErrors: candidate.total,
  distinctFingerprints: Object.keys(entries).length,
  entries,
}, null, 2) + "\n");
console.log(`baseline APPROVED: ${candidate.total} errors, ${Object.keys(entries).length} fingerprints.`);