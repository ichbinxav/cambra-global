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
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { computeSourceTreeHash } from "./lib/sourceTreeHash.mjs";
import {
  readEvidence,
  releaseEvidenceStatus,
  releaseManifestCanonicalStatus,
  RELEASE_EVIDENCE_BINDINGS,
} from "./lib/evidence.mjs";
import { collectReleasePayloadPaths } from "./lib/releasePayload.mjs";
import { assertReleaseBundleIdentity, inspectBase44Bundle } from "./lib/base44Bundle.mjs";
import { checkFreeze, resolveStage } from "./lib/preEclFreeze.mjs";

const ciMode = process.argv.includes("--ci");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let failed = false;
const fail = (msg) => { console.error(`release:check FAIL — ${msg}`); failed = true; };

function regenerateCanonicalManifest() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "cambra-release-check-"));
  try {
    for (const rel of collectReleasePayloadPaths(".")) {
      const source = path.resolve(rel);
      const target = path.join(temp, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    const generated = spawnSync(
      process.execPath,
      ["scripts/generate-release-manifest.mjs"],
      { cwd: temp, env: process.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    if (generated.status !== 0) {
      throw new Error(String(generated.stderr || generated.stdout || generated.error || "canonical manifest regeneration failed").trim());
    }
    return JSON.parse(fs.readFileSync(path.join(temp, "RELEASE.json"), "utf8"));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

const exactStringSet = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  new Set(actual).size === actual.length &&
  [...actual].sort().join("\n") === [...expected].sort().join("\n");

function checkMarketLaunchScopeBoundary(manifest) {
  const registryPath = "config/europe-markets.json";
  if (!fs.existsSync(registryPath)) {
    fail(`market launch-scope release input missing: ${registryPath}`);
    return;
  }
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch (error) {
    fail(`market launch-scope release input is not valid JSON: ${String(error?.message || error)}`);
    return;
  }
  const scope = registry.launchScope || {};
  const canonicalMarketCodes = (Array.isArray(registry.markets) ? registry.markets : []).map((row) => row.iso2);
  const activeMarkets = Array.isArray(scope.active) ? scope.active : [];
  const protectedMarkets = Array.isArray(scope.protected) ? scope.protected : [];
  const notLaunchMarkets = Array.isArray(scope.notLaunch) ? scope.notLaunch : [];
  const outsideLaunchPerimeter = Array.isArray(scope.outsideLaunchPerimeter) ? scope.outsideLaunchPerimeter : [];
  const expectedProtectedMarkets = ["FR", "BE", "NL"];
  if (registry.schemaVersion !== 1 || typeof registry.registryVersion !== "string" || registry.registryVersion.length === 0) {
    fail("market registry schema/version boundary drift");
  }
  if (scope.decisionStatus !== "FOUNDER_DECIDED") fail("market launch scope must remain FOUNDER_DECIDED");
  if (scope.canonical_market_count !== 33 || scope.launch_perimeter_count !== 30 || scope.active_launch_count !== 10 || scope.protected_market_count !== 3 || scope.not_launch_market_count !== 17) {
    fail("market launch scope declared counts must remain 33 canonical / 30 perimeter / 10 active / 3 licensing / 17 not-launch");
  }
  if (!exactStringSet(canonicalMarketCodes, [...new Set(canonicalMarketCodes)]) || canonicalMarketCodes.length !== 33) {
    fail("market canonical universe must contain exactly 33 unique ISO2 codes");
  }
  if (activeMarkets.length !== 10 || new Set(activeMarkets).size !== 10) fail("market active set must contain exactly 10 unique codes");
  if (notLaunchMarkets.length !== 17 || new Set(notLaunchMarkets).size !== 17) fail("not-launch set must contain exactly 17 unique codes");
  if (outsideLaunchPerimeter.length !== 3 || new Set(outsideLaunchPerimeter).size !== 3) fail("outside launch perimeter must contain exactly IS, LI and AD");
  if (!exactStringSet(protectedMarkets, expectedProtectedMarkets)) fail("protected markets must remain exactly FR, BE and NL");
  if (!activeMarkets.includes("ES")) fail("Spain must remain active in the 10-market launch scope");
  if (activeMarkets.some((code) => protectedMarkets.includes(code))) fail("active and protected market sets must be disjoint");
  if (!exactStringSet([...activeMarkets, ...protectedMarkets, ...notLaunchMarkets], canonicalMarketCodes.filter((code) => !outsideLaunchPerimeter.includes(code)))) fail("10 active + 3 licensing + 17 not-launch must exactly partition the 30-market launch perimeter");
  if (!exactStringSet([...activeMarkets, ...protectedMarkets, ...notLaunchMarkets, ...outsideLaunchPerimeter], canonicalMarketCodes)) fail("launch scope plus research-only outside perimeter must partition the 33-market data universe");
  if (scope.protectedMode !== "RESEARCH_ONLY" || scope.outboundMode !== "PAUSED_ZERO" || scope.regulatedCapabilitiesMode !== "SPECIFIC_POLICY_REQUIRED") {
    fail("protected/research/outbound/regulatory market modes drifted");
  }
  const expectedSummary = {
    registryPath,
    registrySha256: sha256(registryPath),
    registryVersion: registry.registryVersion,
    scopeVersion: scope.scopeVersion,
    decisionStatus: "FOUNDER_DECIDED",
    canonicalMarketCount: 33,
    launchPerimeterCount: 30,
    activeLaunchCount: 10,
    licensingBlockedCount: 3,
    notLaunchMarketCount: 17,
    outsideLaunchPerimeterCount: 3,
    activeMarkets,
    protectedMarkets,
    notLaunchMarkets,
    outsideLaunchPerimeter,
    spainActive: true,
    protectedMode: "RESEARCH_ONLY",
    outboundMode: "PAUSED_ZERO",
    regulatedCapabilitiesMode: "SPECIFIC_POLICY_REQUIRED",
  };
  if (JSON.stringify(manifest.marketLaunchScope) !== JSON.stringify(expectedSummary)) {
    fail("RELEASE.json marketLaunchScope is stale or violates the founder 10/30 boundary");
  }
  if (!manifest.completedProductionRequirements?.some((item) => String(item).startsWith("FOUNDER 10/30 MARKET SCOPE SOURCE-BOUND:"))) {
    fail("RELEASE.json must declare the exact founder 10/30 repository policy boundary");
  }
}

function checkIntelligenceClosureBoundary(manifest) {
  const orchestrationLedgerPath = "config/intelligence/orchestration-p0-remediation.v2.json";
  const rootSealsPath = "config/intelligence/root-seals.v2.json";
  for (const requiredPath of [orchestrationLedgerPath, rootSealsPath]) {
    if (!fs.existsSync(requiredPath)) {
      fail(`intelligence closure release input missing: ${requiredPath}`);
      return;
    }
  }
  let orchestrationLedger;
  let rootSealsLedger;
  try {
    orchestrationLedger = JSON.parse(fs.readFileSync(orchestrationLedgerPath, "utf8"));
    rootSealsLedger = JSON.parse(fs.readFileSync(rootSealsPath, "utf8"));
  } catch (error) {
    fail(`intelligence closure release input is not valid JSON: ${String(error?.message || error)}`);
    return;
  }
  const rootOtrItems = Array.isArray(orchestrationLedger.items) ? orchestrationLedger.items : [];
  const expectedRootOtrIds = Array.from({ length: 20 }, (_, index) => `ROOT-OTR-${String(index + 1).padStart(3, "0")}`);
  const rootOtrIds = rootOtrItems.map((row) => row.otr_id);
  const notMetRootOtrCount = rootOtrItems.filter((row) => row.binary_closure_status === "NOT_MET").length;
  const rootSealRows = Array.isArray(rootSealsLedger.seals) ? rootSealsLedger.seals : [];
  const rootSealTypes = rootSealRows.map((row) => row.seal_type);
  const notSealedRootSealCount = rootSealRows.filter((row) => row.status === "NOT_SEALED").length;
  if (orchestrationLedger.schema_version !== "orchestration-p0-remediation-ledger.v2") fail("ROOT-OTR orchestration ledger schema drift");
  if (!exactStringSet(rootOtrIds, expectedRootOtrIds)) fail("ROOT-OTR ledger must contain exactly ROOT-OTR-001 through ROOT-OTR-020");
  if (rootOtrItems.length !== 20 || notMetRootOtrCount !== 20) fail("all 20 ROOT-OTR entries must remain NOT_MET");
  if (orchestrationLedger.counts?.total !== 20 || orchestrationLedger.counts?.not_met !== 20 || orchestrationLedger.counts?.closed !== 0 || orchestrationLedger.counts?.runtime_verified !== 0) {
    fail("ROOT-OTR declared closure counts must remain 20 total / 20 NOT_MET / 0 closed / 0 runtime verified");
  }
  if (rootSealsLedger.schema_version !== "intelligence-root-compositional-seals.v2" || rootSealsLedger.exact_seal_count !== 8) {
    fail("root-seal schema/count boundary drift");
  }
  if (rootSealRows.length !== 8 || notSealedRootSealCount !== 8) fail("all eight canonical root seals must remain NOT_SEALED");
  if (new Set(rootSealTypes).size !== 8 || rootSealTypes.some((value) => typeof value !== "string" || value.length === 0)) {
    fail("canonical root-seal types must remain eight unique non-empty identities");
  }
  if (!rootSealRows.every((row) =>
    row.attestation_id === null &&
    row.manifest_sha256 === null &&
    row.evidence_bundle_sha256 === null &&
    row.issued_at === null &&
    row.expires_at === null
  )) {
    fail("NOT_SEALED roots cannot carry issued attestation/evidence identities");
  }
  const expectedSummary = {
    orchestrationLedgerPath,
    orchestrationLedgerSha256: sha256(orchestrationLedgerPath),
    rootSealsPath,
    rootSealsSha256: sha256(rootSealsPath),
    rootOtrCount: 20,
    rootOtrNotMetCount: 20,
    rootOtrIds,
    rootOtrStatus: "NOT_MET",
    rootSealCount: 8,
    rootSealNotSealedCount: 8,
    rootSealTypes,
    rootSealStatus: "NOT_SEALED",
    runtimeVerifiedRootOtrCount: 0,
    productionSealEligible: false,
  };
  if (JSON.stringify(manifest.intelligenceClosure) !== JSON.stringify(expectedSummary)) {
    fail("RELEASE.json intelligenceClosure is stale or violates canonical OTR/root-seal truth");
  }
  if (!manifest.pendingProductionRequirements?.some((item) => String(item).startsWith("CAMBRA INTELLIGENCE SEALS NOT YET ISSUED:"))) {
    fail("RELEASE.json must retain unissued CAMBRA intelligence seals as a production blocker");
  }
  if (manifest.productionSealEligible !== false) fail("productionSealEligible must remain false while every ROOT-OTR and root seal is open");
}

function checkResearchCorpusBoundary(manifest) {
  const inventoryPath = "config/remediation/research-corpus-inventory.v1.json";
  const knowledgePath = "config/intelligence/research-knowledge.v1.json";
  const sourceManifestPath = "config/intelligence/research-source-manifest.v1.json";
  for (const requiredPath of [inventoryPath, knowledgePath, sourceManifestPath]) {
    if (!fs.existsSync(requiredPath)) {
      fail(`research corpus release input missing: ${requiredPath}`);
      return;
    }
  }

  let inventory;
  let knowledge;
  let sourceManifest;
  try {
    inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
    knowledge = JSON.parse(fs.readFileSync(knowledgePath, "utf8"));
    sourceManifest = JSON.parse(fs.readFileSync(sourceManifestPath, "utf8"));
  } catch (error) {
    fail(`research corpus release input is not valid JSON: ${String(error?.message || error)}`);
    return;
  }

  const expectedCounts = { physical_files: 11, unique_sha256: 9, exact_duplicates: 2 };
  const founderCorpus = inventory.canonical_corpus || {};
  const researchPolicy = inventory.research_policy || {};
  const physicalSources = Array.isArray(inventory.physical_sources) ? inventory.physical_sources : [];
  const physicalShas = [];
  for (const source of physicalSources) {
    if (typeof source.stored_path !== "string" || !fs.existsSync(source.stored_path)) {
      fail(`research physical source missing: ${String(source.stored_path)}`);
      continue;
    }
    const actualSha = sha256(source.stored_path);
    physicalShas.push(actualSha);
    if (actualSha !== source.sha256) fail(`research physical source SHA drift: ${source.stored_path}`);
    if (fs.statSync(source.stored_path).size !== source.bytes) fail(`research physical source size drift: ${source.stored_path}`);
    if (source.truth_level !== "UNVERIFIED_EXTERNAL_RESEARCH") fail(`research physical source truth boundary drift: ${source.stored_path}`);
  }
  for (const [key, value] of Object.entries(expectedCounts)) {
    if (founderCorpus[key] !== value) fail(`research founder corpus ${key} must remain ${value}`);
    if (inventory.physical?.[key] !== value) fail(`research physical inventory ${key} must remain ${value}`);
  }
  if (physicalSources.length !== 11) fail(`research physical source count must remain 11, got ${physicalSources.length}`);
  if (new Set(physicalShas).size !== 9) fail(`research SHA-unique source count must remain 9, got ${new Set(physicalShas).size}`);
  if (physicalShas.length - new Set(physicalShas).size !== 2) fail("research exact duplicate count must remain 2");
  if (inventory.status !== "FOUNDER_CORPUS_PRESENT_UNTRUSTED_INTEGRATED") fail("research inventory status must preserve untrusted founder-corpus intake");
  if (founderCorpus.authority !== "FOUNDER_DECISION" || founderCorpus.scope !== "EXACT_DECLARED_CORPUS" || founderCorpus.complete_as_declared !== true) {
    fail("research founder-declared local intake contract drift");
  }
  if (researchPolicy.truth_level !== "UNVERIFIED_EXTERNAL_RESEARCH") fail("research corpus must remain UNVERIFIED_EXTERNAL_RESEARCH");
  for (const key of ["execution_eligible", "training_eligible", "model_input_eligible", "calibration_eligible", "auto_promote_eligible"]) {
    if (researchPolicy[key] !== false) fail(`research policy ${key} must remain false`);
  }
  if (inventory.external_source_reverification !== "NOT_RUN") fail("research external source reverification must remain NOT_RUN until evidence exists");
  if (inventory.near_duplicate_detection !== "NOT_RUN") fail("research near-duplicate detection must remain NOT_RUN until evidence exists");
  if (inventory.r6_gate?.closure_scope !== "REPOSITORY_INTAKE_ONLY" || inventory.r6_gate?.production_seal_eligible !== false) {
    fail("research R6 closure must remain repository-only and production-seal-ineligible");
  }
  if (inventory.country_payments_economics_gate?.status !== "INCOMPLETE" || inventory.country_payments_economics_gate?.exact_33_of_33_demonstrated !== false) {
    fail("research country payments economics must remain INCOMPLETE with 33/33 not demonstrated");
  }
  const r9Conflict = (inventory.conflict_snapshot?.conflicts || [])
    .find((row) => row.conflict_id === "research-conflict:r9-missing-package");
  if (r9Conflict?.status !== "OPEN_ARTIFACT_RECOVERY_REQUIRED") fail("research R9 package recovery blocker must remain open");

  const normalizedRecords = Array.isArray(knowledge.records) ? knowledge.records : [];
  const allNormalizedRecordsContained = normalizedRecords.every((row) =>
    row.execution_eligible === false &&
    row.training_eligible === false &&
    row.model_input_eligible === false &&
    row.calibration_eligible === false &&
    row.auto_promote_eligible === false
  );
  if (knowledge.catalog_status !== "CURATED_NON_EXECUTABLE") fail("research knowledge catalog must remain CURATED_NON_EXECUTABLE");
  if (normalizedRecords.length !== 31 || inventory.normalized_knowledge_snapshot?.candidate_records !== 31) fail("research normalized candidate record count must remain 31");
  if (!allNormalizedRecordsContained) fail("every normalized research record must remain non-executable, non-training, non-model-input, non-calibration and non-auto-promotable");
  if (sourceManifest.trust_policy?.default_truth_level !== "UNVERIFIED_EXTERNAL_RESEARCH" ||
      sourceManifest.trust_policy?.source_material_is_untrusted_input !== true ||
      sourceManifest.trust_policy?.instructions_inside_sources_are_executable !== false ||
      sourceManifest.trust_policy?.facts_auto_promoted_to_operational_tables !== false ||
      sourceManifest.trust_policy?.eligible_for_direct_ml_training !== false) {
    fail("research source-manifest trust policy drift");
  }
  if (sourceManifest.totals?.physical_originals !== 11 ||
      sourceManifest.totals?.unique_documents !== 9 ||
      sourceManifest.totals?.exact_duplicates !== 2) {
    fail("research source-manifest founder counts must remain 11 physical / 9 unique / 2 exact duplicates");
  }

  const expectedSummary = {
    inventoryPath,
    inventorySha256: sha256(inventoryPath),
    sourceManifestPath,
    sourceManifestSha256: sha256(sourceManifestPath),
    normalizedKnowledgePath: knowledgePath,
    normalizedKnowledgeSha256: sha256(knowledgePath),
    status: "FOUNDER_CORPUS_PRESENT_UNTRUSTED_INTEGRATED",
    localIntakeComplete: true,
    closureScope: "REPOSITORY_INTAKE_ONLY",
    founderDeclaredScope: { physicalFiles: 11, uniqueSha256: 9, exactDuplicates: 2 },
    trustLevel: "UNVERIFIED_EXTERNAL_RESEARCH",
    safety: {
      sourceMaterialIsUntrustedInput: true,
      executionEligible: false,
      trainingEligible: false,
      modelInputEligible: false,
      calibrationEligible: false,
      autoPromoteEligible: false,
      allNormalizedRecordsContained: true,
    },
    normalizedCandidateRecords: 31,
    externalSourceReverification: "NOT_RUN",
    nearDuplicateDetection: "NOT_RUN",
    countryPaymentsEconomics: {
      status: "INCOMPLETE",
      exact33Of33Demonstrated: false,
      missingMarkets: inventory.country_payments_economics_gate?.missing_markets,
    },
    r9ArtifactStatus: "OPEN_ARTIFACT_RECOVERY_REQUIRED",
    productionSealEligible: false,
  };
  if (JSON.stringify(manifest.researchCorpus) !== JSON.stringify(expectedSummary)) {
    fail("RELEASE.json researchCorpus is stale or violates the founder-corpus release boundary");
  }
  if (!manifest.completedProductionRequirements?.some((item) => String(item).startsWith("FOUNDER RESEARCH CORPUS REPOSITORY INTAKE COMPLETE:"))) {
    fail("RELEASE.json must declare exact founder-corpus repository intake complete");
  }
  if (!manifest.pendingProductionRequirements?.some((item) => String(item).startsWith("RESEARCH EXTERNAL REVERIFICATION REQUIRED:"))) {
    fail("RELEASE.json must retain external research reverification as a production blocker");
  }
  if (!manifest.pendingProductionRequirements?.some((item) => String(item).startsWith("R9 / COUNTRY ECONOMICS PACKAGE REQUIRED:"))) {
    fail("RELEASE.json must retain R9 recovery and country economics as a production blocker");
  }
  if (manifest.productionSealEligible !== false) fail("productionSealEligible must remain false while the research reverification and R9 blockers are open");
}

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
if (m.nodeVersion !== "v24.19.0") fail(`unsupported release Node: ${m.nodeVersion}; exact v24.19.0 required`);
if (m.npmVersion !== "11.17.0") fail(`unsupported release npm: ${m.npmVersion}; exact 11.17.0 required`);
if (m.schedulerInventorySha !== sha256("config/scheduler-inventory.json")) fail("scheduler inventory changed since manifest generation");
try {
  const backendIdentity = inspectBase44Bundle(".");
  assertReleaseBundleIdentity(m, backendIdentity, "backend_bundle");
} catch (error) {
  fail(`backend deployment bundle invalid — ${String(error?.message || error)}; run npm run base44:functions:bundle`);
}
if (m.dataRetentionMatrixSha !== sha256("config/data-retention-matrix.json")) fail("data retention matrix changed since manifest generation");
if (m.secretScannerSha !== sha256("scripts/check-secrets.mjs")) fail("secret scanner changed since manifest generation");
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

// The release directly exposes the founder market decision and the canonical
// Intelligence closure state instead of leaving those claims implicit in a
// release name or prose-only blocker.
checkMarketLaunchScopeBoundary(m);
checkIntelligenceClosureBoundary(m);

// The release artifact binds the exact founder-declared local corpus while
// preserving its untrusted/non-executable boundary and its open R9/reverification
// blockers.  A green technical pipeline cannot promote that intake to a seal.
checkResearchCorpusBoundary(m);

// Executed evidence — tests/build must exist, be fresh, and be green
for (const [manifestKey, binding] of Object.entries(RELEASE_EVIDENCE_BINDINGS)) {
  const onDisk = readEvidence(binding.artifact);
  const status = releaseEvidenceStatus(manifestKey, m[manifestKey], onDisk, tree.hash);
  if (status !== "valid") fail(`${binding.artifact} evidence ${status} — regenerate the canonical evidence and RELEASE.json`);
}
if (m.testEvidence && (m.testEvidence.failed !== 0 || m.testEvidence.passed === null)) fail("test evidence reports failures or null totals");

// RELEASE.json is deliberately outside sourceTreeHash to avoid circularity.
// Therefore every field (especially the editable readiness arrays) is replayed
// from the canonical generator in an isolated directory and compared
// semantically. A hand-edited manifest can never upgrade its own verdict.
try {
  const canonicalManifest = regenerateCanonicalManifest();
  const canonicalStatus = releaseManifestCanonicalStatus(m, canonicalManifest);
  if (canonicalStatus !== "valid") fail(`RELEASE.json ${canonicalStatus} — run npm run release:manifest; hand-edited readiness/evidence fields are forbidden`);
} catch (error) {
  fail(`canonical RELEASE.json replay failed: ${String(error?.message || error).slice(0, 1000)}`);
}

// v62.2.1 — real build artifacts required
if (m.buildEvidence) {
  if (!m.buildEvidence.distHash) fail("build evidence has no distHash — the build produced no verifiable dist/");
  if (!(m.buildEvidence.artifactCount > 0)) fail("build evidence reports zero artifacts");
  if (m.artifactHashes?.dist !== m.buildEvidence.distHash) fail("manifest artifactHashes.dist does not match the build evidence distHash");
}

// Manual production/runtime gates are intentionally distinct from technical CI.
// CI may be green while productionSealEligible=false; the manifest must preserve
// those gates so no green workflow can be misrepresented as full production readiness.
const completedProductionRequirements = Array.isArray(m.completedProductionRequirements) ? m.completedProductionRequirements : [];
const pendingProductionRequirements = Array.isArray(m.pendingProductionRequirements) ? m.pendingProductionRequirements : [];
const futureActivationRequirements = Array.isArray(m.futureActivationRequirements) ? m.futureActivationRequirements : [];
const manualRequirements = Array.isArray(m.manualRequirements) ? m.manualRequirements : [];
const blockingManualRequirements = Array.isArray(m.blockingManualRequirements) ? m.blockingManualRequirements : [];
if (completedProductionRequirements.length === 0) fail("completedProductionRequirements must preserve evidence-backed completed requirements");
if (JSON.stringify(manualRequirements) !== JSON.stringify(pendingProductionRequirements)) fail("manualRequirements legacy alias must equal pendingProductionRequirements");
if (blockingManualRequirements.some((x) => !pendingProductionRequirements.includes(x))) fail("blockingManualRequirements must be a subset of pendingProductionRequirements");
const pilotReadyEligible = pendingProductionRequirements.length === 0;
const realWorldValidatedEligible = pilotReadyEligible && !futureActivationRequirements.some((item) => String(item).startsWith('PAYMENTS V1 REAL-WORLD VALIDATION'));
const productionSealEligible = realWorldValidatedEligible;
if (m.pilotReadyEligible !== pilotReadyEligible) fail("pilotReadyEligible is inconsistent with pendingProductionRequirements");
if (m.productionSealEligible !== productionSealEligible) fail("productionSealEligible is inconsistent with real-world validation requirements");
if (m.realWorldValidatedEligible !== realWorldValidatedEligible) fail("realWorldValidatedEligible is inconsistent with future activation requirements");
const expectedReadiness = !pilotReadyEligible ? 'NOT_GO_READY' : (realWorldValidatedEligible ? 'REAL_WORLD_VALIDATED' : 'PILOT_READY');
if (m.readinessLevel !== expectedReadiness) fail(`readinessLevel is inconsistent: expected ${expectedReadiness}`);
const expectedVerdict = !pilotReadyEligible ? 'NOT_GO_READY' : (productionSealEligible ? 'PRODUCTION_SEALED' : 'PILOT_READY');
if (m.finalVerdict !== expectedVerdict) fail(`finalVerdict is inconsistent: expected ${expectedVerdict}`);

// Strict CI mode
if (ciMode) {
  const expectedGitSha =
    process.env.CAMBRA_RELEASE_GIT_SHA || process.env.GITHUB_SHA || null;
  const currentRunId = process.env.GITHUB_RUN_ID || null;

  if (m.releaseBuild !== true) fail("[CI] releaseBuild must be true");
  if (!expectedGitSha || m.gitSha !== expectedGitSha) {
    fail(`[CI] gitSha does not match checked-out source: ${m.gitSha} vs ${expectedGitSha}`);
  }
  if (!currentRunId || String(m.ciEvidence?.runId) !== String(currentRunId)) {
    fail("[CI] RELEASE.json was not generated in this CI run");
  }
  for (const [manifestKey, binding] of Object.entries(RELEASE_EVIDENCE_BINDINGS)) {
    const evidence = m[manifestKey];
    if (!evidence || String(evidence.ciRunId) !== String(currentRunId)) {
      fail(`[CI] ${binding.artifact} evidence was not generated in this CI run`);
    }
  }
  if (blockingManualRequirements.length > 0) {
    fail(`[CI] blocking technical release requirements: ${blockingManualRequirements.join("; ")}`);
  }
  if (pendingProductionRequirements.length > 0) {
    console.log(
      `[CI] technical verification PASS with ${pendingProductionRequirements.length} retained pilot production proof(s); readinessLevel=NOT_GO_READY.`,
    );
  }
}

if (failed) process.exit(1);
if (!ciMode && (m.releaseBuild === false || m.ciEvidence === null)) {
  console.log(`release:check PASS (LOCAL VALIDATION — not release CI) — ${m.releaseName} (${m.version}).`);
} else {
  console.log(`release:check PASS — ${m.releaseName} (${m.version}).`);
}
