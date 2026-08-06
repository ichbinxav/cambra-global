#!/usr/bin/env node
// v62.2 CP7 — clean:check: pre-flight repo integrity gate (first step of verify).
//   1. Every pre-ECL frozen file (3 schemas + processUploadedFile) must be
//      byte-identical to config/pre-ecl-freeze.json — missing/moved files fail.
//   2. Frozen schemas must not gain ECL fields; the frozen handler must not
//      import ECL code.
//   3. No ECL artifact (file/dir name) may exist anywhere in the repo.
//   4. node_modules must be gitignored.
//   5. Reports the CI workflow state (TEMPLATE_READY / WORKFLOW_INSTALLED) —
//      informational here; release:check:ci enforces execution.
import fs from "node:fs";
import path from "node:path";
import { checkFreeze, ECL_NAME_PATTERN } from "./lib/preEclFreeze.mjs";

let failed = false;
const fail = (msg) => { console.error(`clean:check FAIL — ${msg}`); failed = true; };

// 1+2. Frozen files (hash + ECL-field + ECL-import checks in the shared lib)
const freeze = JSON.parse(fs.readFileSync("config/pre-ecl-freeze.json", "utf8"));
const readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null);
const result = checkFreeze(freeze.entries, readFile);
for (const f of result.failures) fail(f);

// 3. Zero ECL artifacts by name, repo-wide
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "coverage", ".release-evidence"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (ECL_NAME_PATTERN.test(e.name)) fail(`ECL artifact present (P1/P2 must not start): ${p}`);
    if (e.isDirectory()) walk(p);
  }
};
walk(".");
if (fs.existsSync("config/ecl-policy.json")) fail("config/ecl-policy.json exists — ECL must not start");

// 4. node_modules hygiene
try {
  if (!fs.readFileSync(".gitignore", "utf8").includes("node_modules")) fail(".gitignore does not exclude node_modules");
} catch {
  console.warn("clean:check WARN — .gitignore unreadable in this environment (Base44 sandbox drops dotfiles); verify locally.");
}

// 5. CI workflow state (informational)
const installed = fs.existsSync(".github/workflows/ci.yml");
console.log(`clean:check — CI workflow state: ${installed ? "WORKFLOW_INSTALLED" : "TEMPLATE_READY (run: npm run ci:install)"}`);

if (failed) process.exit(1);
console.log("clean:check PASS — pre-ECL freeze intact (schemas + processUploadedFile), zero ECL artifacts.");