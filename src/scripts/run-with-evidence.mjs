#!/usr/bin/env node
// v62.2 CP2 — evidence wrapper. Usage:
//   node scripts/run-with-evidence.mjs <name> -- <command> [args...]
//   node scripts/run-with-evidence.mjs test        (builds the vitest command itself)
// Runs the command, writes .release-evidence/<name>.json stamped with the
// current sourceTreeHash, and exits with the command's exit code. Evidence is
// produced AUTOMATICALLY from execution — never hand-written.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { computeSourceTreeHash, hashEntries } from "./lib/sourceTreeHash.mjs";
import { writeEvidence, writeEnvironmentEvidence, EVIDENCE_DIR } from "./lib/evidence.mjs";

const args = process.argv.slice(2);
const name = args[0];
if (!name) { console.error("usage: run-with-evidence.mjs <name> -- <command...>"); process.exit(2); }
const sep = args.indexOf("--");
let command = sep >= 0 ? args.slice(sep + 1) : [];

const tree = computeSourceTreeHash(".");
const lockfileSha = crypto.createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex");
writeEnvironmentEvidence(lockfileSha, tree.hash);

const vitestRaw = path.join(EVIDENCE_DIR, "vitest-raw.json");
if (name === "test" && command.length === 0) {
  command = ["npx", "vitest", "run", "--reporter=default", "--reporter=json", `--outputFile=${vitestRaw}`];
}
if (command.length === 0) { console.error("no command given"); process.exit(2); }

const startedAt = new Date().toISOString();
const res = spawnSync(command[0], command.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
const exitCode = res.status ?? 1;
const completedAt = new Date().toISOString();

const evidence = {
  command: command.join(" "),
  sourceTreeHash: tree.hash,
  startedAt,
  completedAt,
  exitCode,
  ciRunId: process.env.GITHUB_RUN_ID || null,
};

if (name === "test") {
  let totals = null;
  try {
    const raw = JSON.parse(fs.readFileSync(vitestRaw, "utf8"));
    totals = {
      testFiles: raw.numTotalTestSuites ?? null,
      passed: raw.numPassedTests ?? null,
      failed: raw.numFailedTests ?? null,
      skipped: (raw.numPendingTests ?? 0) + (raw.numTodoTests ?? 0),
    };
  } catch { /* totals stay null — a null total is a FAIL downstream, never a fake 0 */ }
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  Object.assign(evidence, totals ? { ...totals } : { testFiles: null, passed: null, failed: null, skipped: null });
  evidence.frameworkVersion = pkg.devDependencies?.vitest ?? null;
  writeEvidence("tests", evidence);
} else if (name === "build") {
  let distHash = null, artifactCount = null;
  if (exitCode === 0 && fs.existsSync("dist")) {
    const entries = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else entries.push({ path: path.relative("dist", p).split(path.sep).join("/"), sha256: crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") });
      }
    };
    walk("dist");
    distHash = hashEntries(entries);
    artifactCount = entries.length;
  }
  Object.assign(evidence, { distHash, artifactCount });
  writeEvidence("build", evidence);
} else {
  writeEvidence(name, evidence);
}

process.exit(exitCode);