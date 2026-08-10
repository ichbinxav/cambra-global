#!/usr/bin/env node
// v62.2 CP1 — release:check. Two modes:
//   LOCAL  (default):        structural coherence + REAL executed evidence.
//   STRICT CI (--ci):        additionally requires releaseBuild, gitSha, CI
//                            run id, and evidence produced in that CI run.
// FAILS when: tests/build evidence is null, stale or failed; Node/npm null;
// sourceTreeHash mismatch; version/releaseName/policy/lockfile/SDK drift;
// scope not payments-only; Stripe claimed live; frozen files differ.
// v62.2.1 — the build is only accepted with a REAL distHash and at least one
// artifact, so "build ran, produced nothing" can no longer pass.
import fs from "node:fs";
import crypto from "node:crypto";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { computeSourceTreeHash } from "./lib/sourceTreeHash.mjs";
import { evidenceStatus } from "./lib/evidence.mjs";
import { checkFreeze, resolveStage } from "./lib/preEclFreeze.mjs";

const ciMode = process.argv.includes("--ci");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let failed = false;
const fail = (msg) => { console.error(`release:check FAIL — ${msg}`); failed = true; };

if (!fs.existsSync("RELEASE.json")) { console.error("release:check FAIL — RELEASE.json missing. Run: npm run release:manifest"); process.exit(1); }
const m = JSON.parse(fs.readFileSync("RELEASE.json", "utf8"));
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const policy = JSON.parse(fs.readFileSync("config/product-policy.json", "utf8"));
const freeze = JSON.parse(fs.readFileSync("config/pre-ecl-freeze.json", "utf8"));

// Structural coherence
if (m.version !== pkg.version) fail(`version mismatch: manifest ${m.version} vs package.json ${pkg.version}`);
if (m.releaseName !== pkg.releaseName) fail(`releaseName mismatch: "${m.releaseName}"`);
if (m.policyVersion !== policy.policyVersion) fail(`policy drift: manifest ${m.policyVersion} vs live ${policy.policyVersion}`);
if (m.policyFileSha !== sha256("config/product-policy.json")) fail("stale manifest: product policy changed since generation");
if (m.lockfileSha !== sha256("package-lock.json")) fail("stale manifest: package-lock.json changed since generation");
// v62.6 — the durability manifest is EXCLUDED from sourceTreeHash (it hashes
// the tree it lives in), so its dedicated SHA must be independently verified:
// otherwise closure would be silently mutable after sealing.
if (fs.existsSync("config/p1-durability-manifest.json")) {
  if (!m.durabilityManifestSha) fail("durabilityManifestSha is null while config/p1-durability-manifest.json exists");
  else if (m.durabilityManifestSha !== sha256("config/p1-durability-manifest.json")) fail("durability manifest changed since manifest generation (durabilityManifestSha mismatch)");
}
if (fs.existsSync("config/documentation-drift-manifest.json")) {
  if (!m.documentationManifestSha) fail("documentationManifestSha is null while config/documentation-drift-manifest.json exists");
  else if (m.documentationManifestSha !== sha256("config/documentation-drift-manifest.json")) fail("documentation drift manifest changed since release manifest generation");
  try { execFileSync(process.execPath, ["scripts/check-documentation-drift.mjs"], { stdio: "pipe" }); }
  catch (err) { fail(`documentation drift gate failed: ${String(err?.stderr || err?.message || err).trim().slice(0, 500)}`); }
} else fail("P18 documentation drift manifest missing — run npm run documentation:generate");
if (m.canonicalSdkVersion !== pkg.dependencies["@base44/sdk"]) fail("SDK version mismatch vs package.json");
if (!Array.isArray(m.contractTemplateVersions) || m.contractTemplateVersions.length === 0) fail("contractTemplateVersions empty");

