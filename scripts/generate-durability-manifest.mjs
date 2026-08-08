#!/usr/bin/env node
// v0.63.2 — reproducible ECL durability manifest generator/checker.
//
// The durability manifest is deliberately excluded from sourceTreeHash because
// it hashes the tree it lives in. This script independently seals the exact
// files that define the active ECL stage, release boundary and verification
// infrastructure. --check never rewrites the file; it verifies metadata, path
// coverage, byte counts and sha256 values against the live filesystem.
import fs from "node:fs";
import crypto from "node:crypto";
import { allowlistForStage, resolveStage } from "./lib/preEclFreeze.mjs";

const CHECK = process.argv.includes("--check");
const MANIFEST_PATH = "config/p1-durability-manifest.json";
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));

const pkg = readJson("package.json");
const freeze = readJson("config/pre-ecl-freeze.json");
const releaseTouch = readJson("config/release-touch-list.json");
const stage = resolveStage(freeze);
const allowlist = allowlistForStage(stage);

const REQUIRED_INFRA = [
  "package.json",
  "package-lock.json",
  "config/pre-ecl-freeze.json",
  "config/freeze-change-log.json",
  "config/release-touch-list.json",
  "config/typecheck-baseline.json",
  "config/ecl-policy.json",
  "ci/github-workflow-ci.yml",
  ".github/workflows/ci.yml",
  "scripts/generate-durability-manifest.mjs",
  "scripts/generate-release-manifest.mjs",
  "scripts/check-release-manifest.mjs",
  "scripts/install-ci-workflow.mjs",
  "scripts/clean-check.mjs",
  "scripts/advance-stage.mjs",
  "scripts/lib/preEclFreeze.mjs",
  "scripts/lib/sourceTreeHash.mjs",
  "src/docs/OPERATIONS_STATUS.md",
  "src/docs/PRODUCTION_FUNCTIONS.md",
  "tsconfig.critical.json",
];

const expectedPaths = [...new Set([
  ...allowlist,
  ...(Array.isArray(releaseTouch.files) ? releaseTouch.files : []),
  ...REQUIRED_INFRA,
])]
  .filter((path) => path !== MANIFEST_PATH && fs.existsSync(path) && fs.statSync(path).isFile())
  .sort();

const fileEntry = (path) => {
  const bytes = fs.readFileSync(path);
  return { path, sha256: sha256(bytes), bytes: bytes.length };
};

function buildManifest(generatedAt = new Date().toISOString()) {
  const files = expectedPaths.map(fileEntry);
  return {
    release: `${pkg.releaseName} (durability manifest)`,
    generatedAt,
    packageVersion: pkg.version,
    stage,
    freezeStage: stage,
    freezeEntryCount: Array.isArray(freeze.entries) ? freeze.entries.length : 0,
    allowlistCount: allowlist.length,
    fileCount: files.length,
    purpose: "Durability probe for the active ECL stage. Every sha256/bytes pair is read from the live filesystem. A successful --check proves that the stage allowlist, release-touch surface, critical verification infrastructure, CI template/install state and operator-surface artifacts are physically present and byte-identical to this seal.",
    nameNote: "The historical filename p1-durability-manifest.json is retained intentionally to avoid churn; the manifest now covers every active ECL stage through P4 Production Proof.",
    stageNote: "P1/P2/P3/P4 remain authoritative. P4 Production Proof adds the admin ReviewQueue consumer and scheduler runtime observability without adding billing, invoicing, collections, Stripe settlement, payouts or success-fee effects. A recurring Base44 platform automation remains external configuration and a GitHub CI seal requires a real Actions run.",
    history: {
      p1: "Evidence lifecycle schemas and frozen-field boundary.",
      p2: "Domain contracts, policy, serialization and gate semantics.",
      p3: "Deterministic lifecycle engine and canonical process/reprocess boundary.",
      p4: "Operational scheduler/review workflow with fail-closed persistence, replay and concurrency hardening.",
      p4ProductionProof: "Admin operator surface plus best-effort scheduler runtime proof; no economic effects.",
    },
    files,
  };
}

if (!CHECK) {
  const manifest = buildManifest();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  // Read it back and verify the bytes it claims before reporting success.
  const persisted = readJson(MANIFEST_PATH);
  const mismatches = persisted.files.filter((entry) => {
    if (!fs.existsSync(entry.path)) return true;
    const live = fileEntry(entry.path);
    return live.sha256 !== entry.sha256 || live.bytes !== entry.bytes;
  });
  if (mismatches.length > 0) {
    console.error(`durability:generate FAIL — ${mismatches.length} persisted hash mismatch(es).`);
    process.exit(1);
  }
  console.log(`durability:generate PASS — ${manifest.fileCount} files sealed for ${stage}; 0 mismatches.`);
  process.exit(0);
}

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`durability:check FAIL — ${MANIFEST_PATH} missing; run npm run durability:generate`);
  process.exit(1);
}

const manifest = readJson(MANIFEST_PATH);
const failures = [];
const fail = (message) => failures.push(message);
if (manifest.packageVersion !== pkg.version) fail(`packageVersion ${manifest.packageVersion} != ${pkg.version}`);
if (manifest.stage !== stage || manifest.freezeStage !== stage) fail(`stage ${manifest.stage}/${manifest.freezeStage} != ${stage}`);
if (manifest.freezeEntryCount !== freeze.entries.length) fail(`freezeEntryCount ${manifest.freezeEntryCount} != ${freeze.entries.length}`);
if (manifest.allowlistCount !== allowlist.length) fail(`allowlistCount ${manifest.allowlistCount} != ${allowlist.length}`);

const actualPaths = Array.isArray(manifest.files) ? manifest.files.map((entry) => entry.path).sort() : [];
if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
  const missing = expectedPaths.filter((path) => !actualPaths.includes(path));
  const stale = actualPaths.filter((path) => !expectedPaths.includes(path));
  fail(`path set drift${missing.length ? `; missing: ${missing.join(", ")}` : ""}${stale.length ? `; stale: ${stale.join(", ")}` : ""}`);
}
if (manifest.fileCount !== actualPaths.length) fail(`fileCount ${manifest.fileCount} != ${actualPaths.length}`);

for (const entry of manifest.files || []) {
  if (!fs.existsSync(entry.path)) {
    fail(`missing file: ${entry.path}`);
    continue;
  }
  const live = fileEntry(entry.path);
  if (live.sha256 !== entry.sha256) fail(`sha256 mismatch: ${entry.path}`);
  if (live.bytes !== entry.bytes) fail(`byte-count mismatch: ${entry.path}`);
}

if (failures.length > 0) {
  for (const message of failures) console.error(`durability:check FAIL — ${message}`);
  process.exit(1);
}
console.log(`durability:check PASS — ${manifest.fileCount} files, stage ${stage}, 0 mismatches.`);
