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
import { computeSourceTreeHash, SOURCE_TREE_HASH_ALGORITHM } from "./lib/sourceTreeHash.mjs";
import { readEvidence, evidenceStatus } from "./lib/evidence.mjs";
import { inspectBase44Bundle } from "./lib/base44Bundle.mjs";

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

// A committed manifest cannot truthfully contain the SHA of the commit which
// contains it (that would be a circular identity).  Only CI, which knows the
// immutable checked-out SHA, may populate gitSha.  Local manifests deliberately
// keep it null instead of recording the parent commit and becoming stale as soon
// as they are committed.
// Pull-request workflows expose GITHUB_SHA as a synthetic merge commit.  The
// workflow sets CAMBRA_RELEASE_GIT_SHA to the immutable source commit that was
// actually checked out, so the explicit release identity must take precedence.
const gitSha = process.env.CAMBRA_RELEASE_GIT_SHA || process.env.GITHUB_SHA || null;
// npm exposes its exact version to lifecycle scripts. Prefer that immutable
// execution context over spawning another shell (which can lose npx's PATH).
const npmVersion = String(process.env.npm_config_user_agent || '').match(/\bnpm\/([^\s]+)/)?.[1] || null;

const tree = computeSourceTreeHash(".");
const testEvidence = readEvidence("tests");
const buildEvidence = readEvidence("build");
const lintEvidence = readEvidence("lint");
const tcCritical = readEvidence("typecheck-critical");
const tcBaseline = readEvidence("typecheck-baseline");
const dependencyAudit = readEvidence("dependency-audit");
// A release manifest never trusts the generated manifest alone. Recompute the
// physical tree, route topology, config binding and contained imports first.
const backendBundle = inspectBase44Bundle(".");

// R7 launch/closure traceability. These source-owned ledgers are already
// checked elsewhere in the verification pipeline, but RELEASE.json must expose
// their exact, hash-bound state so a package consumer can verify the 30/33
// claim and distinguish repository remediation from runtime/root-seal closure.
const marketRegistryPath = "config/europe-markets.json";
const orchestrationLedgerPath = "config/intelligence/orchestration-p0-remediation.v2.json";
const rootSealsPath = "config/intelligence/root-seals.v2.json";
const marketRegistry = JSON.parse(fs.readFileSync(marketRegistryPath, "utf8"));
const orchestrationLedger = JSON.parse(fs.readFileSync(orchestrationLedgerPath, "utf8"));
const rootSealsLedger = JSON.parse(fs.readFileSync(rootSealsPath, "utf8"));
const assertReleaseBoundary = (condition, label) => {
  if (!condition) throw new Error(`release_traceability_boundary_invalid:${label}`);
};
const exactStringSet = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  new Set(actual).size === actual.length &&
  [...actual].sort().join("\n") === [...expected].sort().join("\n");

const launchScope = marketRegistry.launchScope || {};
const canonicalMarketCodes = (Array.isArray(marketRegistry.markets) ? marketRegistry.markets : [])
  .map((row) => row.iso2);
const activeMarkets = Array.isArray(launchScope.active) ? launchScope.active : [];
const protectedMarkets = Array.isArray(launchScope.protected) ? launchScope.protected : [];
const expectedProtectedMarkets = ["FR", "BE", "NL"];
assertReleaseBoundary(marketRegistry.schemaVersion === 1, "market_schema_version");
assertReleaseBoundary(typeof marketRegistry.registryVersion === "string" && marketRegistry.registryVersion.length > 0, "market_registry_version");
assertReleaseBoundary(launchScope.decisionStatus === "FOUNDER_DECIDED", "market_decision_status");
assertReleaseBoundary(launchScope.canonical_market_count === 33, "market_declared_canonical_count");
assertReleaseBoundary(launchScope.active_launch_count === 30, "market_declared_active_count");
assertReleaseBoundary(launchScope.protected_market_count === 3, "market_declared_protected_count");
assertReleaseBoundary(exactStringSet(canonicalMarketCodes, [...new Set(canonicalMarketCodes)]) && canonicalMarketCodes.length === 33, "market_canonical_universe");
assertReleaseBoundary(activeMarkets.length === 30 && new Set(activeMarkets).size === 30, "market_active_set");
assertReleaseBoundary(exactStringSet(protectedMarkets, expectedProtectedMarkets), "market_protected_set");
assertReleaseBoundary(activeMarkets.includes("ES"), "market_spain_active");
assertReleaseBoundary(!activeMarkets.some((code) => protectedMarkets.includes(code)), "market_active_protected_overlap");
assertReleaseBoundary(exactStringSet([...activeMarkets, ...protectedMarkets], canonicalMarketCodes), "market_scope_partition");
assertReleaseBoundary(launchScope.protectedMode === "RESEARCH_ONLY", "market_protected_mode");
assertReleaseBoundary(launchScope.outboundMode === "PAUSED_ZERO", "market_outbound_mode");
assertReleaseBoundary(launchScope.regulatedCapabilitiesMode === "SPECIFIC_POLICY_REQUIRED", "market_regulated_mode");

