#!/usr/bin/env node
// v62.2 CP7 / v62.3 — clean:check: pre-flight repo integrity gate (first step of verify).
//   0. The freeze config must declare a KNOWN stage. Missing/unknown → hard fail
//      (never a permissive default), and the allowlist is taken from CODE, not
//      from the JSON, so editing the JSON cannot widen scope.
//   1. Every frozen file must be byte-identical to config/pre-ecl-freeze.json —
//      missing/moved files fail.
//   2. Frozen schemas must not gain ECL fields (except the 2 sanctioned by the
//      stage's allowlist); the frozen handler must never import ECL code.
//   3. No ECL artifact (file/dir name) may exist anywhere in the repo, EXCEPT
//      the exact paths on the current stage's allowlist.
//   4. node_modules must be gitignored.
//   5. Reports the CI workflow state (TEMPLATE_READY / WORKFLOW_INSTALLED) —
//      informational here; release:check:ci enforces execution.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { checkFreeze, ECL_NAME_PATTERN, resolveStage, allowlistForStage, normalizePath, STAGE_ECL_P1 } from "./lib/preEclFreeze.mjs";

let failed = false;
const fail = (msg) => { console.error(`clean:check FAIL — ${msg}`); failed = true; };

const freeze = JSON.parse(fs.readFileSync("config/pre-ecl-freeze.json", "utf8"));

// 0. Stage resolution — throws (exit 1) on a missing or unknown stage.
let stage;
try {
  stage = resolveStage(freeze);
} catch (err) {
  console.error(`clean:check FAIL — ${err.message}`);
  process.exit(1);
}
const allowlist = allowlistForStage(stage).map(normalizePath);

// The stage's allowlist is code-owned; the JSON copy must agree with it exactly.
const declared = (freeze.allowlist || []).map(normalizePath);
if (declared.length !== allowlist.length || declared.some((p) => !allowlist.includes(p))) {
  fail(`config/pre-ecl-freeze.json allowlist does not match the code-owned allowlist for stage ${stage}`);
}

// 1+2. Frozen files (hash + ECL-field + ECL-import checks in the shared lib)
const readFile = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null);
const result = checkFreeze(freeze.entries, readFile, { stage });
for (const f of result.failures) fail(f);

// 3. ECL artifacts by name, repo-wide — allowlisted paths only
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "coverage", ".release-evidence"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    const rel = normalizePath(p);
    if (ECL_NAME_PATTERN.test(e.name) && !allowlist.includes(rel)) {
      fail(stage === STAGE_ECL_P1
        ? `ECL artifact outside the ${stage} allowlist: ${rel}`
        : `ECL artifact present (P1/P2 must not start): ${rel}`);
    }
    if (e.isDirectory()) walk(p);
  }
};
walk(".");
if (fs.existsSync("config/ecl-policy.json")) fail("config/ecl-policy.json exists — the ECL policy layer must not start");

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
console.log(`clean:check PASS — stage ${stage}: freeze intact (${freeze.entries.length} entries), ECL artifacts limited to the ${allowlist.length} allowlisted path(s).`);