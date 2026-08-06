#!/usr/bin/env node
// v62.2 CP5 — installs the CI workflow template into the executable path.
//   node scripts/install-ci-workflow.mjs           copy (refuses to overwrite a DIFFERENT file)
//   node scripts/install-ci-workflow.mjs --confirm overwrite a differing existing workflow
//   node scripts/install-ci-workflow.mjs --check   report state, exit 0 only if WORKFLOW_INSTALLED
// Context: the Base44 GitHub sync has no permission to write .github/workflows/,
// so a human must run this from a real checkout (or copy the file manually).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SRC = "ci/github-workflow-ci.yml";
const DEST = ".github/workflows/ci.yml";
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

const checkMode = process.argv.includes("--check");
const confirm = process.argv.includes("--confirm");

if (!fs.existsSync(SRC)) { console.error(`ci FAIL — template missing: ${SRC}`); process.exit(1); }

const installed = fs.existsSync(DEST);
const identical = installed && sha(SRC) === sha(DEST);

if (checkMode) {
  if (identical) { console.log("ci:check — WORKFLOW_INSTALLED (byte-identical to template). Execution state is proven only by CI evidence (release:check:ci)."); process.exit(0); }
  if (installed) { console.error("ci:check FAIL — a DIFFERENT workflow exists at .github/workflows/ci.yml (template drift). Re-run ci:install --confirm after review."); process.exit(1); }
  console.error("ci:check FAIL — TEMPLATE_READY only: workflow not installed. Run: npm run ci:install (from a real checkout; Base44's sync cannot write .github/workflows/)."); process.exit(1);
}

if (identical) { console.log("ci:install — already installed and byte-identical. Nothing to do."); process.exit(0); }
if (installed && !confirm) {
  console.error("ci:install FAIL — a different workflow already exists. Review it, then re-run with --confirm to overwrite.");
  process.exit(1);
}
fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.copyFileSync(SRC, DEST);
if (sha(SRC) !== sha(DEST)) { console.error("ci:install FAIL — copy is not byte-identical"); process.exit(1); }
console.log(`ci:install — installed ${DEST} (sha256 ${sha(DEST).slice(0, 12)}…). Commit and push to activate.`);