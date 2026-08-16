// v62.2 CP7 / v62.3 — pre-ECL freeze verification (pure, testable core).
// v62.3 made it STAGE-AWARE: the freeze is no longer a single boolean "nothing
// ECL may exist", it is a declared stage with a CODE-OWNED allowlist. This is
// deliberately not a weakening: an unknown or missing stage is a hard failure,
// the allowlist can only come from this module (never from the CLI or the JSON),
// and everything outside the allowlist stays as forbidden as it was.
import crypto from "node:crypto";

// Precise ECL artifact names — word-anchored so "declare"/"reclassify" never
// false-positive the way a bare /ecl/i would. P4 explicitly covers the
// camelCase production/domain names that the old pattern missed.
export const ECL_NAME_PATTERN = /\becl(?:-policy|Policy(?:Schema)?|Domain|Gates|Serialize|Lifecycle(?:Scheduler)?|Reconcile|Strikes|Engine|Parity|ProcessEvidence|Operations|Persistence|ReviewWorkflow|EconomicGate|RecoverEvidence|OperationalRecovery|ProductionHealth|IncidentWorkflow|P3Closure|P4Closure|P4ProductionProof|P5Closure|P6Closure|P7Closure)(?:\b|[._-])|EvidenceAttestation|EvidenceLifecycleEvent|EvidenceStrike|ReviewCase|ReviewQueue|ConfidenceResult|NormalizedEvidence|OperationalIncident/;
export const ECL_FIELD_PATTERN = /confidence_level_ecl|freeze_eligibility|"evidence_status"/;

export const STAGE_PRE_ECL = "PRE_ECL";
export const STAGE_ECL_P1 = "ECL_P1_SCHEMA_ONLY";
// v62.4 — ECL P2: domain contracts + canonical policy. STILL no rule engine, no
// scheduler, no lifecycle handler, no UI and no billing integration: the stage
// widens the allowlist by EXACT PATHS only, never by category or pattern.
export const STAGE_ECL_P2 = "ECL_P2_DOMAIN_CONTRACTS";
// v62.5 — ECL P3: the lifecycle ENGINE (pure domain modules + one I/O handler).
// STILL no scheduler, no reminders, no ReviewQueue UI, no billing integration:
// the stage widens the allowlist by EXACT PATHS only, never by category.
export const STAGE_ECL_P3 = "ECL_P3_LIFECYCLE_ENGINE";
// v62.7 — ECL P4: the OPERATIONAL workflow (scheduler, due discovery, automatic
// expiry, bounded reminders, ReviewCase workflow). STILL no billing, no
// invoicing, no collections, no Stripe: the stage widens the allowlist by EXACT
// PATHS only, never by category, and no monetary file is listed.
export const STAGE_ECL_P4 = "ECL_P4_OPERATIONAL_WORKFLOW";
// v0.63.2 — P4 PRODUCTION PROOF: no new economic semantics. This stage only
// exposes the already-closed P4 review workflow to an admin operator surface
// and adds runtime observability around scheduler invocation. Billing remains
// outside ECL; the future economic-enforcement stage is deliberately separate.
export const STAGE_ECL_P4_PROOF = "ECL_P4_PRODUCTION_PROOF";
// v0.64.0 — ECL P5: economic enforcement. P5 does NOT calculate money and does
// not change confidence; it makes the canonical ECL gates mandatory at the
// existing Recover boundaries before a contractual/economic side effect.
export const STAGE_ECL_P5 = "ECL_P5_ECONOMIC_ENFORCEMENT";
// v0.65.0 — ECL P6: economic execution + reconciliation. P6 does not widen
// the confidence model or authorize new money. It takes effects already
// authorized by P5 and makes their Stripe execution replay-safe, their local
// mirror convergent, and their payment ledger auditable/reconcilable.
export const STAGE_ECL_P6 = "ECL_P6_ECONOMIC_EXECUTION_RECONCILIATION";
// v0.66.0 — ECL P7: production operations + incident recovery. P7 does not
// authorize a new economic action and does not mutate ECL confidence. It adds
// critical-worker liveness/SLO detection, idempotent operational incidents,
// versioned DLQ scheduling, and explicit admin-only bounded recovery/replay.
export const STAGE_ECL_P7 = "ECL_P7_PRODUCTION_OPERATIONS_INCIDENT_RECOVERY";
// v0.67.0 — P8 closes the founder/admin operating surface and safe scheduler configuration.
// It adds no economic authority: human approval/invoice generation remains deliberately unscheduled.
export const STAGE_ECL_P8 = "ECL_P8_PRODUCTION_ADMIN_AUTOMATION_AI_OPERATIONS";
export const STAGES = [STAGE_PRE_ECL, STAGE_ECL_P1, STAGE_ECL_P2, STAGE_ECL_P3, STAGE_ECL_P4, STAGE_ECL_P4_PROOF, STAGE_ECL_P5, STAGE_ECL_P6, STAGE_ECL_P7, STAGE_ECL_P8];

