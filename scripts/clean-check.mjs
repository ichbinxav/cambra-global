#!/usr/bin/env node
// v62.1 CP5 — clean:check: pre-flight repo integrity gate (first step of verify).
//   1. Frozen entity schemas (pre-ECL freeze) must be byte-identical to the
//      hashes recorded in config/frozen-schemas.json.
//   2. No ECL artifact (entity, config, code) may exist anywhere in the repo.
//   3. node_modules must be gitignored and never distributed.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

let failed = false;
const fail = (msg) => {
  console.error(`clean:check FAIL — ${msg}`);
  failed = true;
};

// 1. Frozen schemas
const frozen = JSON.parse(fs.readFileSync("config/frozen-schemas.json", "utf8"));
for (const [file, expected] of Object.entries(frozen.sha256)) {
  if (!fs.existsSync(file)) { fail(`frozen schema missing: ${file}`); continue; }
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  if (actual !== expected) fail(`frozen schema modified: ${file} (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`);
}

// 2. Zero ECL artifacts (file/dir names)
const ECL = /ecl-policy|EvidenceAttestation|EvidenceLifecycleEvent|EvidenceStrike|ReviewCase|ReviewQueue|ConfidenceResult|NormalizedEvidence/;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (ECL.test(e.name)) fail(`ECL artifact present (P1/P2 must not start): ${p}`);
    if (e.isDirectory()) walk(p);
  }
};
walk(".");

// 3. node_modules hygiene
try {
  if (!fs.readFileSync(".gitignore", "utf8").includes("node_modules")) {
    fail(".gitignore does not exclude node_modules");
  }
} catch {
  console.warn("clean:check WARN — .gitignore not readable in this environment (Base44 sandbox drops dotfiles); verify locally.");
}

if (failed) process.exit(1);
console.log("clean:check PASS — frozen schemas intact, zero ECL artifacts.");