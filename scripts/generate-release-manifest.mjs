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
const backendBundle = fs.existsSync('base44/.deploy/manifest.json')
  ? JSON.parse(fs.readFileSync('base44/.deploy/manifest.json','utf8')) : null;

const completedProductionRequirements = [
  'Node 24 LTS toolchain and reproducible local verification pipeline are enforced.',
  'Base44 backend function consolidation preserves trust boundaries within the deployed function quota.',
  'Stripe LIVE account credentials and account health were verified; no merchant economic outcome is inferred from that credential proof.',
  'Required production schedulers, duplicate-execution guards, cost budgets, anomaly kill switch, global emergency stop and safe resume have recorded runtime evidence.',
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
  backendDeploymentTopologySha: sha256('base44/deployment-topology.json'),
  backendBundleManifestSha: backendBundle ? sha256('base44/.deploy/manifest.json') : null,
  backendBundle: backendBundle ? {
    physicalFunctionCount:backendBundle.physical_function_count,
    logicalRouteCount:backendBundle.logical_route_count,
    stagedFileCount:backendBundle.staged_file_count,
    stagedTreeSha256:backendBundle.staged_tree_sha256,
  } : null,
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
  completedProductionRequirements,
  pendingProductionRequirements,
  futureActivationRequirements,
  manualRequirements,
  blockingManualRequirements,
  pilotReadyEligible,
  productionSealEligible: pilotReadyEligible,
  realWorldValidatedEligible,
  readinessLevel: !pilotReadyEligible ? 'NOT_GO_READY' : (realWorldValidatedEligible ? 'REAL_WORLD_VALIDATED' : 'PILOT_READY'),
  finalVerdict: pilotReadyEligible ? "PASS" : "NOT_GO_READY",
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync("RELEASE.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`RELEASE.json written for ${manifest.releaseName} (${manifest.version}); sourceTreeHash ${tree.hash.slice(0, 16)}… over ${tree.fileCount} files; ${pendingProductionRequirements.length} pilot blocker(s), ${futureActivationRequirements.length} future activation requirement(s).`);
