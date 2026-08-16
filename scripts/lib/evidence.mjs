// v62.2 CP2 — execution evidence helpers. Every gate command writes a JSON
// artifact into .release-evidence/ stamped with the CURRENT sourceTreeHash;
// the release manifest CONSUMES this evidence and never accepts hand-written
// numbers. An artifact whose sourceTreeHash differs from the current tree is
// STALE and invalid. .release-evidence/ is regenerable, never a contractual
// historical source.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { computeSourceTreeHash } from "./sourceTreeHash.mjs";

export const EVIDENCE_DIR = ".release-evidence";
export const EVIDENCE_SCHEMA_VERSION = "cambra-release-evidence-v2";
export const RELEASE_EVIDENCE_BINDINGS = Object.freeze({
  testEvidence: Object.freeze({ artifact: "tests", command: "npx vitest run --maxWorkers=2 --reporter=default --reporter=json --outputFile=.release-evidence/vitest-raw.json" }),
  buildEvidence: Object.freeze({ artifact: "build", command: "npx vite build" }),
  lintEvidence: Object.freeze({ artifact: "lint", command: "npx eslint . --quiet" }),
  typecheckCriticalEvidence: Object.freeze({ artifact: "typecheck-critical", command: "npx tsc -p ./tsconfig.critical.json" }),
  typecheckBaselineEvidence: Object.freeze({ artifact: "typecheck-baseline", command: "node scripts/check-typecheck-baseline.mjs" }),
  dependencyAuditEvidence: Object.freeze({ artifact: "dependency-audit", command: "npm audit --json" }),
});

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

const sha256Text = (value) => crypto.createHash("sha256").update(value).digest("hex");

export function evidenceDigest(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const { evidenceDigest: _ignored, ...unsigned } = evidence;
  return sha256Text(canonicalJson(unsigned));
}

export function sealEvidence(data) {
  const unsigned = { ...data, evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION };
  return { ...unsigned, evidenceDigest: evidenceDigest(unsigned) };
}

export function evidenceIntegrityStatus(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return "missing";
  if (evidence.evidenceSchemaVersion !== EVIDENCE_SCHEMA_VERSION) return "unsealed";
  if (!/^[a-f0-9]{64}$/.test(String(evidence.evidenceDigest || ""))) return "unsealed";
  if (evidence.evidenceDigest !== evidenceDigest(evidence)) return "tampered";
  return "valid";
}

export function writeEvidence(name, data) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(sealEvidence(data), null, 2) + "\n");
  return file;
}