const marketLaunchScope = {
  registryPath: marketRegistryPath,
  registrySha256: sha256(marketRegistryPath),
  registryVersion: marketRegistry.registryVersion,
  scopeVersion: launchScope.scopeVersion,
  decisionStatus: "FOUNDER_DECIDED",
  canonicalMarketCount: 33,
  activeLaunchCount: 30,
  protectedMarketCount: 3,
  activeMarkets,
  protectedMarkets,
  spainActive: true,
  protectedMode: "RESEARCH_ONLY",
  outboundMode: "PAUSED_ZERO",
  regulatedCapabilitiesMode: "SPECIFIC_POLICY_REQUIRED",
};

const rootOtrItems = Array.isArray(orchestrationLedger.items) ? orchestrationLedger.items : [];
const expectedRootOtrIds = Array.from({ length: 20 }, (_, index) => `ROOT-OTR-${String(index + 1).padStart(3, "0")}`);
const rootOtrIds = rootOtrItems.map((row) => row.otr_id);
const notMetRootOtrCount = rootOtrItems.filter((row) => row.binary_closure_status === "NOT_MET").length;
const rootSealRows = Array.isArray(rootSealsLedger.seals) ? rootSealsLedger.seals : [];
const rootSealTypes = rootSealRows.map((row) => row.seal_type);
const notSealedRootSealCount = rootSealRows.filter((row) => row.status === "NOT_SEALED").length;
assertReleaseBoundary(orchestrationLedger.schema_version === "orchestration-p0-remediation-ledger.v2", "otr_schema_version");
assertReleaseBoundary(exactStringSet(rootOtrIds, expectedRootOtrIds), "otr_exact_ids");
assertReleaseBoundary(rootOtrItems.length === 20 && notMetRootOtrCount === 20, "otr_not_met_count");
assertReleaseBoundary(orchestrationLedger.counts?.total === 20, "otr_declared_total");
assertReleaseBoundary(orchestrationLedger.counts?.not_met === 20, "otr_declared_not_met");
assertReleaseBoundary(orchestrationLedger.counts?.closed === 0, "otr_declared_closed");
assertReleaseBoundary(orchestrationLedger.counts?.runtime_verified === 0, "otr_runtime_verified");
assertReleaseBoundary(rootSealsLedger.schema_version === "intelligence-root-compositional-seals.v2", "root_seal_schema_version");
assertReleaseBoundary(rootSealsLedger.exact_seal_count === 8, "root_seal_declared_count");
assertReleaseBoundary(rootSealRows.length === 8 && notSealedRootSealCount === 8, "root_seal_not_sealed_count");
assertReleaseBoundary(new Set(rootSealTypes).size === 8 && rootSealTypes.every((value) => typeof value === "string" && value.length > 0), "root_seal_types");
assertReleaseBoundary(rootSealRows.every((row) =>
  row.attestation_id === null &&
  row.manifest_sha256 === null &&
  row.evidence_bundle_sha256 === null &&
  row.issued_at === null &&
  row.expires_at === null
), "root_seal_unissued_evidence");

