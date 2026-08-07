#!/usr/bin/env node
// v62.2 CP1/CP2 — generates RELEASE.json from the actual repo state + executed
// evidence (.release-evidence/). Never invents a git SHA; never hand-writes
// test/build numbers — evidence is consumed, absent evidence stays null and
// release:check FAILS on it. The source archive identity is the deterministic
// sourceTreeHash (RELEASE.json itself excluded → no circularity);
// sourceArchiveShaExternal is filled OUTSIDE the archive and is never internal
// evidence.
import fs from "node:fs";
import crypto from "node:crypto";
import process from "node:process";
import { execSync } from "node:child_process";
import { computeSourceTreeHash, SOURCE_TREE_HASH_ALGORITHM } from "./lib/sourceTreeHash.mjs";
import { readEvidence, evidenceStatus } from "./lib/evidence.mjs";

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const policy = JSON.parse(fs.readFileSync("config/product-policy.json", "utf8"));
const freeze = JSON.parse(fs.readFileSync("config/pre-ecl-freeze.json", "utf8"));
// v62.4 — ECL provenance. The policy file exists only from stage
// ECL_P2_DOMAIN_CONTRACTS onward; in earlier stages these fields stay null
// (never invented).
const eclPolicyLive = fs.existsSync("config/ecl-policy.json")
  ? JSON.parse(fs.readFileSync("config/ecl-policy.json", "utf8")) : null;

const templates = fs.readFileSync("base44/shared/recoverContractTemplates.ts", "utf8");
const tvMatch = templates.match(/RECOVER_CONTRACT_TEMPLATE_VERSION\s*=\s*["']([^"']+)["']/);

let gitSha = process.env.GITHUB_SHA || null;
if (!gitSha) { try { gitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(); } catch { gitSha = null; } }
let npmVersion = null;
try { npmVersion = execSync("npm --version", { encoding: "utf8" }).trim(); } catch { /* null, never invented */ }

const tree = computeSourceTreeHash(".");
const testEvidence = readEvidence("tests");
const buildEvidence = readEvidence("build");
const lintEvidence = readEvidence("lint");
const tcCritical = readEvidence("typecheck-critical");
const tcBaseline = readEvidence("typecheck-baseline");

const manualRequirements = [];
const baseline = fs.existsSync("config/typecheck-baseline.json")
  ? JSON.parse(fs.readFileSync("config/typecheck-baseline.json", "utf8")) : null;
if (!baseline || baseline.state !== "APPROVED") manualRequirements.push("typecheck baseline: candidate/approve flow not completed");
if (!fs.existsSync(".github/workflows/ci.yml")) manualRequirements.push("CI workflow not installed (npm run ci:install from a real checkout)");
for (const [name, ev] of [["tests", testEvidence], ["build", buildEvidence], ["lint", lintEvidence], ["typecheck-critical", tcCritical], ["typecheck-baseline", tcBaseline]]) {
  const st = evidenceStatus(ev, tree.hash);
  if (st !== "valid") manualRequirements.push(`evidence ${name}: ${st} (run the *:evidence command)`);
}

const manifest = {
  releaseName: pkg.releaseName,
  version: pkg.version,
  sourceTreeHash: tree.hash,
  sourceTreeHashAlgorithm: SOURCE_TREE_HASH_ALGORITHM,
  sourceTreeFileCount: tree.fileCount,
  sourceArchiveShaExternal: process.env.SOURCE_ARCHIVE_SHA_EXTERNAL || null,
  gitSha,
  releaseBuild: Boolean(process.env.CI),
  ciEvidence: process.env.GITHUB_RUN_ID ? { runId: process.env.GITHUB_RUN_ID, workflow: process.env.GITHUB_WORKFLOW || null } : null,
  policyVersion: policy.policyVersion,
  policySchemaVersion: policy.schemaVersion,
  eclStage: freeze.stage || null,
  eclPolicyVersion: eclPolicyLive?.policyVersion ?? null,
  eclPolicyFileSha: eclPolicyLive ? sha256("config/ecl-policy.json") : null,
  eclGeneratedArtifactShas: eclPolicyLive ? {
    "src/lib/generated/eclPolicy.js": sha256("src/lib/generated/eclPolicy.js"),
    "base44/shared/generated/eclPolicy.ts": sha256("base44/shared/generated/eclPolicy.ts"),
    "base44/shared/generated/eclDomain.ts": sha256("base44/shared/generated/eclDomain.ts"),
  } : null,
  durabilityManifestSha: fs.existsSync("config/p1-durability-manifest.json")
    ? sha256("config/p1-durability-manifest.json") : null,
  contractTemplateVersions: tvMatch ? [tvMatch[1]] : [],
  productScope: Object.entries(policy.productScope).filter(([, v]) => v.productionEnabled).map(([k]) => k),
  stripeIntegrationStatus: policy.integrationStatus.stripe,
  canonicalSdkVersion: pkg.dependencies["@base44/sdk"],
  nodeVersion: process.version,
  npmVersion,
  lockfileSha: sha256("package-lock.json"),
  policyFileSha: sha256("config/product-policy.json"),
  frozenFiles: Object.fromEntries(freeze.entries.map((e) => [e.path, e.sha256])),
  testEvidence,
  buildEvidence,
  lintEvidence,
  typecheckCriticalEvidence: tcCritical,
  typecheckBaselineEvidence: tcBaseline,
  artifactHashes: buildEvidence?.distHash ? { dist: buildEvidence.distHash } : null,
  manualRequirements,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync("RELEASE.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`RELEASE.json written for ${manifest.releaseName} (${manifest.version}); sourceTreeHash ${tree.hash.slice(0, 16)}… over ${tree.fileCount} files; ${manualRequirements.length} manual requirement(s).`);