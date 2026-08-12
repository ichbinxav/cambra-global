#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { spawnSync } from "node:child_process";
import {
  collectSourceTreeEntries,
  computeSourceTreeHash,
  hashEntries,
} from "./lib/sourceTreeHash.mjs";
import { collectReleasePayloadPaths } from "./lib/releasePayload.mjs";
import { evidenceStatus } from "./lib/evidence.mjs";

const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fail = (message) => { console.error(`release:package FAIL — ${message}`); process.exit(1); };
const args = process.argv.slice(2);
const outputFlag = args.indexOf("--output");
const requestedOutput = outputFlag >= 0 ? args[outputFlag + 1] : null;
if (outputFlag >= 0 && !requestedOutput) fail("--output requires a file path");

const root = process.cwd();
if (!fs.existsSync(path.join(root, "RELEASE.json"))) fail("RELEASE.json missing; run npm run verify first");
const release = JSON.parse(fs.readFileSync(path.join(root, "RELEASE.json"), "utf8"));
if (release.productionSealEligible !== true && requestedOutput && /production[-_ ]sealed/i.test(path.basename(requestedOutput))) {
  fail("refusing a PRODUCTION-SEALED filename while RELEASE.json says productionSealEligible=false");
}
const tree = computeSourceTreeHash(root);
if (release.sourceTreeHash !== tree.hash || release.sourceTreeFileCount !== tree.fileCount) {
  fail("RELEASE.json does not identify the current source tree");
}
for (const key of ["testEvidence", "buildEvidence", "lintEvidence", "typecheckCriticalEvidence", "typecheckBaselineEvidence", "dependencyAuditEvidence"]) {
  if (evidenceStatus(release[key], tree.hash) !== "valid") fail(`${key} is missing, stale or failed`);
}

const safeVersion = String(release.version).replace(/[^0-9A-Za-z._-]/g, "-");
const archiveName = `CAMBRA-v${safeVersion}-verified.zip`;
const output = path.resolve(requestedOutput || path.join(root, ".release-artifacts", archiveName));
if (output.startsWith(`${root}${path.sep}`) && !output.includes(`${path.sep}.release-artifacts${path.sep}`)) {
  fail("output inside the source tree must be under .release-artifacts/");
}
fs.mkdirSync(path.dirname(output), { recursive: true });

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cambra-release-"));
const top = `CAMBRA-v${safeVersion}`;
const stage = path.join(temp, top);
fs.mkdirSync(stage, { recursive: true });
const payloadPaths = collectReleasePayloadPaths(root);
const fixedTime = new Date("2000-01-01T00:00:00.000Z");
for (const rel of payloadPaths) {
  const source = path.join(root, rel);
  const target = path.join(stage, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  fs.chmodSync(target, fs.statSync(source).mode & 0o111 ? 0o755 : 0o644);
  fs.utimesSync(target, fixedTime, fixedTime);
}

if (fs.existsSync(output)) fs.unlinkSync(output);
const zipPaths = payloadPaths.map((rel) => `${top}/${rel}`);
const zipped = spawnSync("zip", ["-q", "-X", "-9", output, "-@"], {
  cwd: temp,
  input: `${zipPaths.join("\n")}\n`,
  encoding: "utf8",
  env: { ...process.env, TZ: "UTC" },
});
if (zipped.status !== 0) fail(`zip failed: ${String(zipped.stderr || zipped.error || "unknown error").trim()}`);

const extractionRoot = path.join(temp, "reextracted");
fs.mkdirSync(extractionRoot, { recursive: true });
const unzipped = spawnSync("unzip", ["-q", output, "-d", extractionRoot], { encoding: "utf8" });
if (unzipped.status !== 0) fail(`unzip failed: ${String(unzipped.stderr || unzipped.error || "unknown error").trim()}`);
const extractedRoot = path.join(extractionRoot, top);
const extractedTree = computeSourceTreeHash(extractedRoot);
const extractedSourcePaths = collectSourceTreeEntries(extractedRoot).map((entry) => entry.path);
const sourcePaths = collectSourceTreeEntries(root).map((entry) => entry.path);
if (JSON.stringify(extractedSourcePaths) !== JSON.stringify(sourcePaths)) fail("re-extracted source path set differs from the hashed source path set");
if (extractedTree.hash !== tree.hash || extractedTree.fileCount !== tree.fileCount) fail("re-extracted source identity differs from RELEASE.json");

const evidenceEntries = payloadPaths
  .filter((rel) => rel.startsWith(".release-evidence/"))
  .map((rel) => ({ path: rel, sha256: sha256File(path.join(root, rel)) }));
const payloadEntries = payloadPaths.map((rel) => ({ path: rel, sha256: sha256File(path.join(root, rel)) }));
const packageSha = sha256File(output);
const integrity = {
  schema_version: "cambra-artifact-integrity-v1",
  release_version: release.version,
  git_sha: release.gitSha,
  source_tree_hash_algorithm: release.sourceTreeHashAlgorithm,
  source_tree_hash: tree.hash,
  source_tree_file_count: tree.fileCount,
  lockfile_sha256: release.lockfileSha,
  node_version: release.nodeVersion,
  npm_version: release.npmVersion,
  evidence_bundle_hash: hashEntries(evidenceEntries),
  payload_hash: hashEntries(payloadEntries),
  payload_file_count: payloadPaths.length,
  package_file: path.basename(output),
  package_sha256: packageSha,
  reextracted_source_tree_hash: extractedTree.hash,
  reextracted_source_tree_file_count: extractedTree.fileCount,
  reextracted_match: true,
  status: "PASS",
  production_seal_eligible: release.productionSealEligible === true,
  production_verdict: release.finalVerdict,
  pending_production_requirements: release.manualRequirements || [],
  generated_at: new Date().toISOString(),
};
const integrityPath = `${output}.integrity.json`;
fs.writeFileSync(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`);
fs.writeFileSync(`${output}.sha256`, `${packageSha}  ${path.basename(output)}\n`);
console.log(JSON.stringify({ output, integrityPath, sha256: packageSha, sourceTreeHash: tree.hash, sourceTreeFileCount: tree.fileCount, payloadFileCount: payloadPaths.length, reextractedMatch: true }, null, 2));
