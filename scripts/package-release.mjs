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
import { assertReleaseBundleIdentity, inspectBase44Bundle } from "./lib/base44Bundle.mjs";
import {
  readEvidence,
  releaseControlHash,
  releaseEvidenceStatus,
  RELEASE_EVIDENCE_BINDINGS,
} from "./lib/evidence.mjs";

const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fail = (message) => { console.error(`release:package FAIL — ${message}`); process.exit(1); };
const args = process.argv.slice(2);
const outputFlag = args.indexOf("--output");
const requestedOutput = outputFlag >= 0 ? args[outputFlag + 1] : null;
if (outputFlag >= 0 && !requestedOutput) fail("--output requires a file path");

const root = process.cwd();
// Evidence and RELEASE.json are intentionally excluded from sourceTreeHash to
// avoid a circular hash. Packaging therefore re-runs the canonical verification
// pipeline itself; it never trusts a previously editable manifest/evidence set.
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const verified = spawnSync(npmCommand, ["run", "verify"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: false,
});
if (verified.status !== 0) fail("canonical npm run verify failed; no archive was emitted");
if (!fs.existsSync(path.join(root, "RELEASE.json"))) fail("RELEASE.json missing after canonical verification");
const release = JSON.parse(fs.readFileSync(path.join(root, "RELEASE.json"), "utf8"));
if (release.productionSealEligible !== true && requestedOutput && /(?:production|prod)[-_ ]?seal(?:ed)?/i.test(path.basename(requestedOutput))) {
  fail("refusing a PRODUCTION-SEALED filename while RELEASE.json says productionSealEligible=false");
}
const tree = computeSourceTreeHash(root);
if (release.sourceTreeHash !== tree.hash || release.sourceTreeFileCount !== tree.fileCount) {
  fail("RELEASE.json does not identify the current source tree");
}
for (const [manifestKey, binding] of Object.entries(RELEASE_EVIDENCE_BINDINGS)) {
  const status = releaseEvidenceStatus(manifestKey, release[manifestKey], readEvidence(binding.artifact), tree.hash);
  if (status !== "valid") fail(`${binding.artifact} evidence is ${status} after canonical verification`);
}
let rootBundleIdentity;
try {
  rootBundleIdentity = inspectBase44Bundle(root);
  assertReleaseBundleIdentity(release, rootBundleIdentity, "release_root_bundle");
} catch (error) {
  fail(`verified Base44 bundle is missing or inconsistent: ${String(error?.message || error)}`);
}
const releaseControl = releaseControlHash(root);
if (releaseControl.fileCount < Object.keys(RELEASE_EVIDENCE_BINDINGS).length + 1) fail("release control plane is incomplete after canonical verification");

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
const controlAfterCopy = releaseControlHash(root);
if (controlAfterCopy.hash !== releaseControl.hash || controlAfterCopy.fileCount !== releaseControl.fileCount) {
  fail("release/evidence changed after canonical verification");
}
const stagedControl = releaseControlHash(stage);
if (stagedControl.hash !== releaseControl.hash || stagedControl.fileCount !== releaseControl.fileCount) {
  fail("staged release/evidence differs from the canonically verified control plane");
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
const finalRootTree = computeSourceTreeHash(root);
if (finalRootTree.hash !== tree.hash || finalRootTree.fileCount !== tree.fileCount) fail("source tree changed during packaging");
const extractedSourcePaths = collectSourceTreeEntries(extractedRoot).map((entry) => entry.path);
const sourcePaths = collectSourceTreeEntries(root).map((entry) => entry.path);
if (JSON.stringify(extractedSourcePaths) !== JSON.stringify(sourcePaths)) fail("re-extracted source path set differs from the hashed source path set");
if (extractedTree.hash !== tree.hash || extractedTree.fileCount !== tree.fileCount) fail("re-extracted source identity differs from RELEASE.json");
const extractedControl = releaseControlHash(extractedRoot);
if (extractedControl.hash !== releaseControl.hash || extractedControl.fileCount !== releaseControl.fileCount) fail("re-extracted release/evidence control plane differs from canonical verification");
let extractedBundleIdentity;
try {
  extractedBundleIdentity = inspectBase44Bundle(extractedRoot);
  assertReleaseBundleIdentity(release, extractedBundleIdentity, "reextracted_bundle");
} catch (error) {
  fail(`re-extracted Base44 bundle identity differs from RELEASE.json: ${String(error?.message || error)}`);
}

// The preferred release artifact carries the generated bundle. Rebuilding it
// once inside the extracted archive additionally proves that the canonical
// source/topology can deterministically reproduce those exact bytes without
// node_modules or a Base44 network operation.
const rebuilt = spawnSync(process.execPath, ["scripts/build-base44-functions.mjs"], {
  cwd: extractedRoot,
  encoding: "utf8",
  env: process.env,
  maxBuffer: 32 * 1024 * 1024,
});
if (rebuilt.status !== 0) fail(`re-extracted Base44 bundle rebuild failed: ${String(rebuilt.stderr || rebuilt.stdout || rebuilt.error || "unknown error").trim()}`);
let rebuiltBundleIdentity;
try {
  rebuiltBundleIdentity = inspectBase44Bundle(extractedRoot);
  assertReleaseBundleIdentity(release, rebuiltBundleIdentity, "reextracted_rebuilt_bundle");
} catch (error) {
  fail(`re-extracted Base44 rebuild is not deterministic: ${String(error?.message || error)}`);
}
if (rebuiltBundleIdentity.staged_tree_sha256 !== extractedBundleIdentity.staged_tree_sha256 ||
    rebuiltBundleIdentity.manifest_sha256 !== extractedBundleIdentity.manifest_sha256) {
  fail("re-extracted Base44 rebuild changed the included physical bundle");
}

const evidenceEntries = payloadPaths
  .filter((rel) => rel.startsWith(".release-evidence/"))
  .map((rel) => ({ path: rel, sha256: sha256File(path.join(stage, rel)) }));
const payloadEntries = payloadPaths.map((rel) => ({ path: rel, sha256: sha256File(path.join(stage, rel)) }));
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
  release_manifest_sha256: sha256File(path.join(stage, "RELEASE.json")),
  release_control_hash_algorithm: "sha256-tree-v1",
  release_control_hash: releaseControl.hash,
  release_control_file_count: releaseControl.fileCount,
  canonical_verification_command: "npm run verify",
  payload_hash: hashEntries(payloadEntries),
  payload_file_count: payloadPaths.length,
  package_file: path.basename(output),
  package_sha256: packageSha,
  reextracted_source_tree_hash: extractedTree.hash,
  reextracted_source_tree_file_count: extractedTree.fileCount,
  reextracted_match: true,
  backend_deployment_topology_sha256: rootBundleIdentity.topology_sha256,
  backend_bundle_manifest_sha256: rootBundleIdentity.manifest_sha256,
  backend_bundle_config_sha256: rootBundleIdentity.config_sha256,
  backend_bundle_hash_algorithm: rootBundleIdentity.hash_algorithm,
  backend_bundle_tree_sha256: rootBundleIdentity.staged_tree_sha256,
  backend_bundle_file_count: rootBundleIdentity.staged_file_count,
  backend_physical_function_count: rootBundleIdentity.physical_function_count,
  backend_logical_route_count: rootBundleIdentity.logical_route_count,
  reextracted_backend_deployment_topology_sha256: extractedBundleIdentity.topology_sha256,
  reextracted_backend_bundle_manifest_sha256: extractedBundleIdentity.manifest_sha256,
  reextracted_backend_bundle_tree_sha256: extractedBundleIdentity.staged_tree_sha256,
  reextracted_backend_bundle_rebuild_manifest_sha256: rebuiltBundleIdentity.manifest_sha256,
  reextracted_backend_bundle_rebuild_sha256: rebuiltBundleIdentity.staged_tree_sha256,
  reextracted_backend_bundle_match: true,
  reextracted_backend_bundle_rebuild_match: true,
  status: "PASS",
  production_seal_eligible: release.productionSealEligible === true,
  production_verdict: release.finalVerdict,
  readiness_level: release.readinessLevel,
  pilot_ready_eligible: release.pilotReadyEligible === true,
  real_world_validated_eligible: release.realWorldValidatedEligible === true,
  completed_production_requirements: release.completedProductionRequirements || [],
  pending_production_requirements: release.pendingProductionRequirements || [],
  future_activation_requirements: release.futureActivationRequirements || [],
  market_launch_scope: release.marketLaunchScope || null,
  intelligence_closure: release.intelligenceClosure || null,
  research_corpus: release.researchCorpus || null,
  generated_at: new Date().toISOString(),
};
const integrityPath = `${output}.integrity.json`;
fs.writeFileSync(integrityPath, `${JSON.stringify(integrity, null, 2)}\n`);
fs.writeFileSync(`${output}.sha256`, `${packageSha}  ${path.basename(output)}\n`);
console.log(JSON.stringify({ output, integrityPath, sha256: packageSha, sourceTreeHash: tree.hash, sourceTreeFileCount: tree.fileCount, payloadFileCount: payloadPaths.length, reextractedMatch: true }, null, 2));