const intelligenceClosure = {
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

// R7 founder-corpus release boundary.  Repository intake is complete only for
// the exact founder-declared corpus (11 physical files / 9 SHA-unique / 2 exact
// duplicates).  This is deliberately not a verification or activation claim:
// source reverification, R9 recovery and country-economics completion remain
// production blockers, and every normalized record stays non-executable.
const researchCorpusInventoryPath = "config/remediation/research-corpus-inventory.v1.json";
const researchKnowledgePath = "config/intelligence/research-knowledge.v1.json";
const researchSourceManifestPath = "config/intelligence/research-source-manifest.v1.json";
const researchCorpusInventory = JSON.parse(fs.readFileSync(researchCorpusInventoryPath, "utf8"));
const researchKnowledge = JSON.parse(fs.readFileSync(researchKnowledgePath, "utf8"));
const researchSourceManifest = JSON.parse(fs.readFileSync(researchSourceManifestPath, "utf8"));
const assertResearchBoundary = (condition, label) => {
  if (!condition) throw new Error(`release_research_boundary_invalid:${label}`);
};
const expectedFounderCorpusCounts = {
  physical_files: 11,
  unique_sha256: 9,
  exact_duplicates: 2,
};
const founderCorpus = researchCorpusInventory.canonical_corpus || {};
const researchPolicy = researchCorpusInventory.research_policy || {};
const physicalResearchSources = Array.isArray(researchCorpusInventory.physical_sources)
  ? researchCorpusInventory.physical_sources : [];
const physicalSourceShas = physicalResearchSources.map((row) => {
  assertResearchBoundary(typeof row.stored_path === "string" && fs.existsSync(row.stored_path), `physical_source_missing:${row.stored_path}`);
  const actualSha = sha256(row.stored_path);
  assertResearchBoundary(actualSha === row.sha256, `physical_source_sha_mismatch:${row.stored_path}`);
  assertResearchBoundary(fs.statSync(row.stored_path).size === row.bytes, `physical_source_size_mismatch:${row.stored_path}`);
  assertResearchBoundary(row.truth_level === "UNVERIFIED_EXTERNAL_RESEARCH", `physical_source_truth_level:${row.stored_path}`);
  return actualSha;
});
const normalizedResearchRecords = Array.isArray(researchKnowledge.records) ? researchKnowledge.records : [];
const allNormalizedRecordsContained = normalizedResearchRecords.every((row) =>
  row.execution_eligible === false &&
  row.training_eligible === false &&
  row.model_input_eligible === false &&
  row.calibration_eligible === false &&
  row.auto_promote_eligible === false
);
const r9Conflict = (researchCorpusInventory.conflict_snapshot?.conflicts || [])
  .find((row) => row.conflict_id === "research-conflict:r9-missing-package");
for (const [key, value] of Object.entries(expectedFounderCorpusCounts)) {
  assertResearchBoundary(founderCorpus[key] === value, `founder_count:${key}`);
  assertResearchBoundary(researchCorpusInventory.physical?.[key] === value, `physical_count:${key}`);
}
assertResearchBoundary(researchCorpusInventory.status === "FOUNDER_CORPUS_PRESENT_UNTRUSTED_INTEGRATED", "inventory_status");
assertResearchBoundary(founderCorpus.authority === "FOUNDER_DECISION", "founder_authority");
assertResearchBoundary(founderCorpus.scope === "EXACT_DECLARED_CORPUS", "founder_scope");
assertResearchBoundary(founderCorpus.complete_as_declared === true, "founder_intake_complete");
assertResearchBoundary(physicalResearchSources.length === 11, "physical_source_count");
assertResearchBoundary(new Set(physicalSourceShas).size === 9, "physical_source_unique_count");
assertResearchBoundary(physicalSourceShas.length - new Set(physicalSourceShas).size === 2, "physical_source_duplicate_count");
assertResearchBoundary(researchPolicy.truth_level === "UNVERIFIED_EXTERNAL_RESEARCH", "truth_level");
for (const key of ["execution_eligible", "training_eligible", "model_input_eligible", "calibration_eligible", "auto_promote_eligible"]) {
  assertResearchBoundary(researchPolicy[key] === false, `policy_${key}`);
}
assertResearchBoundary(researchCorpusInventory.external_source_reverification === "NOT_RUN", "external_reverification");
assertResearchBoundary(researchCorpusInventory.near_duplicate_detection === "NOT_RUN", "near_duplicate_detection");
assertResearchBoundary(researchCorpusInventory.r6_gate?.closure_scope === "REPOSITORY_INTAKE_ONLY", "closure_scope");
assertResearchBoundary(researchCorpusInventory.r6_gate?.production_seal_eligible === false, "corpus_production_seal");
assertResearchBoundary(researchCorpusInventory.country_payments_economics_gate?.status === "INCOMPLETE", "country_economics_status");
assertResearchBoundary(researchCorpusInventory.country_payments_economics_gate?.exact_33_of_33_demonstrated === false, "country_economics_33_of_33");
assertResearchBoundary(r9Conflict?.status === "OPEN_ARTIFACT_RECOVERY_REQUIRED", "r9_artifact_status");
assertResearchBoundary(researchKnowledge.catalog_status === "CURATED_NON_EXECUTABLE", "knowledge_catalog_status");
assertResearchBoundary(normalizedResearchRecords.length === 31, "knowledge_record_count_expected");
assertResearchBoundary(normalizedResearchRecords.length === researchCorpusInventory.normalized_knowledge_snapshot?.candidate_records, "knowledge_record_count");
assertResearchBoundary(allNormalizedRecordsContained, "knowledge_record_safety");
assertResearchBoundary(researchSourceManifest.trust_policy?.default_truth_level === "UNVERIFIED_EXTERNAL_RESEARCH", "source_default_truth_level");
assertResearchBoundary(researchSourceManifest.trust_policy?.source_material_is_untrusted_input === true, "source_material_untrusted");
assertResearchBoundary(researchSourceManifest.trust_policy?.instructions_inside_sources_are_executable === false, "source_instructions_non_executable");
assertResearchBoundary(researchSourceManifest.trust_policy?.facts_auto_promoted_to_operational_tables === false, "source_no_auto_promotion");
assertResearchBoundary(researchSourceManifest.trust_policy?.eligible_for_direct_ml_training === false, "source_no_direct_training");
assertResearchBoundary(researchSourceManifest.totals?.physical_originals === 11, "source_manifest_physical_count");
assertResearchBoundary(researchSourceManifest.totals?.unique_documents === 9, "source_manifest_unique_count");
assertResearchBoundary(researchSourceManifest.totals?.exact_duplicates === 2, "source_manifest_duplicate_count");

const researchCorpus = {
  inventoryPath: researchCorpusInventoryPath,
  inventorySha256: sha256(researchCorpusInventoryPath),
  sourceManifestPath: researchSourceManifestPath,
  sourceManifestSha256: sha256(researchSourceManifestPath),
  normalizedKnowledgePath: researchKnowledgePath,
  normalizedKnowledgeSha256: sha256(researchKnowledgePath),
  status: researchCorpusInventory.status,
  localIntakeComplete: true,
  closureScope: "REPOSITORY_INTAKE_ONLY",
  founderDeclaredScope: {
    physicalFiles: 11,
    uniqueSha256: 9,
    exactDuplicates: 2,
  },
  trustLevel: "UNVERIFIED_EXTERNAL_RESEARCH",
  safety: {
    sourceMaterialIsUntrustedInput: true,
    executionEligible: false,
    trainingEligible: false,
    modelInputEligible: false,
    calibrationEligible: false,
    autoPromoteEligible: false,
    allNormalizedRecordsContained,
  },
  normalizedCandidateRecords: normalizedResearchRecords.length,
  externalSourceReverification: "NOT_RUN",
  nearDuplicateDetection: "NOT_RUN",
  countryPaymentsEconomics: {
    status: "INCOMPLETE",
    exact33Of33Demonstrated: false,
    missingMarkets: researchCorpusInventory.country_payments_economics_gate.missing_markets,
  },
  r9ArtifactStatus: "OPEN_ARTIFACT_RECOVERY_REQUIRED",
  productionSealEligible: false,
};

const completedProductionRequirements = [
  'Node 24 LTS toolchain and the reproducible local verification pipeline are source-enforced and locally verified.',
  'The reproducible Base44 bundle preserves trust boundaries while staging exactly 276 physical functions behind 27 logical routes; deployment parity remains a separate pending proof.',
  'FOUNDER 30/33 MARKET SCOPE SOURCE-BOUND: 33 canonical markets, 30 active including Spain, and exactly France, Belgium and the Netherlands protected as research-only while outbound remains PAUSED_ZERO; this is repository policy, not runtime proof.',
  'FOUNDER RESEARCH CORPUS REPOSITORY INTAKE COMPLETE: exactly 11 physical files / 9 SHA-unique / 2 exact duplicates are byte-bound as untrusted, non-executable and non-training input; this is repository intake only, not production proof.',
];
const pendingProductionRequirements = [];
const futureActivationRequirements = [];
const blockingManualRequirements = [];
const addPendingRequirement = (message, { blocking = false } = {}) => {
  pendingProductionRequirements.push(message);
  if (blocking) blockingManualRequirements.push(message);
};
const addFutureRequirement = (message) => futureActivationRequirements.push(message);
const baseline = fs.existsSync("config/typecheck-baseline.json")
  ? JSON.parse(fs.readFileSync("config/typecheck-baseline.json", "utf8")) : null;
if (!baseline || baseline.state !== "APPROVED") addPendingRequirement("typecheck baseline: candidate/approve flow not completed", { blocking: true });
if (!fs.existsSync(".github/workflows/ci.yml")) addPendingRequirement("CI workflow not installed (npm run ci:install from a real checkout)", { blocking: true });
if (!process.env.GITHUB_RUN_ID) addPendingRequirement("FINAL-SHA REMOTE CI PROOF REQUIRED: this manifest was generated outside GitHub Actions; obtain a green remote workflow run for the exact final release SHA.");
const productPolicy = fs.existsSync("config/product-policy.json")
  ? JSON.parse(fs.readFileSync("config/product-policy.json", "utf8")) : null;
if (productPolicy?.economicTerms?.recoveryEconomicsVersion === "recover-economics-v2" &&
    productPolicy?.economicTerms?.recoverEconomicsV2LegalApproved !== true) {
  addFutureRequirement("LEGAL REVIEW REQUIRED BEFORE RECOVER V2 ACTIVATION: contractual wording must be approved before new V2 acceptance is enabled.");
}
if (fs.existsSync('src/docs/P12_INTELLIGENCE_ARCHITECTURE.md')) {
  addFutureRequirement('LEGAL/PRIVACY ACTIVATION REVIEW: before materially widening cross-tenant benchmark use or retention, re-assess lawful basis, residual re-identification risk and retention policy against actual production cohorts.');
}
if (fs.existsSync('src/docs/P13_SHADOW_ROUTING_ARCHITECTURE.md')) {
  addFutureRequirement('ROUTING ACTIVATION PROHIBITED: P13 remains shadow/simulation only until PCI DSS, PSD2/SCA, regulatory, contractual, SLA/SLO, reconciliation, merchant-control and liability reviews pass.');
}
if (productPolicy?.integrationStatus?.stripe !== "live_verified") {
  addFutureRequirement(`STRIPE FULL INTEGRATION VALIDATION: product policy remains ${productPolicy?.integrationStatus?.stripe || "unknown"}; promote it to live_verified only after the first real merchant Connect → Sync → verified analysis and reconciliation path.`);
}
if (fs.existsSync('src/docs/FINAL_AUTONOMOUS_REVENUE_ENGINE_SEAL.md')) {
  addFutureRequirement('REAL-WORLD VALIDATION REQUIRED: complete multiple genuine production merchants end-to-end and populate the PilotMerchantValidation ledger before claiming autonomous economic validation.');
}
if (fs.existsSync('base44/entities/IncidentAlertDelivery.jsonc')) {
  addPendingRequirement('HIGH/CRITICAL ALERT PROOF REQUIRED: prove real delivery, retry, deduplication and Founder/Admin visibility with a controlled production incident.');
}
addPendingRequirement('FINAL BASE44 PARITY PROOF REQUIRED: deploy the exact final source tree and match runtime release version, Git SHA, sha256-tree-v1 hash and file count to RELEASE.json and the archive.');
addPendingRequirement('IMMUTABLE RUNTIME IDENTITY + SLO PROOF REQUIRED: inject the deployment-owned source, bundle, topology and scheduler identities; collect complete durable attempt receipts for Analyzer, extraction, commercial send, billing reconciliation and the company orchestrator; then satisfy the canonical 30-day SLO windows.');
addPendingRequirement('CAMBRA INTELLIGENCE SEALS NOT YET ISSUED: all eight canonical root seals remain NOT_SEALED until their exact source, runtime, privacy, cost, lineage and real-world evidence gates pass. Contract or unit-test completion is not runtime validation.');
addPendingRequirement('RESEARCH EXTERNAL REVERIFICATION REQUIRED: the exact founder corpus remains UNVERIFIED_EXTERNAL_RESEARCH; direct source reverification and near-duplicate detection are NOT_RUN, so execution, model input, calibration, auto-promotion and training remain prohibited.');
addPendingRequirement('R9 / COUNTRY ECONOMICS PACKAGE REQUIRED: the referenced R9 package/dossiers are not retained and exact 33/33 country-economics coverage remains INCOMPLETE and not demonstrated.');
addPendingRequirement('DELIVERABILITY PROOF REQUIRED: verify real SPF, DKIM and DMARC plus authenticated Resend/Instantly webhooks for the pilot sending profile.');
addPendingRequirement('SUPPRESSION LIFECYCLE PROOF REQUIRED: verify bounce, complaint, unsubscribe and suppression end-to-end in the real runtime.');
addPendingRequirement('FOUNDER CONTROL PROOF REQUIRED: prove start, pause, resume, approve and reject from Founder Admin while outbound remains off outside the controlled drill.');
addPendingRequirement('BACKUP/RESTORE PROOF REQUIRED: execute a real production-boundary restore drill and record measured RPO, RTO and integrity PASS.');
if (fs.existsSync('docs/P6_P8_AUTONOMOUS_COMPANY_SEAL.md')) {
  addFutureRequirement('P6-P8 COVERAGE EXPANSION: license or implement additional discovery adapters before claiming continuous coverage of the European merchant universe.');
}
if (fs.existsSync('base44/shared/documentExtraction.ts')) {
  addPendingRequirement('DOCUMENT EXTRACTION PROOF REQUIRED: evaluate an anonymized real FR/ES/EN corpus and publish field precision/recall, false-accept and review-rate evidence.');
}
if (fs.existsSync('base44/shared/outboundProvider.ts')) {
  addFutureRequirement('INSTANTLY SUPERSEARCH ACTIVATION: prove official account-plan capability and AUTO handoff before enabling it as a paid lead source; provider-agnostic canonical identities remain unchanged.');
}
if (fs.existsSync('src/docs/P9_EUROPEAN_LOCALIZATION.md')) {
  addFutureRequirement('P9 NATIVE-MARKET ACTIVATION: fallback-only markets require native product/legal review and localized URL/SSR architecture before native launch claims.');
}
if (fs.existsSync('src/docs/P10_REGULATORY_CONTROL.md')) {
  addFutureRequirement('P10 MARKET/ACTIVITY ACTIVATION: qualified review must approve authority evidence, registrations, passport notifications or partner mandates before each currently disabled regulated activity is enabled.');
}
if (fs.existsSync('src/docs/P12_EUROPEAN_LAUNCH_GROWTH.md')) {
  addFutureRequirement('P12 GROWTH VALIDATION: market ranking, CAC, conversion, retention and forecasts require observed production cohorts.');
}
if (fs.existsSync('src/docs/P15_PROVIDER_REVENUE_SHARE_ARCHITECTURE.md')) {
  addFutureRequirement('P15 PROVIDER MONETIZATION ACTIVATION: keep provider compensation disabled until legal, disclosure, competition, tax and settlement approvals are recorded.');
}
addFutureRequirement('PAYMENTS V1 REAL-WORLD VALIDATION: with the first controlled merchant, complete LIVE Connect → Sync → Analyzer → Recover → Verified Savings → Billing → Stripe → Reconciliation. This blocks REAL_WORLD_VALIDATED, not PILOT_READY.');
for (const [name, ev] of [["tests", testEvidence], ["build", buildEvidence], ["lint", lintEvidence], ["typecheck-critical", tcCritical], ["typecheck-baseline", tcBaseline], ["dependency-audit", dependencyAudit]]) {
  const st = evidenceStatus(ev, tree.hash);
  if (st !== "valid") addPendingRequirement(`evidence ${name}: ${st} (run the *:evidence command)`, { blocking: true });
}

// Legacy readers keep seeing only current pilot blockers. Future activations are
// deliberately excluded so a disabled future capability cannot block PILOT_READY.
const manualRequirements = [...pendingProductionRequirements];
const pilotReadyEligible = pendingProductionRequirements.length === 0;
const realWorldValidatedEligible = pilotReadyEligible && !futureActivationRequirements.some((item) => item.startsWith('PAYMENTS V1 REAL-WORLD VALIDATION'));
// PILOT_READY is intentionally weaker than a production seal.  The first
// controlled merchant may start once pilot blockers are closed, but CAMBRA is
// not PRODUCTION_SEALED until the real-world validation requirement is also
// satisfied.  Keeping distinct booleans prevents a green technical/pilot
// release from being presented as an economically validated production system.
const productionSealEligible = realWorldValidatedEligible;

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
  documentationManifestSha: fs.existsSync("config/documentation-drift-manifest.json")
    ? sha256("config/documentation-drift-manifest.json") : null,
  schedulerInventorySha: fs.existsSync("config/scheduler-inventory.json")
    ? sha256("config/scheduler-inventory.json") : null,
  backendDeploymentTopologySha: backendBundle.topology_sha256,
  backendBundleManifestSha: backendBundle.manifest_sha256,
  backendBundle: {
    physicalFunctionCount:backendBundle.physical_function_count,
    logicalRouteCount:backendBundle.logical_route_count,
    stagedFileCount:backendBundle.staged_file_count,
    stagedTreeSha256:backendBundle.staged_tree_sha256,
    hashAlgorithm:backendBundle.hash_algorithm,
    functionsDir:backendBundle.functions_dir,
    configSha256:backendBundle.config_sha256,
  },
  dataRetentionMatrixSha: fs.existsSync("config/data-retention-matrix.json")
    ? sha256("config/data-retention-matrix.json") : null,
  secretScannerSha: sha256("scripts/check-secrets.mjs"),
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
  dependencyAuditEvidence: dependencyAudit,
  artifactHashes: buildEvidence?.distHash ? { dist: buildEvidence.distHash } : null,
  marketLaunchScope,
  intelligenceClosure,
  researchCorpus,
  completedProductionRequirements,
  pendingProductionRequirements,
  futureActivationRequirements,
  manualRequirements,
  blockingManualRequirements,
  pilotReadyEligible,
  productionSealEligible,
  realWorldValidatedEligible,
  readinessLevel: !pilotReadyEligible ? 'NOT_GO_READY' : (realWorldValidatedEligible ? 'REAL_WORLD_VALIDATED' : 'PILOT_READY'),
  finalVerdict: !pilotReadyEligible ? 'NOT_GO_READY' : (productionSealEligible ? 'PRODUCTION_SEALED' : 'PILOT_READY'),
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync("RELEASE.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`RELEASE.json written for ${manifest.releaseName} (${manifest.version}); sourceTreeHash ${tree.hash.slice(0, 16)}… over ${tree.fileCount} files; ${pendingProductionRequirements.length} pilot blocker(s), ${futureActivationRequirements.length} future activation requirement(s).`);