export function readEvidence(name) {
  const file = path.join(EVIDENCE_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

/** Evidence is valid only when successful AND generated against the current tree. */
export function evidenceStatus(evidence, currentTreeHash) {
  if (!evidence) return "missing";
  const integrity = evidenceIntegrityStatus(evidence);
  if (integrity !== "valid") return integrity;
  if (evidence.sourceTreeHash !== currentTreeHash) return "stale";
  if (evidence.exitCode !== 0) return "failed";
  return "valid";
}

function finiteTimestamp(value) {
  return Number.isFinite(Date.parse(String(value || "")));
}

/** Exact on-disk ↔ embedded binding plus a command-specific evidence schema. */
export function releaseEvidenceStatus(manifestKey, embedded, onDisk, currentTreeHash) {
  const binding = RELEASE_EVIDENCE_BINDINGS[manifestKey];
  if (!binding) return "unknown_binding";
  const status = evidenceStatus(onDisk, currentTreeHash);
  if (status !== "valid") return status;
  if (canonicalJson(embedded) !== canonicalJson(onDisk)) return "manifest_mismatch";
  if (onDisk.command !== binding.command) return "wrong_command";
  if (!finiteTimestamp(onDisk.startedAt) || !finiteTimestamp(onDisk.completedAt)) return "invalid_timestamps";
  if (Date.parse(onDisk.completedAt) < Date.parse(onDisk.startedAt)) return "invalid_timestamps";
  if (manifestKey === "testEvidence") {
    for (const key of ["testFiles", "passed", "failed", "skipped"]) {
      if (!Number.isInteger(onDisk[key]) || onDisk[key] < 0) return "invalid_test_totals";
    }
    if (onDisk.testFiles < 1 || onDisk.passed < 1 || onDisk.failed !== 0 || onDisk.skipped !== 0) return "failed";
  }
  if (manifestKey === "buildEvidence") {
    if (!/^[a-f0-9]{64}$/.test(String(onDisk.distHash || "")) || !Number.isInteger(onDisk.artifactCount) || onDisk.artifactCount < 1) return "invalid_build_artifacts";
  }
  if (manifestKey === "dependencyAuditEvidence") {
    if (onDisk.networkExitCode !== 0 || onDisk.vulnerabilities?.total !== 0 || onDisk.vulnerabilities?.high !== 0 || onDisk.vulnerabilities?.critical !== 0) return "failed";
  }
  return "valid";
}

export function releaseManifestCanonicalStatus(candidate, canonical) {
  if (!candidate || !canonical) return "missing";
  const project = (manifest) => {
    const copy = structuredClone(manifest);
    delete copy.generatedAt;
    return copy;
  };
  return canonicalJson(project(candidate)) === canonicalJson(project(canonical))
    ? "valid"
    : "canonical_mismatch";
}

export function releaseControlEntries(root = ".") {
  const entries = [];
  const add = (rel) => {
    const file = path.join(root, rel);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      entries.push({ path: rel, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") });
    }
  };
  add("RELEASE.json");
  add("config/p1-durability-manifest.json");
  add("base44/.deploy/manifest.json");
  if (fs.existsSync(path.join(root, EVIDENCE_DIR))) {
    for (const name of fs.readdirSync(path.join(root, EVIDENCE_DIR)).sort()) {
      if (name.endsWith(".json")) add(`${EVIDENCE_DIR}/${name}`);
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function releaseControlHash(root = ".") {
  const entries = releaseControlEntries(root);
  return { hash: sha256Text(entries.map((entry) => `${entry.path}\t${entry.sha256}\n`).join("")), fileCount: entries.length, entries };
}

// ── v62.2.3 — typecheck:critical evidence contract ─────────────────────────
// The baseline approval CANNOT infer that typecheck:critical passed from the
// candidate: the candidate runs `tsc -p jsconfig.json`, a project that does not
// include the backend handlers at all, so "zero errors in the critical set"
// only means "zero errors in files that project never looked at". The only
// admissible proof is a fresh evidence artifact produced by the critical
// project itself.
export const CRITICAL_TYPECHECK_PROJECT = "tsconfig.critical.json";
export const CRITICAL_TYPECHECK_EVIDENCE = "typecheck-critical";

/**
 * Returns "valid" only when the artifact proves a GREEN critical typecheck for
 * the CURRENT tree. Any other return value must block approval.
 * `failed` / `diagnostics` are optional (the generic wrapper does not emit them);
 * when present they are enforced, when absent exitCode is the proof.
 */
export function criticalTypecheckEvidenceStatus(evidence, currentTreeHash) {
  if (!evidence) return "missing";
  const integrity = evidenceIntegrityStatus(evidence);
  if (integrity !== "valid") return integrity;
  if (!String(evidence.command || "").includes(CRITICAL_TYPECHECK_PROJECT)) return "wrong_command";
  if (evidence.sourceTreeHash !== currentTreeHash) return "stale";
  if (evidence.exitCode !== 0) return "failed";
  if (evidence.failed !== undefined && evidence.failed !== null && Number(evidence.failed) !== 0) return "failed";
  if (Array.isArray(evidence.diagnostics) && evidence.diagnostics.length > 0) return "diagnostics_present";
  return "valid";
}

export function writeEnvironmentEvidence(lockfileSha, treeHash) {
  let npmVersion = null;
  try {
    npmVersion = execSync("npm --version", { encoding: "utf8" }).trim();
  } catch { /* recorded as null — never invented */ }
  return writeEvidence("environment", {
    node: process.version,
    npm: npmVersion,
    platform: process.platform,
    arch: process.arch,
    lockfileSha,
    sourceTreeHash: treeHash,
    timestamp: new Date().toISOString(),
  });
}

export { computeSourceTreeHash };
