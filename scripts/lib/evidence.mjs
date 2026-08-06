// v62.2 CP2 — execution evidence helpers. Every gate command writes a JSON
// artifact into .release-evidence/ stamped with the CURRENT sourceTreeHash;
// the release manifest CONSUMES this evidence and never accepts hand-written
// numbers. An artifact whose sourceTreeHash differs from the current tree is
// STALE and invalid. .release-evidence/ is regenerable, never a contractual
// historical source.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { computeSourceTreeHash } from "./sourceTreeHash.mjs";

export const EVIDENCE_DIR = ".release-evidence";

export function writeEvidence(name, data) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
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
  if (evidence.sourceTreeHash !== currentTreeHash) return "stale";
  if (evidence.exitCode !== 0) return "failed";
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