// Source tree identity — recomputed, never trusted
const tree = computeSourceTreeHash(".");
if (m.sourceTreeHash !== tree.hash) fail(`sourceTreeHash mismatch: manifest ${String(m.sourceTreeHash).slice(0, 16)}… vs current ${tree.hash.slice(0, 16)}… (source changed since manifest generation)`);
if (m.sourceTreeHashAlgorithm !== "sha256-tree-v1") fail("unknown sourceTreeHashAlgorithm");

// Frozen files — verified against the LIVE repo, not just the manifest copy
// v62.3 — stage-aware: the manifest check must apply the SAME stage rules as
// clean:check, otherwise a sanctioned P1 schema would fail here.
let freezeStage;
try { freezeStage = resolveStage(freeze); } catch (err) { fail(err.message); }
const freezeResult = checkFreeze(freeze.entries, (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null), { stage: freezeStage });
for (const f of freezeResult.failures) fail(f);
for (const e of freeze.entries) {
  if (m.frozenFiles?.[e.path] !== e.sha256) fail(`manifest frozen-file record drift: ${e.path}`);
}

// Scope + Stripe
const enabled = Object.entries(policy.productScope).filter(([, v]) => v.productionEnabled).map(([k]) => k);
if (enabled.length !== 1 || enabled[0] !== "payments") fail(`product scope is not payments-only: [${enabled.join(", ")}]`);
if (JSON.stringify(m.productScope) !== JSON.stringify(["payments"])) fail("manifest productScope is not payments-only");
if (m.stripeIntegrationStatus !== policy.integrationStatus.stripe) fail("Stripe integration status drift vs policy");
if (/^live/i.test(String(m.stripeIntegrationStatus))) fail("Stripe must not be declared live");

// Environment — no critical nulls
if (!m.nodeVersion) fail("nodeVersion is null");
if (!m.npmVersion) fail("npmVersion is null");

// Executed evidence — tests/build must exist, be fresh, and be green
const requireEvidence = (name, ev) => {
  const st = evidenceStatus(ev, tree.hash);
  if (st !== "valid") fail(`${name} evidence ${st} — run npm run ${name === "tests" ? "test" : name}:evidence`);
};
requireEvidence("tests", m.testEvidence);
requireEvidence("build", m.buildEvidence);
requireEvidence("lint", m.lintEvidence);
requireEvidence("typecheck-critical", m.typecheckCriticalEvidence);
requireEvidence("typecheck-baseline", m.typecheckBaselineEvidence);
if (m.testEvidence && (m.testEvidence.failed !== 0 || m.testEvidence.passed === null)) fail("test evidence reports failures or null totals");

// v62.2.1 — real build artifacts required
if (m.buildEvidence) {
  if (!m.buildEvidence.distHash) fail("build evidence has no distHash — the build produced no verifiable dist/");
  if (!(m.buildEvidence.artifactCount > 0)) fail("build evidence reports zero artifacts");
  if (m.artifactHashes?.dist !== m.buildEvidence.distHash) fail("manifest artifactHashes.dist does not match the build evidence distHash");
}

// Strict CI mode
if (ciMode) {
  if (m.releaseBuild !== true) fail("[CI] releaseBuild must be true");
  if (!m.gitSha) fail("[CI] gitSha is null");
  if (!m.ciEvidence?.runId) fail("[CI] no CI run id");
  for (const [n, ev] of [["tests", m.testEvidence], ["build", m.buildEvidence]]) {
    if (ev && ev.ciRunId !== m.ciEvidence?.runId) fail(`[CI] ${n} evidence was not generated in this CI run`);
  }
  if ((m.manualRequirements || []).length > 0) fail(`[CI] blocking manual requirements: ${m.manualRequirements.join("; ")}`);
}

if (failed) process.exit(1);
if (!ciMode && (m.releaseBuild === false || m.ciEvidence === null)) {
  console.log(`release:check PASS (LOCAL VALIDATION — not release CI) — ${m.releaseName} (${m.version}).`);
} else {
  console.log(`release:check PASS — ${m.releaseName} (${m.version}).`);
}