// Declared transitions. PRE_ECL → P2 is DELIBERATELY ABSENT: P1 cannot be
// skipped, so a repo that never applied the schemas can never reach the
// contracts stage. P2 → P1 exists so the stage is reversible. P3 is reachable
// ONLY from P2 (never from PRE_ECL or P1 — a repo without the domain
// contracts can never gain a lifecycle engine), and P3 → P2 is the rollback.
export const STAGE_TRANSITIONS = {
  [STAGE_PRE_ECL]: [STAGE_ECL_P1],
  [STAGE_ECL_P1]: [STAGE_PRE_ECL, STAGE_ECL_P2],
  [STAGE_ECL_P2]: [STAGE_ECL_P1, STAGE_ECL_P3],
  // P4 is reachable ONLY from P3 (a repo without the lifecycle engine can never
  // gain an operational workflow), and P4 → P3 is the only rollback.
  [STAGE_ECL_P3]: [STAGE_ECL_P2, STAGE_ECL_P4],
  [STAGE_ECL_P4]: [STAGE_ECL_P3, STAGE_ECL_P4_PROOF],
  [STAGE_ECL_P4_PROOF]: [STAGE_ECL_P4, STAGE_ECL_P5],
  [STAGE_ECL_P5]: [STAGE_ECL_P4_PROOF, STAGE_ECL_P6],
  [STAGE_ECL_P6]: [STAGE_ECL_P5, STAGE_ECL_P7],
  [STAGE_ECL_P7]: [STAGE_ECL_P6, STAGE_ECL_P8],
  [STAGE_ECL_P8]: [STAGE_ECL_P7],
};

// CODE-OWNED allowlist for ECL P1. The six schema paths, nothing else — no
// functions, no policy file, no lifecycle engine, no UI.
export const P1_ALLOWLIST = [
  "base44/entities/StatementImport.jsonc",
  "base44/entities/SavingsEvidence.jsonc",
  "base44/entities/EvidenceAttestation.jsonc",
  "base44/entities/EvidenceLifecycleEvent.jsonc",
  "base44/entities/EvidenceStrike.jsonc",
  "base44/entities/ReviewCase.jsonc",
];

// The two schemas that are allowed to CARRY ECL fields in stage P1. Both are
// frozen entries, so their hashes still have to match exactly.
export const P1_ECL_FIELD_PATHS = [
  "base44/entities/StatementImport.jsonc",
  "base44/entities/SavingsEvidence.jsonc",
];

