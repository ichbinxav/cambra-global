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

const manualRequirements = [];
const blockingManualRequirements = [];
const addRequirement = (message, { blocking = false } = {}) => {
  manualRequirements.push(message);
  if (blocking) blockingManualRequirements.push(message);
};
const baseline = fs.existsSync("config/typecheck-baseline.json")
  ? JSON.parse(fs.readFileSync("config/typecheck-baseline.json", "utf8")) : null;
if (!baseline || baseline.state !== "APPROVED") addRequirement("typecheck baseline: candidate/approve flow not completed", { blocking: true });
if (!fs.existsSync(".github/workflows/ci.yml")) addRequirement("CI workflow not installed (npm run ci:install from a real checkout)", { blocking: true });
if (!process.env.GITHUB_RUN_ID) addRequirement("CI EVIDENCE REQUIRED: this manifest was generated outside GitHub Actions; obtain a green remote workflow run for the final release SHA before calling remote CI verified");
const productPolicy = fs.existsSync("config/product-policy.json")
  ? JSON.parse(fs.readFileSync("config/product-policy.json", "utf8")) : null;
if (productPolicy?.economicTerms?.recoveryEconomicsVersion === "recover-economics-v2" &&
    productPolicy?.economicTerms?.recoverEconomicsV2LegalApproved !== true) {
  addRequirement("LEGAL REVIEW REQUIRED: Recover Economics V2 contractual wording must be approved before new V2 acceptance is enabled");
}
if (fs.existsSync('src/docs/P12_INTELLIGENCE_ARCHITECTURE.md')) {
  addRequirement('LEGAL/PRIVACY RUNTIME REVIEW: CAMBRA now enforces a separate k>=10, identifier-free retained-intelligence layer; before materially widening cross-tenant benchmark use or relying on indefinite post-deletion retention at scale, re-assess lawful basis, residual re-identification risk and retention policy against actual production cohorts. Pseudonymized BenchmarkContribution data remains subject to normal deletion/retention rules.');
}
if (fs.existsSync('src/docs/P13_SHADOW_ROUTING_ARCHITECTURE.md')) {
  addRequirement('ROUTING ACTIVATION PROHIBITED: P13 is shadow/simulation only. Before any real routing, complete PCI DSS scope, PSD2/SCA and regulatory assessment, provider/network contractual review, real-time SLA/SLO and incident architecture, kill switch, payment idempotency/reconciliation proof, merchant controls and financial-liability review.');
}
if (productPolicy?.integrationStatus?.stripe !== "live_verified") {
  addRequirement(`PRODUCTION VALIDATION REQUIRED: Stripe live integration status is ${productPolicy?.integrationStatus?.stripe || "unknown"}; complete a real live-account connect/sync/verification proof before claiming full production seal`);
}
if (fs.existsSync('src/docs/FINAL_AUTONOMOUS_REVENUE_ENGINE_SEAL.md')) {
  addRequirement('REAL-WORLD PILOT VALIDATION REQUIRED: the technical autonomous revenue engine seal does not prove economic autonomy. Complete multiple genuine production merchants end-to-end and populate the first-10 PilotMerchantValidation ledger before claiming real-world autonomous revenue validation.');
}
if (fs.existsSync('base44/functions/maintenanceEngine/function.jsonc') && fs.existsSync('base44/functions/alwaysOnLeadDiscoveryWorker/function.jsonc')) {
  addRequirement('RUNTIME ACTIVATION PROOF REQUIRED AFTER DEPLOYMENT: verify fresh MaintenanceRun, LeadReservoirSnapshot and DocumentationHealthAssessment records within their configured cadence before claiming the latest autonomous workers are active in production. Empty runtime ledgers mean code-ready, not runtime-proven.');
}
if (fs.existsSync('base44/entities/IncidentAlertDelivery.jsonc')) {
  addRequirement('RUNTIME ALERT DELIVERY CONFIGURATION REQUIRED: configure a Founder/Admin alert recipient, deploy the alert ledger, and prove HIGH/CRITICAL delivery, retry, deduplication and Founder Admin visibility with a controlled incident.');
}
if (fs.existsSync('base44/entities/CostBudgetControl.jsonc')) {
  addRequirement('POST-DEPLOYMENT COST CONTROL MIGRATION REQUIRED: re-apply the Founder-approved daily/monthly/category budget so the new CAS reservation fields are initialized; until then paid operations intentionally fail closed.');
}
addRequirement('BASE44 DEPLOYMENT IDENTITY REQUIRED: deploy the exact final source tree and prove that runtime release_version, Git SHA, sha256-tree-v1 source-tree hash and source-tree file count all match RELEASE.json and the packaged archive.');
addRequirement('PAYMENTS V1 CONTROLLED GOLDEN PATH REQUIRED: complete one real controlled merchant through live connect, sync, Analyzer, Recover acceptance, verified outcome, billing and Stripe reconciliation without mocks or bypasses.');
addRequirement('SCHEDULER AND OBSERVABILITY RUNTIME PROOF REQUIRED: observe every required worker at its configured cadence, prove duplicate-execution protection, and confirm the complete deployed loop is alive.');
addRequirement('BACKUP/RESTORE PROOF REQUIRED: execute a real restore drill and record measured RPO/RTO against the production data boundary.');
addRequirement('EMAIL DELIVERABILITY PROOF REQUIRED: verify production SPF/DKIM/DMARC plus bounce, complaint, unsubscribe and suppression handling against the real sending domain and provider.');
addRequirement('FOUNDER CONTROL DRILL REQUIRED: in the real runtime prove start/pause/resume/approve/reject and GLOBAL EMERGENCY STOP, confirm safe Analyzer/read-only availability while stopped, then prove safe resume and complete-loop observability.');
if (fs.existsSync('docs/P6_P8_AUTONOMOUS_COMPANY_SEAL.md')) {
  addRequirement('P6-P8 RUNTIME/COVERAGE PROOF REQUIRED: deploy the autonomous company coordinator and CommercialIntelligenceSnapshot, verify scheduled runtime evidence, and license/implement additional discovery adapters before claiming continuous coverage of the European merchant universe.');
}
if (fs.existsSync('base44/shared/documentExtraction.ts')) {
  addRequirement('DOCUMENT EXTRACTION PRODUCTION EVAL REQUIRED: after DPA/retention approval and dual-model configuration, validate the extractor against a redacted multilingual real-document golden corpus and publish field-level precision/recall, false-accept and review-rate evidence before calling statement extraction production-verified.');
}
if (fs.existsSync('base44/shared/outboundProvider.ts')) {
  addRequirement('INSTANTLY PRODUCTION VALIDATION REQUIRED: configure the scoped API v2 secret and authenticated webhook secret in Base44, prove real provider auth/capabilities, verify mapped sender warm-up and domain health, then complete a founder-authorized zero-send rehearsal before any bounded pilot. Missing or unverified provider state intentionally keeps Instantly NOT_CONFIGURED and effective outbound capacity at 0.');
  addRequirement('P7/P8 RUNTIME LOOP PROOF REQUIRED: after deployment, prove one controlled non-delivering strategy-to-action dry-run plus webhook/reconciliation replay, classification, next-best-action, suppression, approval and global-stop behavior before claiming real commercial pilot readiness. Broad outreach remains prohibited.');
  addRequirement('BASE44 FUNCTION QUOTA: the linked app currently rejects new function names, so v0.95 logical routes are safely hosted in existing deployed functions. Upgrade/raise the quota before deploying the standalone names; do not delete unrelated production functions merely to free slots.');
}
if (fs.existsSync('base44/entities/CommercialCampaign.jsonc')) {
  addRequirement('V0.96 COMMERCIAL OS RUNTIME PROOF REQUIRED: deploy the canonical campaign entity and aggregate route, authenticate the Founder Admin workspace, prove profile→discovery→lead→draft campaign→capacity preview with zero sends, and verify that real outbound remains disabled until the existing explicit pilot preflight is approved.');
  addRequirement('INSTANTLY SUPERSEARCH HANDOFF PROOF REQUIRED: configure the scoped secret, run the official preview capability test, verify the account plan permits SuperSearch, and prove an AUTO handoff rehearsal without changing canonical ICP, lead, campaign or conversation identities. Paid enrichment remains off until separately budgeted and authorized.');
}
if (fs.existsSync('src/docs/P9_EUROPEAN_LOCALIZATION.md')) {
  addRequirement('P9 MARKET LOCALIZATION LIMIT: only en-GB, fr-FR and es-ES product locales are implemented; fallback-only markets require native product/legal review and localized URL/SSR architecture before full native launch claims.');
}
if (fs.existsSync('src/docs/P10_REGULATORY_CONTROL.md')) {
  addRequirement('P10 LEGAL EVIDENCE REQUIRED: conservative market/activity coverage is not legal clearance. Qualified review must approve current primary-authority evidence, registrations, passport notifications and/or partner mandates before each production activity is enabled.');
}
if (fs.existsSync('src/docs/P11_PRODUCTION_SECURITY_RELIABILITY.md')) {
  addRequirement('P11 PRODUCTION SEAL EVIDENCE REQUIRED: final-SHA remote CI, Base44 runtime proof, dependency alert proof, real RPO/RTO restore exercise and multilingual real-document extractor corpus evidence remain external gates.');
}
if (fs.existsSync('src/docs/P12_EUROPEAN_LAUNCH_GROWTH.md')) {
  addRequirement('P12 LAUNCH/GROWTH EVIDENCE REQUIRED: architecture may run honestly in cold start, but real market ranking, CAC, conversion, retention, forecasts and business performance require observed production cohorts; P12 cannot override P10/P11 blockers.');
}
if (fs.existsSync('src/docs/P15_PROVIDER_REVENUE_SHARE_ARCHITECTURE.md')) {
  addRequirement('P15 PROVIDER MONETIZATION LEGAL/TAX ACTIVATION GATE: provider-side compensation may be negotiated and modeled, but each production agreement must retain provider_compensation_activation_allowed=false until explicit jurisdiction/vertical/provider legal opinion, disclosure policy, competition-law review where applicable, tax treatment and settlement mode are approved and recorded.');
}
for (const [name, ev] of [["tests", testEvidence], ["build", buildEvidence], ["lint", lintEvidence], ["typecheck-critical", tcCritical], ["typecheck-baseline", tcBaseline], ["dependency-audit", dependencyAudit]]) {
  const st = evidenceStatus(ev, tree.hash);
  if (st !== "valid") addRequirement(`evidence ${name}: ${st} (run the *:evidence command)`, { blocking: true });
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
  manualRequirements,
  blockingManualRequirements,
  productionSealEligible: manualRequirements.length === 0,
  finalVerdict: manualRequirements.length === 0 ? "PASS" : (blockingManualRequirements.length === 0 ? "PASS WITH EXTERNAL VALIDATION PENDING" : "NOT READY"),
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync("RELEASE.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(`RELEASE.json written for ${manifest.releaseName} (${manifest.version}); sourceTreeHash ${tree.hash.slice(0, 16)}… over ${tree.fileCount} files; ${manualRequirements.length} manual requirement(s).`);