// CODE-OWNED allowlist for ECL P2 = the six P1 schemas plus the EXACT paths of
// the domain-contract layer. Every entry is a full path: no wildcard, no
// directory, no name pattern. Anything not literally listed here is as
// forbidden in P2 as it was in PRE_ECL — including ReviewQueue, rule engines,
// lifecycle handlers, schedulers and UI.
export const P2_ALLOWLIST = [
  ...P1_ALLOWLIST,
  "config/ecl-policy.json",
  "src/lib/eclPolicySchema.js",
  "scripts/generate-ecl-policy.mjs",
  "src/lib/normalizedEvidence.js",
  "src/lib/confidenceResult.js",
  "src/lib/eclGates.js",
  "src/lib/eclSerialize.js",
  // Generated artifacts — same layout product-policy already uses in this repo.
  "src/lib/generated/eclPolicy.js",
  "base44/shared/generated/eclPolicy.ts",
  "base44/shared/generated/eclDomain.ts",
  // P2 tests.
  "src/lib/eclPolicy.test.js",
  "src/lib/normalizedEvidence.test.js",
  "src/lib/confidenceResult.test.js",
  "src/lib/eclGates.test.js",
  "src/lib/eclParity.test.js",
];

// CODE-OWNED allowlist for ECL P3 = everything P2 allowed plus the EXACT paths
// of the lifecycle engine: four pure domain modules, their tests, and ONE I/O
// handler. NO scheduler, NO reminder job, NO ReviewQueue UI, NO billing file is
// listed — adding any of those requires a new stage, not an edit here.
export const P3_ALLOWLIST = [
  ...P2_ALLOWLIST,
  "src/lib/eclLifecycle.js",
  "src/lib/eclReconcile.js",
  "src/lib/eclStrikes.js",
  "src/lib/eclEngine.js",
  "src/lib/eclLifecycle.test.js",
  "src/lib/eclReconcile.test.js",
  "src/lib/eclStrikes.test.js",
  "src/lib/eclEngine.test.js",
  // v62.6 — P3 CLOSURE regression matrix (release-created critical test).
  "src/lib/eclP3Closure.test.js",
  "base44/functions/eclProcessEvidence/entry.ts",
];

// CODE-OWNED allowlist for ECL P4 = everything P3 allowed plus the EXACT paths
// of the operational workflow: ONE pure operational module, its tests, and TWO
// I/O handlers (the lifecycle scheduler and the review workflow). NO billing,
// invoicing, collection, Stripe or settlement file is listed — adding any of
// those requires a NEW stage, not an edit here.
export const P4_ALLOWLIST = [
  ...P3_ALLOWLIST,
  "src/lib/eclOperations.js",
  "src/lib/eclP4Closure.test.js",
  // v62.7 fix — the shared idempotent-persistence adapter is P4 PRODUCTION
  // code imported by all three ECL boundaries; omitting it left critical ECL
  // code outside the freeze contract. src/lib/eclOperations.test.js was listed
  // but never existed: an allowlist entry for a non-existent file is a false
  // guarantee, so it is removed (its coverage lives in eclP4Closure.test.js).
  "base44/shared/eclPersistence.ts",
  "base44/functions/eclLifecycleScheduler/entry.ts",
  "base44/functions/eclReviewWorkflow/entry.ts",
];

// P4 Production Proof widens P4 by exactly THREE ECL-named artifacts: the admin
// ReviewQueue consumer, its closure test, and the scheduler's versioned Base44
// automation config. Runtime scheduler observability remains inside the already-
// sanctioned P4 scheduler boundary. App.jsx and AdminLayout only wire a protected
// route/navigation item and are governed by normal release evidence rather than
// by an ECL wildcard exception.
export const P4_PROOF_ALLOWLIST = [
  ...P4_ALLOWLIST,
  "src/pages/admin/ReviewQueue.jsx",
  "src/lib/eclP4ProductionProof.test.js",
  "base44/functions/eclLifecycleScheduler/function.jsonc",
];

// P5 adds two server-side adapters, the existing Recover economic/contract
// boundaries, two upstream evidence-readiness/materialization boundaries, and
// its closure matrix. Generated policy/domain stay canonical; no Invoice,
// MonthlySavingsReport, Baseline or BillingRule schema is widened.
export const P5_ALLOWLIST = [
  ...P4_PROOF_ALLOWLIST,
  "base44/shared/eclEconomicGate.ts",
  "base44/shared/eclRecoverEvidence.ts",
  "base44/functions/getRecoverAcceptanceContext/entry.ts",
  "base44/functions/startRecoverAcceptance/entry.ts",
  "base44/functions/acceptRecoverMandate/entry.ts",
  "base44/functions/generateMonthlySavingsReport/entry.ts",
  "base44/functions/approveRecoverReportForInvoicing/entry.ts",
  "base44/functions/createEligibleRecoverInvoices/entry.ts",
  "src/lib/eclP5Closure.test.js",
];

// P6 widens P5 only around already-authorized economic execution. The Invoice
// and PaymentEvent schemas gain additive execution/reconciliation fields; the
// existing invoice issuer, webhook and admin/manual repair endpoints are
// hardened; one read-only Stripe reconciler is scheduled; and a closure matrix
// locks the guarantees. No new economic authorization gate is introduced.
export const P6_ALLOWLIST = [
  ...P5_ALLOWLIST,
  "base44/shared/economicExecution.ts",
  "base44/entities/Invoice.jsonc",
  "base44/entities/PaymentEvent.jsonc",
  "base44/functions/stripeBillingWebhook/entry.ts",
  "base44/functions/reconcileRecoverBilling/entry.ts",
  "base44/functions/reconcileRecoverBilling/function.jsonc",
  "base44/functions/reconcileInvoice/entry.ts",
  "base44/functions/recordPayment/entry.ts",
  "base44/functions/createPaymentLink/entry.ts",
  "src/lib/eclP6Closure.test.js",
];

// P7 widens P6 by exactly nine operational artifacts. Existing P6 reconciler
// may gain runtime telemetry without changing its read-only Stripe guarantee.
// The pre-existing webhook DLQ worker becomes a versioned scheduled boundary;
// manual replay is bounded/admin-only and preserves the stable delivery id.
export const P7_ALLOWLIST = [
  ...P6_ALLOWLIST,
  "base44/entities/OperationalIncident.jsonc",
  "base44/shared/eclOperationalRecovery.ts",
  "base44/functions/eclProductionHealth/entry.ts",
  "base44/functions/eclProductionHealth/function.jsonc",
  "base44/functions/eclIncidentWorkflow/entry.ts",
  "base44/functions/processWebhookDeadLetters/entry.ts",
  "base44/functions/processWebhookDeadLetters/function.jsonc",
  "src/pages/admin/EclOperations.jsx",
  "src/lib/eclP7Closure.test.js",
];

export const P8_ALLOWLIST = [
  ...P7_ALLOWLIST,
  "base44/functions/getAdminOperationsCockpit/entry.ts",
  "base44/functions/adminAgentOperations/entry.ts",
  "src/pages/admin/AdminCommand.jsx",
  "src/pages/admin/AdminAgents.jsx",
  "src/pages/admin/AdminAutomations.jsx",
  "base44/functions/retryPendingRecoverContracts/function.jsonc",
  "base44/functions/purgePaymentsAnalysisSessions/function.jsonc",
  "base44/functions/purgeInactiveLeads/function.jsonc",
  "base44/functions/scheduledBenchmarkRecompute/function.jsonc",
  "src/lib/eclP8Closure.test.js",
];

export function allowlistForStage(stage) {
  if (stage === STAGE_ECL_P8) return [...P8_ALLOWLIST];
  if (stage === STAGE_ECL_P7) return [...P7_ALLOWLIST];
  if (stage === STAGE_ECL_P6) return [...P6_ALLOWLIST];
  if (stage === STAGE_ECL_P5) return [...P5_ALLOWLIST];
  if (stage === STAGE_ECL_P4_PROOF) return [...P4_PROOF_ALLOWLIST];
  if (stage === STAGE_ECL_P4) return [...P4_ALLOWLIST];
  if (stage === STAGE_ECL_P3) return [...P3_ALLOWLIST];
  if (stage === STAGE_ECL_P2) return [...P2_ALLOWLIST];
  if (stage === STAGE_ECL_P1) return [...P1_ALLOWLIST];
  if (stage === STAGE_PRE_ECL) return [];
  throw new Error(`unknown stage: ${stage}`);
}

// Stages in which the ECL policy file (config/ecl-policy.json) may exist.
// PRE_ECL and P1 must keep failing on it — the policy layer starts in P2.
export function eclPolicyFileAllowed(stage) {
  return stage === STAGE_ECL_P2 || stage === STAGE_ECL_P3 || stage === STAGE_ECL_P4 || stage === STAGE_ECL_P4_PROOF || stage === STAGE_ECL_P5 || stage === STAGE_ECL_P6 || stage === STAGE_ECL_P7 || stage === STAGE_ECL_P8;
}

/**
 * Resolve the stage declared by config/pre-ecl-freeze.json.
 * A missing or unknown stage THROWS — never defaults to the permissive one.
 */
export function resolveStage(freeze) {
  const stage = freeze?.stage;
  if (!stage) throw new Error("config/pre-ecl-freeze.json declares no stage — refusing to guess");
  if (!STAGES.includes(stage)) throw new Error(`config/pre-ecl-freeze.json declares unknown stage "${stage}"`);
  return stage;
}

export const normalizePath = (p) => String(p).replace(/^\.\//, "");

export const sha256Hex = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/**
 * entries: [{ path, sha256, allowedChange }] · readFile(path) → Buffer|null.
 * options: { stage } — defaults to the STRICTEST stage (PRE_ECL) when omitted,
 * so a caller that forgets to pass a stage gets more checking, never less.
 * Returns { ok, failures[] }. Detects: missing file / moved path, content
 * change (full-hash), unsanctioned ECL fields, and ECL imports in handlers.
 */
export function checkFreeze(entries, readFile, options = {}) {
  const stage = options.stage || STAGE_PRE_ECL;
  const stageAllowlist = allowlistForStage(stage).map(normalizePath);
  // P2 adds NO schema permission: the same two schemas, and only those, may
  // carry ECL fields. Baseline.jsonc and processUploadedFile stay excluded in
  // every stage, and their hashes are still checked below without exception.
  const eclFieldsAllowedIn =
    stage === STAGE_ECL_P1 || stage === STAGE_ECL_P2 || stage === STAGE_ECL_P3 || stage === STAGE_ECL_P4 || stage === STAGE_ECL_P4_PROOF || stage === STAGE_ECL_P5 || stage === STAGE_ECL_P6 || stage === STAGE_ECL_P7 || stage === STAGE_ECL_P8
      ? P1_ECL_FIELD_PATHS
      : [];
  const failures = [];
  for (const entry of entries) {
    const content = readFile(entry.path);
    if (content === null) {
      failures.push(`frozen file missing or moved: ${entry.path}`);
      continue;
    }
    const actual = sha256Hex(content);
    if (actual !== entry.sha256) {
      failures.push(`frozen file modified: ${entry.path} (expected ${entry.sha256.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`);
    }
    const text = content.toString("utf8");
    if (entry.path.endsWith(".jsonc") && ECL_FIELD_PATTERN.test(text) && !eclFieldsAllowedIn.includes(normalizePath(entry.path))) {
      failures.push(`frozen schema contains ECL field: ${entry.path} (stage ${stage})`);
    }
    const normalizedEntryPath = normalizePath(entry.path);
    const eclOwnedHandlerAtDeclaredStage =
      stageAllowlist.includes(normalizedEntryPath) &&
      ECL_NAME_PATTERN.test(normalizedEntryPath);
    if (
      entry.path.endsWith(".ts") && hasEclImports(text) &&
      !eclOwnedHandlerAtDeclaredStage
    ) {
      failures.push(`frozen handler imports ECL code: ${entry.path}`);
    }
  }
  return { ok: failures.length === 0, failures };
}

export function hasEclImports(source) {
  for (const line of source.split("\n")) {
    if (/^\s*import\b/.test(line) && ECL_NAME_PATTERN.test(line)) return true;
  }
  return ECL_NAME_PATTERN.test(source);
}
