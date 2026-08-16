#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const configDir = path.join(root, "config", "intelligence");
const specDir = process.env.CAMBRA_INTELLIGENCE_SPEC_DIR;
const generatedAt = "2026-08-13T00:00:00Z";

if (!specDir) {
  throw new Error(
    "CAMBRA_INTELLIGENCE_SPEC_DIR is required and must point to the directory containing the attached canonical specifications",
  );
}

const sha256Text = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const normalizeText = (value) => value.normalize("NFC").trim().replace(/\s+/gu, " ");
const lineCount = (value) => value.split("\n").length - (value.endsWith("\n") ? 1 : 0);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = (name, value) => {
  fs.mkdirSync(configDir, { recursive: true });
  const content = json(value);
  fs.writeFileSync(path.join(configDir, name), content, "utf8");
  return {
    path: `config/intelligence/${name}`,
    sha256: sha256Text(content),
  };
};
const splitMarkdownRow = (line) =>
  line.trim().slice(1, -1).split("|").map((cell) => normalizeText(cell));

const sourceDefinitions = [
  {
    spec_id: "ORCH",
    version: "2.0.0-root",
    physical_locator: "CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPECxx.md",
    declared_logical_name: "CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPEC.md",
    sha256: "f64a20bd69cb46c0f767f024ebaff4cf7145ff746f80ff0e01534da316bc5123",
    line_count: 7921,
    scope: "Root composition, compatibility, orchestration, integration tests and compositional seals",
  },
  {
    spec_id: "CIV2",
    version: "2.0.0-master-spec",
    physical_locator: "CAMBRA_INTELLIGENCE_V2_MASTER_SPEC.md",
    declared_logical_name: "CAMBRA_INTELLIGENCE_V2_MASTER_SPEC.md",
    sha256: "48f781020c8893a439c84743703152d337e5a917348297dbb015a5bf448905c6",
    line_count: 4859,
    scope: "Parent intelligence system and shared contracts",
  },
  {
    spec_id: "ALIF",
    version: "2.0.0-master-spec",
    physical_locator: "CAMBRA_ADAPTIVE_LEAD_INTELLIGENCE_FUNNEL_MASTER_SPEC.md",
    declared_logical_name: "CAMBRA_ADAPTIVE_LEAD_INTELLIGENCE_FUNNEL_MASTER_SPEC.md",
    sha256: "78236a93e571ce6aa4ec095294df91e8e1c1a51f43c266cf99ff944823157d4f",
    line_count: 5989,
    scope: "Discovery, research and adaptive lead funnel domain profile",
  },
  {
    spec_id: "CPIC",
    version: "1.0.0",
    physical_locator: "CAMBRA_CPIC_ULTRA_MASTER_SPECx.md",
    declared_logical_name: "CAMBRA_CPIC_ULTRA_MASTER_SPEC.md",
    sha256: "6279c2cb83bc9bdbab31167a6d1acbaca1a6a8c1ee5a400eb418800d599a6502",
    line_count: 7929,
    scope: "Statistical, probabilistic, decision and uncertainty intelligence",
  },
];

const sources = new Map();
for (const definition of sourceDefinitions) {
  const file = path.join(specDir, definition.physical_locator);
  if (!fs.existsSync(file)) throw new Error(`missing canonical source: ${file}`);
  const content = fs.readFileSync(file, "utf8");
  const observedHash = sha256File(file);
  const observedLines = lineCount(content);
  if (observedHash !== definition.sha256) {
    throw new Error(`source hash mismatch for ${definition.spec_id}: ${observedHash}`);
  }
  if (observedLines !== definition.line_count) {
    throw new Error(`source line-count mismatch for ${definition.spec_id}: ${observedLines}`);
  }
  sources.set(definition.spec_id, { ...definition, file, content });
}

const legacySources = [
  {
    logical_alias: "CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPEC.md",
    authoritative_spec_id: "ORCH",
    authoritative_physical_locator: "CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPECxx.md",
    conflicting_physical_sha256: "4cdaa0daded4576eb297fd752f4b09aeb44830db28ebe7ab96a4511c61eafb06",
    conflicting_physical_line_count: 1299,
  },
  {
    logical_alias: "CAMBRA_CPIC_ULTRA_MASTER_SPEC.md",
    authoritative_spec_id: "CPIC",
    authoritative_physical_locator: "CAMBRA_CPIC_ULTRA_MASTER_SPECx.md",
    conflicting_physical_sha256: "3d4f178a0092ad798be7a874e15571e1b40352ead9a417ddc4e0c1afa771e086",
    conflicting_physical_line_count: 429,
  },
].map((entry) => ({
  ...entry,
  alias_status: "CONTENT_MISMATCH",
  lifecycle_status: "SUPERSEDED",
  loader_eligible: false,
  rule: "Never resolve this logical alias by filename. Load the authoritative physical locator and verify hash plus line count.",
}));

const parseRootRequirements = () => {
  const source = sources.get("ORCH");
  const rows = [];
  source.content.split("\n").forEach((line, index) => {
    const match = line.match(/^\*\*(ORCH-R-[A-Z0-9-]+)\*\*\s+—\s+(.+)$/u);
    if (!match) return;
    const requirementText = normalizeText(match[2]);
    rows.push({
      requirement_uid: `ORCH@${source.sha256}::${match[1]}`,
      local_requirement_id: match[1],
      source_spec_id: "ORCH",
      source_spec_version: source.version,
      source_spec_hash: source.sha256,
      source_anchor: `line:${index + 1}`,
      requirement_text: requirementText,
      requirement_text_hash: sha256Text(requirementText),
      scope: { composition: "CAMBRA_INTELLIGENCE_V2" },
      requirement_progress: "NOT_STARTED",
      implementation_status: "TARGET",
      verification_level: "UNKNOWN",
      owner: "CAMBRA Intelligence Composition Owner",
      dependencies: [],
      implementation_refs: [],
      test_refs: [],
      runtime_evidence_refs: [],
      blockers: ["IMPLEMENTATION_ASSESSMENT_NOT_COMPLETED", "ACCEPTANCE_TESTS_NOT_RUN"],
      supersession_ref: null,
      seal_impact: [],
      source_binding_status: "BOUND",
      updated_at: generatedAt,
    });
  });
  if (rows.length !== 538) throw new Error(`expected 538 root requirements, found ${rows.length}`);
  return rows;
};

const rootRequirements = parseRootRequirements();
const rootRequirementIds = new Set(rootRequirements.map((row) => row.local_requirement_id));
if (rootRequirementIds.size !== 538) throw new Error("duplicate root requirement id");

const requirementLedger = {
  schema_version: "intelligence-requirement-ledger.v2",
  generated_at: generatedAt,
  composition_manifest_ref: "config/intelligence/composition-manifest.v2.json",
  legacy_ledger_ref: "config/intelligence/requirement-ledger.v1.json",
  legacy_ledger_status: "SUPERSEDED_FOR_CANONICAL_V2_RECONCILIATION",
  uid_format: "<spec_id>@<spec_sha256>::<local_requirement_id>",
  text_normalization: "Unicode NFC, trim, collapse Unicode whitespace to one ASCII space, UTF-8 SHA-256",
  status_axes: {
    requirement_progress: ["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED", "VERIFIED", "BLOCKED", "DEFERRED", "SUPERSEDED"],
    implementation_status: ["EXISTING", "PARTIAL", "NOT_PRESENT", "TARGET", "DEPRECATED", "OUT_OF_SCOPE"],
    verification_level: ["UNKNOWN", "SOURCE_OBSERVED", "TEST_VERIFIED", "RUNTIME_VERIFIED", "PRODUCTION_EVIDENCED", "REAL_WORLD_VALIDATED"],
  },
  source_specs: Object.fromEntries(sourceDefinitions.map((source) => [source.spec_id, {
    version: source.version,
    physical_locator: source.physical_locator,
    sha256: source.sha256,
    line_count: source.line_count,
  }])),
  requirement_counts: { ORCH: rootRequirements.length },
  verification_policy: "Source binding identifies normative text only. It does not verify implementation, runtime, production or real-world behavior.",
  requirements: rootRequirements,
};

const parseTableTests = (specId, localPattern) => {
  const source = sources.get(specId);
  const rows = [];
  source.content.split("\n").forEach((line, index) => {
    const cells = splitMarkdownRow(line);
    if (cells.length < 3 || !localPattern.test(cells[0])) return;
    rows.push({
      local_test_id: cells[0],
      source_anchor: `line:${index + 1}`,
      definition_fields: cells.slice(1),
    });
  });
  return rows;
};

const parseCpicTests = () => {
  const source = sources.get("CPIC");
  const rows = [];
  source.content.split("\n").forEach((line, index) => {
    const match = line.match(/^- \*\*(CPIC-AT-\d{3}) — (.+?):\*\*\s+(.+)$/u);
    if (!match) return;
    rows.push({
      local_test_id: match[1],
      source_anchor: `line:${index + 1}`,
      definition_fields: [normalizeText(match[2]), normalizeText(match[3])],
    });
  });
  return rows;
};

const rawTests = {
  ORCH: parseTableTests("ORCH", /^ORCH-AT-\d{3}$/u),
  CIV2: parseTableTests("CIV2", /^AT-[A-Z0-9]+-\d{3}$/u),
  ALIF: parseTableTests("ALIF", /^AT-[A-Z0-9]+-\d{3}$/u),
  CPIC: parseCpicTests(),
};
const expectedTestCounts = { ORCH: 200, CIV2: 113, ALIF: 249, CPIC: 330 };
for (const [specId, expected] of Object.entries(expectedTestCounts)) {
  const ids = rawTests[specId].map((row) => row.local_test_id);
  if (rawTests[specId].length !== expected || new Set(ids).size !== expected) {
    throw new Error(`test catalog mismatch for ${specId}: ${rawTests[specId].length}/${new Set(ids).size}`);
  }
}

const testRows = Object.entries(rawTests).flatMap(([specId, rows]) => {
  const source = sources.get(specId);
  return rows.map((row) => ({
    test_uid: `${specId}@${source.sha256}::${row.local_test_id}`,
    local_test_id: row.local_test_id,
    display_test_id: specId === "ORCH" || specId === "CPIC" ? row.local_test_id : `${specId}-${row.local_test_id}`,
    legacy_aliases: [row.local_test_id],
    source_spec_id: specId,
    source_spec_version: source.version,
    source_spec_hash: source.sha256,
    source_anchor: row.source_anchor,
    definition_fields: row.definition_fields,
    definition_hash: sha256Text(normalizeText(row.definition_fields.join(" | "))),
    requirement_refs: [],
    requirement_mapping_status: "NOT_MAPPED",
    status: "NOT_RUN",
    environment: null,
    source_hash: source.sha256,
    config_hash: null,
    schema_hash: null,
    data_hash: null,
    model_hash: null,
    executed_at: null,
    executed_by: null,
    evidence_refs: [],
    failure: null,
    blockers: ["TEST_NOT_EXECUTED", "REQUIREMENT_MAPPING_NOT_COMPLETED"],
    applicability: { status: "PENDING_ASSESSMENT", rationale: null, approval_ref: null, expires_at: null },
    owner: `${specId} specification owner`,
    seal_impact: [],
  }));
});

const civ2Ids = new Set(rawTests.CIV2.map((row) => row.local_test_id));
const alifIds = new Set(rawTests.ALIF.map((row) => row.local_test_id));
const collisions = [...civ2Ids].filter((id) => alifIds.has(id)).sort().map((localId) => ({
  local_test_id: localId,
  collision_status: "DISAMBIGUATED_BY_COMPOSITE_UID",
  test_uids: [
    `CIV2@${sources.get("CIV2").sha256}::${localId}`,
    `ALIF@${sources.get("ALIF").sha256}::${localId}`,
  ],
  display_aliases: [`CIV2-${localId}`, `ALIF-${localId}`],
}));
if (collisions.length !== 22) throw new Error(`expected 22 child test collisions, found ${collisions.length}`);

const acceptanceCatalog = {
  schema_version: "intelligence-acceptance-test-catalog.v2",
  generated_at: generatedAt,
  composition_manifest_ref: "config/intelligence/composition-manifest.v2.json",
  uid_format: "<spec_id>@<spec_sha256>::<local_test_id>",
  status_enum: ["PASS", "FAIL", "NOT_RUN", "BLOCKED", "NOT_APPLICABLE"],
  absent_test_default: "NOT_RUN",
  execution_claim_policy: "Catalog presence and local structural validation are not test execution evidence.",
  counts: {
    root: 200,
    child: 692,
    total: 892,
    by_spec: expectedTestCounts,
    literal_civ2_alif_collisions: collisions.length,
    pass: 0,
    fail: 0,
    not_run: 892,
    blocked: 0,
    not_applicable: 0,
  },
  alias_collisions: collisions,
  tests: testRows,
};

const p0Assessments = {
  "ROOT-OTR-001": ["REMAINING_MATERIAL_EFFECT_BOUNDARIES_NOT_ALL_FAILURE_INJECTED", "DEPLOYED_FAILURE_INJECTION_ZERO_EFFECT_EVIDENCE_MISSING"],
  "ROOT-OTR-002": ["UNADAPTED_PAID_AI_AND_EXTERNAL_ADAPTER_EPOCH_GUARDS_REMAIN", "CONCURRENT_STALE_EPOCH_RUNTIME_DRILL_MISSING"],
  "ROOT-OTR-003": ["OUTLOOK_RESEND_REMOTE_PAUSE_RECEIPTS_UNAVAILABLE", "AUTHENTICATED_REMOTE_CONTAINMENT_DRILL_MISSING"],
  "ROOT-OTR-004": ["DEPLOYED_BASE44_CAS_CONTENTION_EVIDENCE_MISSING"],
  "ROOT-OTR-005": ["PER_WORKER_TIMEOUT_RETRY_TENANT_AND_DEADLINE_BOUNDS_INCOMPLETE", "DEPLOYED_KILL_TAKEOVER_FENCING_DRILL_MISSING"],
  "ROOT-OTR-006": ["DEPLOYED_SCHEDULED_MANUAL_INTERNAL_CONCURRENCY_RECEIPT_MISSING"],
  "ROOT-OTR-007": ["DEPLOYED_RESEND_OUTLOOK_INSTANTLY_RECEIPTS_AND_RECONCILIATION_EVIDENCE_MISSING"],
  "ROOT-OTR-008": ["DEPLOYED_CONCURRENT_REPLAY_AND_CUSTOM_RECEIVER_RECEIPT_EVIDENCE_MISSING"],
  "ROOT-OTR-009": ["DEPLOYED_DUAL_CONFIRMATION_AND_EXHAUSTIVE_TAMPER_RECEIPTS_MISSING", "LIVE_LEGACY_APPROVAL_BACKFILL_NOT_RUN"],
  "ROOT-OTR-010": ["DEPLOYED_SEVEN_EXECUTOR_FAILURE_AND_RECONCILIATION_RECEIPTS_MISSING", "LIVE_LEGACY_APPROVAL_AGENTTASK_RECONCILIATION_NOT_RUN"],
  "ROOT-OTR-011": ["RECOVER_CONTRACT_AND_PAYMENTS_MULTIROW_SAGA_COVERAGE_INCOMPLETE", "RECOVER_REPORT_DATASTORE_UNIQUENESS_AND_DUPLICATE_RECONCILIATION_RUNTIME_PENDING", "LEGACY_NON_RECOVER_FINANCIAL_ROUTES_OUTSIDE_UNIVERSAL_SAGA", "PAYMENTS_GO_LIVE_APPROVAL_PRODUCER_AND_ADVANCED_E_SIGNATURE_MISSING", "DEPLOYED_THREE_DOMAIN_TRANSITION_FAULT_MATRIX_MISSING"],
  "ROOT-OTR-012": ["37_OF_42_MATERIAL_BOUNDARIES_NOT_WIRED_TO_COMMON_EFFECT_AUTHORITY", "DEPLOYED_UNIVERSAL_EFFECT_DENIAL_RECEIPTS_MISSING"],
  "ROOT-OTR-013": ["46_MATERIAL_CREATORS_HAVE_NO_COMPLETE_EFFECT_COST_RECEIPT_LINEAGE", "111_MATERIAL_ROUTE_FILES_UNRESOLVED_AND_RUNTIME_TRACE_REPORT_MISSING"],
  "ROOT-OTR-014": ["DEPLOYED_ALL_SURFACE_DEPENDENCY_FAILURE_DRILL_MISSING", "REAL_SUPERVISOR_DENOMINATOR_AND_RECOVERY_WINDOWS_UNOBSERVED"],
  "ROOT-OTR-015": ["DEPLOYED_CANONICAL_INCIDENT_PARITY_AND_DEDUPE_RECONCILIATION_MISSING", "FINAL_SHA_COMMAND_CENTER_COVERAGE_RECEIPT_MISSING"],
  "ROOT-OTR-016": ["PAID_ADAPTER_SCOPE_AND_IMMUTABLE_ADJUSTMENT_INVENTORY_INCOMPLETE", "DEPLOYED_RESERVATION_RECONCILIATION_CONTENTION_EVIDENCE_MISSING"],
  "ROOT-OTR-017": ["FULL_SERVICE_EVALUATOR_EXECUTION_RECEIPT_AND_MATURITY_WIRING_INCOMPLETE", "PRODUCTION_ELIGIBILITY_AND_NEGATIVE_LINEAGE_EVIDENCE_MISSING"],
  "ROOT-OTR-018": ["LEARNING_ELIGIBILITY_DECISION_WRITER_AND_DATASET_GATE_NOT_WIRED", "CLEARED_DATASET_LINEAGE_EVIDENCE_MISSING"],
  "ROOT-OTR-019": ["LOCKFILE_AND_RELEASE_MANIFEST_HASHES_MISSING_FROM_RUNTIME_IDENTITY", "DEPLOYED_RUNTIME_IDENTITY_AND_SLO_WINDOW_EVIDENCE_MISSING"],
  "ROOT-OTR-020": ["DEPLOYED_WORKFORCE_CATALOG_AND_AGENTRUN_ZERO_WRITER_PARITY_MISSING", "STALE_LEGACY_CALLER_QUARANTINE_RUNTIME_BEHAVIOR_UNOBSERVED"],
};
const p0Refs = {
  "ROOT-OTR-001": ["base44/entities/EmergencyControl.jsonc", "base44/shared/operationalControl.ts", "config/remediation/material-boundary-registry.v1.json", "base44/functions/dispatchWebhook/entry.ts"],
  "ROOT-OTR-002": ["base44/entities/EmergencyControl.jsonc", "base44/shared/operationalControl.ts", "base44/shared/commercialModelRouter.ts", "base44/functions/startPaymentsMigration/entry.ts", "base44/functions/updatePaymentsMigrationTask/entry.ts", "base44/functions/providerNegotiationAgent/entry.ts", "base44/functions/collectiveNegotiationAgent/entry.ts", "base44/functions/providerMonetizationAgent/entry.ts", "src/docs/EMERGENCY_EPOCH_BOUNDARY.md"],
  "ROOT-OTR-003": ["base44/shared/operationalControl.ts", "base44/functions/emergencyControlAdmin/entry.ts", "base44/entities/EmergencyControl.jsonc", "base44/entities/AutonomyIncident.jsonc", "src/docs/EMERGENCY_EPOCH_BOUNDARY.md"],
  "ROOT-OTR-004": ["base44/entities/SchedulerRun.jsonc", "base44/shared/schedulerRun.ts", "base44/shared/materialEffectContract.ts"],
  "ROOT-OTR-005": ["base44/entities/SchedulerRun.jsonc", "base44/shared/schedulerRun.ts", "config/scheduler-inventory.json"],
  "ROOT-OTR-006": ["base44/entities/SchedulerRun.jsonc", "base44/shared/schedulerRun.ts", "base44/shared/materialEffectContract.ts"],
  "ROOT-OTR-007": ["base44/functions/commercialSendMessage/entry.ts", "base44/shared/commercialSendSafety.ts", "base44/shared/incidentAlerting.ts", "base44/shared/outboundProvider.ts", "base44/entities/CostBudgetControl.jsonc"],
  "ROOT-OTR-008": ["base44/functions/dispatchWebhook/entry.ts", "base44/functions/processWebhookDeadLetters/entry.ts", "base44/shared/webhookDeadLetterClaim.ts", "base44/entities/WebhookDeadLetter.jsonc"],
  "ROOT-OTR-009": ["base44/entities/Approval.jsonc", "base44/entities/FounderCommandAudit.jsonc", "base44/shared/approvalAuthority.ts", "base44/functions/founderOSCommand/entry.ts", "config/remediation/material-transition-saga-inventory.v1.json"],
  "ROOT-OTR-010": ["base44/entities/Approval.jsonc", "base44/entities/AgentTask.jsonc", "base44/entities/FounderCommandAudit.jsonc", "base44/shared/approvalResolutionSaga.ts", "base44/shared/externalApprovalExecution.ts", "config/remediation/material-transition-saga-inventory.v1.json"],
  "ROOT-OTR-011": ["base44/shared/recoverAcceptance.ts", "base44/shared/recoverEconomicMandate.ts", "base44/shared/recoverReportAuthority.ts", "base44/shared/economicExecution.ts", "base44/functions/createEligibleRecoverInvoices/entry.ts", "base44/functions/reconcileRecoverBilling/entry.ts", "base44/functions/onInvoiceStatusEvent/entry.ts", "base44/entities/Invoice.jsonc", "base44/entities/MonthlySavingsReport.jsonc", "base44/entities/PaymentEvent.jsonc", "base44/shared/paymentsMigrationSaga.ts", "base44/shared/developerMigrationLifecycle.ts", "config/remediation/material-transition-saga-inventory.v1.json"],
  "ROOT-OTR-012": ["base44/shared/effectAuthority.ts", "config/remediation/effect-authority-registry.v1.json", "config/remediation/authority-trace-operational-inventory.v1.json", "base44/functions/commercialSendMessage/entry.ts", "base44/functions/startPaymentsMigration/entry.ts"],
  "ROOT-OTR-013": ["base44/entities/AgentTask.jsonc", "base44/shared/agentTaskEnvelope.ts", "config/agenttask-creator-inventory.json", "config/remediation/authority-trace-operational-inventory.v1.json"],
  "ROOT-OTR-014": ["base44/functions/autonomousOperationsSupervisor/entry.ts", "base44/functions/eclProductionHealth/entry.ts", "base44/functions/operatingHealthWorker/entry.ts", "base44/functions/productionReadinessWorker/entry.ts", "base44/shared/supervisorObservation.ts", "base44/shared/canonicalIncident.ts", "config/operational-plane-inventory.v1.json"],
  "ROOT-OTR-015": ["base44/entities/AutonomyIncident.jsonc", "base44/entities/OperationalIncident.jsonc", "base44/entities/IncidentAlertDelivery.jsonc", "base44/shared/canonicalIncident.ts", "base44/shared/incidentAlerting.ts", "base44/functions/getAdminOperationsCockpit/entry.ts", "config/operational-plane-inventory.v1.json"],
  "ROOT-OTR-016": ["base44/entities/CostBudgetControl.jsonc", "base44/entities/CostUsageEvent.jsonc", "base44/shared/costGovernance.ts", "base44/shared/apiUsageBilling.ts", "base44/shared/commercialModelRouter.ts"],
  "ROOT-OTR-017": ["base44/shared/intelligenceFoundationContracts.ts", "base44/shared/intelligenceLearningLineage.ts", "base44/functions/outcomeLearningWorker/entry.ts", "base44/functions/intelligenceAdmin/entry.ts"],
  "ROOT-OTR-018": ["config/intelligence/learning-eligibility-policy.v1.json", "base44/shared/intelligenceFoundationContracts.ts", "base44/shared/intelligenceLearningLineage.ts"],
  "ROOT-OTR-019": ["base44/entities/RuntimeGateEvidence.jsonc", "base44/entities/ServiceLevelSnapshot.jsonc", "base44/shared/runtimeEvidence.ts", "base44/shared/serviceLevelRuntime.ts", "base44/shared/productionReadiness.ts", "base44/functions/productionReadinessWorker/entry.ts"],
  "ROOT-OTR-020": ["base44/entities/AgentTask.jsonc", "base44/entities/AgentRun.jsonc", "src/lib/agentRegistry.js", "src/docs/CAMBRA_AGENT_OPERATING_CATALOG.md", "base44/functions/autonomousOperationsSupervisor/entry.ts", "base44/functions/systemHealthAgent/entry.ts", "base44/functions/operatingHealthWorker/entry.ts", "config/agent-workforce-catalog.v1.json", "config/operational-plane-inventory.v1.json"],
};

const p0LocalTestFiles = [
  "src/lib/singletonAuthority.test.js",
  "src/lib/criticalSharedFailClosed.test.js",
  "src/lib/founderControlV2.test.js",
  "src/lib/emergencyEpochBoundary.test.js",
  "src/lib/emergencyMaterialBoundaries.test.js",
  "src/lib/schedulerLeaseFencing.test.js",
  "src/lib/materialEffectContract.test.js",
  "src/lib/webhookDeadLetterClaim.test.js",
  "src/lib/webhookEgressSafety.test.js",
  "src/lib/commercialSendSafety.test.js",
  "src/lib/commercialEmailProviderSafety.test.js",
  "src/lib/approvalAuthoritySaga.test.js",
  "src/lib/externalApprovalExecution.test.js",
  "src/lib/founderApprovalRegistry.test.js",
  "src/lib/recoverFinancialHardening.test.js",
  "src/lib/recoverBillingSaga.test.js",
  "src/lib/recoverBillingReconcilerSelection.test.js",
  "src/lib/financialEntityServiceRoleRls.test.js",
  "src/lib/developerMigrationLifecycle.test.js",
  "src/lib/paymentsMigrationSaga.test.js",
  "src/lib/paymentsMigrationP9.test.js",
  "src/lib/remediationR4Artifacts.test.js",
  "src/lib/agentTaskEnvelope.test.js",
  "src/lib/autonomousSupervisorFailClosed.test.js",
  "src/lib/incidentAlerting.test.js",
  "src/lib/apiUsageBillingConcurrency.test.js",
  "src/lib/p4CostGovernance.test.js",
  "src/lib/intelligenceLearningLineage.test.js",
  "src/lib/intelligenceFoundationContracts.test.js",
  "src/lib/runtimeIdentitySloEvidence.test.js",
  "src/lib/agentTaskCanonicalWork.test.js",
  "src/lib/effectAuthority.test.js",
  "src/lib/operationalPlaneReconciliation.test.js",
  "src/lib/remediationR5Artifacts.test.js",
  "src/lib/preEclFreeze.test.js",
  "src/lib/eclP1Gate.test.js",
];
const p0LocalTestCommand = `node_modules/.bin/vitest run ${p0LocalTestFiles.join(" ")}`;
const p0TestRefs = {
  "ROOT-OTR-001": ["src/lib/singletonAuthority.test.js", "src/lib/criticalSharedFailClosed.test.js", "src/lib/founderControlV2.test.js", "src/lib/emergencyEpochBoundary.test.js", "src/lib/emergencyMaterialBoundaries.test.js"],
  "ROOT-OTR-002": ["src/lib/singletonAuthority.test.js", "src/lib/emergencyEpochBoundary.test.js", "src/lib/emergencyMaterialBoundaries.test.js"],
  "ROOT-OTR-003": ["src/lib/singletonAuthority.test.js", "src/lib/emergencyEpochBoundary.test.js", "src/lib/emergencyMaterialBoundaries.test.js"],
  "ROOT-OTR-004": ["src/lib/schedulerLeaseFencing.test.js", "src/lib/materialEffectContract.test.js"],
  "ROOT-OTR-005": ["src/lib/schedulerLeaseFencing.test.js", "src/lib/materialEffectContract.test.js"],
  "ROOT-OTR-006": ["src/lib/schedulerLeaseFencing.test.js", "src/lib/materialEffectContract.test.js"],
  "ROOT-OTR-007": ["src/lib/commercialSendSafety.test.js", "src/lib/commercialEmailProviderSafety.test.js", "src/lib/incidentAlerting.test.js"],
  "ROOT-OTR-008": ["src/lib/webhookDeadLetterClaim.test.js", "src/lib/webhookEgressSafety.test.js", "src/lib/materialEffectContract.test.js"],
  "ROOT-OTR-009": ["src/lib/approvalAuthoritySaga.test.js", "src/lib/externalApprovalExecution.test.js", "src/lib/founderApprovalRegistry.test.js", "src/lib/remediationR4Artifacts.test.js"],
  "ROOT-OTR-010": ["src/lib/externalApprovalExecution.test.js", "src/lib/approvalAuthoritySaga.test.js", "src/lib/founderApprovalRegistry.test.js", "src/lib/remediationR4Artifacts.test.js"],
  "ROOT-OTR-011": ["src/lib/recoverFinancialHardening.test.js", "src/lib/recoverBillingSaga.test.js", "src/lib/recoverBillingReconcilerSelection.test.js", "src/lib/financialEntityServiceRoleRls.test.js", "src/lib/developerMigrationLifecycle.test.js", "src/lib/paymentsMigrationSaga.test.js", "src/lib/paymentsMigrationP9.test.js", "src/lib/remediationR4Artifacts.test.js"],
  "ROOT-OTR-012": ["src/lib/effectAuthority.test.js", "src/lib/remediationR5Artifacts.test.js"],
  "ROOT-OTR-013": ["src/lib/agentTaskEnvelope.test.js", "src/lib/remediationR5Artifacts.test.js"],
  "ROOT-OTR-014": ["src/lib/autonomousSupervisorFailClosed.test.js", "src/lib/operationalPlaneReconciliation.test.js", "src/lib/remediationR5Artifacts.test.js"],
  "ROOT-OTR-015": ["src/lib/autonomousSupervisorFailClosed.test.js", "src/lib/operationalPlaneReconciliation.test.js", "src/lib/incidentAlerting.test.js", "src/lib/remediationR5Artifacts.test.js"],
  "ROOT-OTR-016": ["src/lib/p4CostGovernance.test.js", "src/lib/apiUsageBillingConcurrency.test.js", "src/lib/singletonAuthority.test.js", "src/lib/commercialSendSafety.test.js"],
  "ROOT-OTR-017": ["src/lib/intelligenceLearningLineage.test.js", "src/lib/intelligenceFoundationContracts.test.js"],
  "ROOT-OTR-018": ["src/lib/intelligenceLearningLineage.test.js", "src/lib/intelligenceFoundationContracts.test.js"],
  "ROOT-OTR-019": ["src/lib/runtimeIdentitySloEvidence.test.js"],
  "ROOT-OTR-020": ["src/lib/agentTaskCanonicalWork.test.js", "src/lib/autonomousSupervisorFailClosed.test.js", "src/lib/operationalPlaneReconciliation.test.js", "src/lib/remediationR5Artifacts.test.js"],
};
const p0RepositoryRemediatedRuntimePending = new Set([
  "ROOT-OTR-004",
  "ROOT-OTR-006",
  "ROOT-OTR-007",
  "ROOT-OTR-008",
  "ROOT-OTR-009",
  "ROOT-OTR-010",
  "ROOT-OTR-014",
  "ROOT-OTR-015",
  "ROOT-OTR-020",
]);
const p0LocalRunId = "R5-LOCAL-VITEST-2026-08-14";

const p0Audit = {
  "ROOT-OTR-001": {
    implementation_existing: "EmergencyControl singleton/default handling is fail-closed; the versioned material-boundary inventory identifies controlled and remaining partial routes.",
    material_effect_covered: "Adapted communication, negotiation, migration, billing and dispatch boundaries deny provider or economic commits when the control read fails.",
    local_partial_criterion_verified: "Control-read, inherited-epoch and adapted material-boundary zero-effect failure injections passed locally.",
    local_gap: "Some inventory rows remain PARTIAL and have not each received route-level failure injection with asserted provider/economic zero effects.",
    runtime_gap: "No deployed failure-injection trace set, effect-ledger zero-effect query or runtime source-tree attestation exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-002": {
    implementation_existing: "Pre/post emergency epoch guards exist on adapted external effects, including Payments migration, webhook dispatch and negotiated paid-AI calls.",
    material_effect_covered: "Adapted boundaries reject a stale epoch before provider execution and quarantine post-response epoch ambiguity rather than retrying blindly.",
    local_partial_criterion_verified: "Stale-epoch, inherited-epoch and adapted provider-boundary race cases passed locally.",
    local_gap: "The full paid/external adapter inventory remains incomplete; generic paid AI and other R6 adapters are not universally epoch-bound.",
    runtime_gap: "No concurrent deployed stale-epoch drill with provider and economic receipts exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-003": {
    implementation_existing: "EmergencyControl durably stores per-transport evidence with the exact five-state contract and CAS/readback; Instantly remote receipts remain separate from local blocking.",
    material_effect_covered: "Emergency stop blocks each configured local transport, persists Outlook/Resend as LOCALLY_BLOCKED and permits REMOTELY_VERIFIED_PAUSED only with a provider receipt.",
    local_partial_criterion_verified: "Transport normalization, persistence/readback, incomplete-result and epoch-boundary cases passed locally.",
    local_gap: "Outlook and Resend expose no provider-wide pause receipt in this contract, so configured instances deliberately keep CONTAINMENT_INCOMPLETE.",
    runtime_gap: "No authenticated Microsoft/Resend/Instantly containment drill and durable provider receipt bundle exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-004": {
    implementation_existing: "SchedulerRun CONTROL and ATTEMPT rows use coherent CAS counters, owner/fence tokens, explicit effect-start and durable operation/effect history.",
    material_effect_covered: "Concurrent starts for one worker slot collapse to one owner; stale owners cannot start or settle, and post-effect failure quarantines CONTROL rather than releasing it.",
    local_partial_criterion_verified: "CAS contention, contradictory counters, effect-start fencing, terminal ambiguity and durable replay tests passed locally.",
    local_gap: "No remaining repository gap is known for the central OTR-004 scheduler-slot criterion; provider-specific downstream guarantees remain tracked by their own boundaries.",
    runtime_gap: "No deployed Base44 contention run with authoritative SchedulerRun rows and effect receipts exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-005": {
    implementation_existing: "All 67 active schedules are slot-guarded with a lease/fence; the two inactive schedules are explicitly classified rather than counted as production workers.",
    material_effect_covered: "Takeover is allowed only for an expired, linked, pre-effect ATTEMPT; missing/invalid leases, missing linkage and failed supersession persistence block or quarantine.",
    local_partial_criterion_verified: "Lease expiry, periodic heartbeat, takeover, stale-fence and superseded-write fault cases passed locally.",
    local_gap: "Periodic heartbeat is repository-proven for 57/67 active workers and not proven for 10/67; hard deadline and timeout remain UNKNOWN for all 67.",
    runtime_gap: "No deployed worker-kill, lease-expiry, takeover and single-effect drill exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-006": {
    implementation_existing: "Scheduled, manual and internal triggers normalize an explicit logical operation into one durable operation/effect identity and one SchedulerRun authority.",
    material_effect_covered: "Three concurrent trigger kinds produce one owner; durable ATTEMPT history prevents A→B→A replay and enforces one-to-one operation/effect binding.",
    local_partial_criterion_verified: "Three-way trigger, durable replay, cross-binding, active-owner and post-effect ambiguity tests passed locally.",
    local_gap: "No remaining repository gap is known for the registered scheduler trigger paths; newly introduced direct worker callers remain guarded by the generated inventory check.",
    runtime_gap: "No deployed three-way scheduled/manual/internal concurrency drill exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-007": {
    implementation_existing: "Commercial sends share the existing durable send-slot authority; Resend binds a stable Idempotency-Key, Outlook persists an ImmutableId draft before /send, Instantly is conservative at-most-once, and Core email uses stable claims.",
    material_effect_covered: "Every adapted sender requires a local message plus typed provider reference before COMMITTED; 202/ACCEPTED is never delivery, and any post-transport ambiguity blocks replay.",
    local_partial_criterion_verified: "Provider receipt, Outlook draft-persistence crash, Resend key, Instantly ambiguity, Core email replay and aggregated alert concurrency tests passed locally.",
    local_gap: "No remaining repository gap is known for the registered sender boundaries; provider limitations are represented as ACCEPTED/REVIEW_REQUIRED rather than simulated exactly-once.",
    runtime_gap: "No three-provider crash-window drill proves one external delivery and one durable receipt.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-008": {
    implementation_existing: "Initial dispatch and DLQ replay use the existing WebhookDeadLetter CAS authority, stable operation/effect identity, tri-state lease validation and an explicit EFFECT_STARTED fence.",
    material_effect_covered: "Two claimants cannot both deliver; provider success plus receipt failure becomes REVIEW_REQUIRED, and manual replay reuses the same durable identity without blind resend.",
    local_partial_criterion_verified: "Concurrent claimant, token, lease, post-effect terminal, provider-success/receipt-crash, dispatch-intent and manual replay tests passed locally.",
    local_gap: "No remaining repository gap is known for the registered webhook claim/replay criterion; arbitrary receivers still provide no universal reconciliation guarantee.",
    runtime_gap: "No deployed concurrent replay trace plus provider receipt proves exactly one delivery.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-009": {
    implementation_existing: "A canonical approval-confirmation envelope binds payload, policy key/version, authority and intelligence IDs/hashes, economic/legal terms, market scope, EmergencyControl ID/revision, actor, tenant, subject, expiry and a one-use nonce hash.",
    material_effect_covered: "Coherent CAS plus exact readback consumes one nonce; changed, expired, replayed, duplicate or ambiguous confirmation authority is rejected before a material effect.",
    local_partial_criterion_verified: "Independent dimension tamper, nonce replay, two-claimant concurrency, expiry and ambiguous duplicate-read fault cases passed locally.",
    local_gap: "No remaining repository gap is known for the registered approval-confirmation criterion; legacy live rows have not been audited or backfilled.",
    runtime_gap: "No final-SHA deployed dual-confirmation race or exhaustive authority-dependency/tamper receipt set exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-010": {
    implementation_existing: "Approval persists the decision axis while AgentTask persists claim, effect, execution status and immutable receipt for all seven registered external executors; all 16 creators and 20 action types have an explicit resolution mode.",
    material_effect_covered: "APPROVED never implies EXECUTED; an external effect requires a fenced AgentTask and EXECUTED requires a receipt, while failures and malformed/post-effect states remain FAILED or REVIEW_REQUIRED without changing the decision.",
    local_partial_criterion_verified: "Seven-executor registry, legacy derivation, concurrent claim, expiry, missing lease, provider failure and missing-receipt cases passed locally.",
    local_gap: "No remaining repository gap is known for the registered decision/execution criterion; legacy live Approval/AgentTask rows have not been reconciled or backfilled.",
    runtime_gap: "No final-SHA deployed seven-executor failure/replay/provider-reconciliation receipt bundle exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-011": {
    implementation_existing: "A generated seven-row transition inventory covers approval, Recover acceptance/contract, billing issuance/collection, Payments migration/go-live and Developer GitHub migration using their existing domain authorities. Recover report creation, approval and every Stripe POST revalidate a cap-two activation/month singleton; Invoice, MonthlySavingsReport and PaymentEvent writes are service-role-only.",
    material_effect_covered: "Billing provider steps use account binding, response-bound descriptors, fenced hash-chained receipts, monotonic Invoice/report projection and a fair bounded reconciler; the legacy unsigned Invoice event route is quarantined. Developer/go-live effects retain conservative reconciliation and Recover acceptance retains domain CAS/readbacks.",
    local_partial_criterion_verified: "Billing request/crash convergence, activation-month split-brain containment, reconciler fairness, financial RLS, alternative-route guards, approval/external execution, Recover acceptance, Payments go-live and Developer apply/cutover/rollback fault cases passed locally.",
    local_gap: "The datastore has no proven unique activation/month constraint, so duplicates fail closed and require reconciliation; legacy non-Recover manual payment/reconcile/PDF paths are not one universal saga. Recover supersession/contract PDF-email and Payments plan/non-go-live steps also lack universal immutable receipts, and no canonical AUTHORIZE_MIGRATION producer supplies ADVANCED_E_SIGNATURE authority.",
    runtime_gap: "No deployed Base44 duplicate-report contention/reconciliation, three-domain crash-between-step, Stripe/GitHub receipt and final-outcome convergence drill bundle exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-012": {
    implementation_existing: "A source-derived registry names ten exact effect classes over all 42 material boundaries and a shared fail-closed effect-authority facade is wired to five representative boundaries.",
    material_effect_covered: "The five wired boundaries bind actor, tenant, subject, market scope, policy, Emergency capability/epoch and domain authority immediately before their covered effect.",
    local_partial_criterion_verified: "Unknown classes, malformed market scope, capability mismatch, missing authority and last-boundary revalidation denial cases passed with zero covered provider/economic effects.",
    local_gap: "Thirty-seven of 42 material boundaries remain SOURCE_OBSERVED_ONLY and do not yet call the common facade, so the universal denial criterion is incomplete.",
    runtime_gap: "No deployed cross-effect denial run proves zero provider/economic effects for all ten classes and all registered boundaries.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-013": {
    implementation_existing: "AgentTask has a versioned envelope for trace, parent run, step, tenant/subject, policy/authority/intelligence, cost/effect/receipt and terminal ambiguity; the generator inventories every creator and material route.",
    material_effect_covered: "Adapted creator and settlement paths reject contradictory terminal/effect state, tenant/provenance mutation, lost fences and incomplete receipt lineage.",
    local_partial_criterion_verified: "Envelope construction, contradictory terminal, immutable provenance, exact CAS/readback and generated drift cases passed locally.",
    local_gap: "All 46 material creator files remain incomplete for end-to-end effect/cost/receipt lineage and 111 material route files remain unresolved; root/terminal-only adaptation is not counted as complete.",
    runtime_gap: "No deployed trace-completeness report proves every material AgentTask/Event/effect/cost/receipt relationship on final SHA.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-014": {
    implementation_existing: "A source-derived five-surface inventory distinguishes the sole general supervisor, two non-authoritative projections, one authoritative specialized ECL sweep and one quarantined compatibility endpoint.",
    material_effect_covered: "Critical collections use explicit COMPLETE/EMPTY/OBSERVED/UNKNOWN/ERROR semantics; the ECL sweep uses cap-plus-one reads and cannot declare healthy or auto-resolve on failed, malformed, truncated or duplicate authority.",
    local_partial_criterion_verified: "Dependency outage, malformed result, truncation, empty baseline, recovery barrier and ECL absence-decision failure injections passed across the declared surfaces.",
    local_gap: "No repository P0/P1 gap is known in the inventoried health-plane fail-closed criterion; denominator sufficiency and newly introduced surfaces remain generator-enforced but runtime-unobserved.",
    runtime_gap: "No deployed all-surface dependency-outage, denominator and recovery containment drill exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-015": {
    implementation_existing: "AutonomyIncident is the canonical incident authority, OperationalIncident is the two-writer ECL compatibility ledger and IncidentAlertDelivery is transport-only; all three are service-role-only and no fourth entity exists.",
    material_effect_covered: "The versioned adapter merges stable dedupe keys once, preserves both source links, exposes every observed active row without slicing, and marks counts exact only when both source reads are complete.",
    local_partial_criterion_verified: "Cross-ledger dedupe, active/resolved coherence, source coverage/truncation, exact writer allowlist, RLS and generated-plane drift cases passed locally.",
    local_gap: "No repository P0/P1 gap is known for the canonical read projection; historical ECL rows remain compatibility evidence rather than being rewritten.",
    runtime_gap: "No deployed parity/dedupe reconciliation proves one final-SHA active timeline and equivalent relationships across both stores.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-016": {
    implementation_existing: "Cost governance uses CAS reservation journals, usage events and reconciliation helpers on adapted paths.",
    material_effect_covered: "Covered concurrent reservations reject duplicate or over-budget paid execution before commit.",
    local_partial_criterion_verified: "Cost CAS, billing concurrency and commercial reservation failure cases passed locally.",
    local_gap: "Run, tenant, workflow and model scopes, immutable adjustments and the full paid-adapter inventory are incomplete; raw paid fetch paths remain.",
    runtime_gap: "No deployed reservation/actual reconciliation and contention evidence exists across all paid adapters.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-017": {
    implementation_existing: "Exact claim/source lineage gates and quarantined ineligible outcomes exist in intelligence learning helpers.",
    material_effect_covered: "Covered weak, missing or immature lineage is denied before eligibility or promotion.",
    local_partial_criterion_verified: "Positive and negative lineage, maturity and contract cases passed locally.",
    local_gap: "The full service evaluator, execution receipt and independent maturity API are not wired through all production eligibility paths.",
    runtime_gap: "No production-eligible rows or deployed negative-lineage/maturity receipt bundle exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-018": {
    implementation_existing: "Learning policy contracts default ambiguous writers to false or quarantined and expose an eligibility-decision append helper.",
    material_effect_covered: "Covered unverified or ambiguous candidates cannot become learning-eligible in local contract tests.",
    local_partial_criterion_verified: "Learning-policy denial and lineage quarantine cases passed locally.",
    local_gap: "The eligibility-decision append helper has no production callers and no dataset-construction gate consumes only cleared decisions.",
    runtime_gap: "No cleared dataset lineage or deployed proof that ineligible research never enters learning exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-019": {
    implementation_existing: "RuntimeGateEvidence, ServiceLevelSnapshot and fail-closed runtime identity/SLO evaluators exist.",
    material_effect_covered: "Covered missing identity or SLO inputs prevent readiness from being reported as verified.",
    local_partial_criterion_verified: "Runtime identity and SLO missing/invalid input cases passed locally.",
    local_gap: "Runtime identity omits lockfile_hash and release_manifest_hash, and the five canonical SLO denominator/window contracts are incomplete.",
    runtime_gap: "No deployed environment identity receipt or authoritative SLO sample windows exist.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
  "ROOT-OTR-020": {
    implementation_existing: "AgentTask is the sole canonical work primitive, AgentRun is service-only legacy history with zero repository writers, systemHealthAgent is HTTP 410/write-free, and the workforce/orchestrator catalog is generated from source plus current package identity.",
    material_effect_covered: "The generated operational inventory enforces exactly one active general supervisor while preserving two explicitly non-authoritative projections and one specialized ECL sweep; catalog or plane drift fails the local gate.",
    local_partial_criterion_verified: "AgentRun writer scans, quarantine denial, exact workforce/orchestrator counts, release-identity binding, source-derived plane declarations and tampered generated-artifact cases passed locally.",
    local_gap: "No repository P0/P1 gap is known for the canonical work/general-supervisor/catalog criterion; compatibility callers and newly added source surfaces remain runtime concerns.",
    runtime_gap: "No deployed AgentTask/AgentRun parity, stale-caller quarantine and workforce/health catalog drift report exists.",
    verification_level: "LOCAL_FAILURE_INJECTION",
  },
};

const parseP0Ledger = () => {
  const source = sources.get("ORCH");
  const rows = [];
  source.content.split("\n").forEach((line, index) => {
    const cells = splitMarkdownRow(line);
    if (cells.length !== 5 || !/^`?ROOT-OTR-\d{3}`?$/u.test(cells[0])) return;
    const id = cells[0].replaceAll("`", "");
    const audit = p0Audit[id];
    if (!audit) throw new Error(`missing P0 audit assessment for ${id}`);
    rows.push({
      otr_id: id,
      source_spec_hash: source.sha256,
      source_anchor: `line:${index + 1}`,
      blocking_condition: cells[1],
      required_remediation: cells[2],
      binary_closure_criterion: cells[3],
      required_closure_evidence: cells[4],
      implementation_status: p0RepositoryRemediatedRuntimePending.has(id)
        ? "REPO_REMEDIATED_RUNTIME_PENDING"
        : "PARTIAL",
      binary_closure_status: "NOT_MET",
      test_status: "PASSED_LOCAL",
      verification_level: audit.verification_level,
      local_test_scope: p0RepositoryRemediatedRuntimePending.has(id)
        ? "REPOSITORY_CRITERION_COMPLETE_RUNTIME_PENDING"
        : "PARTIAL_CRITERION_ONLY",
      local_test_run_ref: p0LocalRunId,
      local_test_refs: p0TestRefs[id],
      assessment_classification: p0RepositoryRemediatedRuntimePending.has(id)
        ? ["EXISTING", "RUNTIME_ONLY"]
        : ["EXISTING", "GAP", "RUNTIME_ONLY"],
      implementation_existing: audit.implementation_existing,
      material_effect_covered: audit.material_effect_covered,
      local_partial_criterion_verified: audit.local_partial_criterion_verified,
      gap_local: audit.local_gap,
      gap_runtime: audit.runtime_gap,
      source_evidence_refs: p0Refs[id],
      runtime_evidence_refs: [],
      blockers: p0Assessments[id],
      owner: "CAMBRA Intelligence Orchestration",
      seal_impact: ["GOVERNED_EXECUTION_READY", "FULL_CAMBRA_INTELLIGENCE_LOOP_SANDBOX_VERIFIED", "FULL_CAMBRA_INTELLIGENCE_LOOP_REAL_WORLD_VERIFIED", "CAMBRA_COMPOUND_INTELLIGENCE_SYSTEM_READY"],
      assessed_at: generatedAt,
      assessment_scope: p0RepositoryRemediatedRuntimePending.has(id)
        ? "Repository source plus mapped local fault/concurrency tests prove this repository criterion. Binary closure still requires final-SHA deployed drills, receipts or runtime evidence."
        : "Repository source plus mapped local tests only. PASSED_LOCAL is limited to PARTIAL_CRITERION_ONLY and is not universal OTR closure or runtime evidence.",
    });
  });
  if (rows.length !== 20) throw new Error(`expected 20 P0 OTR rows, found ${rows.length}`);
  return rows;
};

const p0Ledger = {
  schema_version: "orchestration-p0-remediation-ledger.v2",
  generated_at: generatedAt,
  source_spec_id: "ORCH",
  source_spec_hash: sources.get("ORCH").sha256,
  status_axes: {
    implementation_status: ["NOT_STARTED", "PARTIAL", "IN_PROGRESS", "REPO_REMEDIATED_RUNTIME_PENDING"],
    binary_closure_status: ["NOT_MET", "CLOSED"],
    test_status: ["NOT_RUN", "PASSED_LOCAL", "FAILED_LOCAL"],
    verification_level: ["SOURCE_OBSERVED", "LOCAL_FAILURE_INJECTION", "RUNTIME_VERIFIED"],
  },
  closure_rule: {
    expression: "binary_closure_status == CLOSED AND test_status == PASSED_LOCAL AND verification_level == RUNTIME_VERIFIED",
    all_conditions_required: true,
    partial_local_tests_can_close: false,
    repo_remediated_runtime_pending_definition: "REPO_REMEDIATED_RUNTIME_PENDING: criterio probado con inyección de fallo/concurrencia en repo; el cierre binario requiere drill, receipts o evidencia de runtime desplegado.",
    description: "Binary closure is counted only when the row is CLOSED, its local test status is PASSED_LOCAL and runtime verification is present. REPO_REMEDIATED_RUNTIME_PENDING means the repository criterion passed fault/concurrency injection, but final-SHA deployed drills, receipts or runtime evidence are still mandatory; local evidence never closes an OTR by itself.",
  },
  local_test_runs: [{
    run_id: p0LocalRunId,
    executed_at: "2026-08-14T11:18:49Z",
    working_directory: ".",
    command: p0LocalTestCommand,
    runner: "vitest@4.1.10",
    status: "PASSED_LOCAL",
    local_test_scope: "MIXED_REPOSITORY_AND_PARTIAL_CRITERIA",
    test_files: p0LocalTestFiles,
    observed_result: {
      test_files_passed: 36,
      test_files_total: 36,
      tests_passed: 505,
      tests_total: 505,
    },
    limitation: "These mapped local tests prove nine repository criteria and partial slices of eleven others. They are not the normative ORCH acceptance catalog, deployed Base44 evidence, provider receipts or binary closure evidence.",
  }],
  counts: {
    total: 20,
    implementation_partial: 11,
    implementation_repo_remediated_runtime_pending: 9,
    closed: 0,
    not_met: 20,
    test_not_run: 0,
    test_passed_local: 20,
    test_failed_local: 0,
    source_observed: 0,
    local_failure_injection: 20,
    runtime_verified: 0,
    local_partial_criterion_only: 11,
    local_repository_criterion_complete_runtime_pending: 9,
  },
  items: parseP0Ledger(),
};

const canonicalAliases = {
  schema_version: "intelligence-canonical-alias-map.v2",
  generated_at: generatedAt,
  resolution_rule: "Aliases are versioned compatibility projections only. They never create a second authority or broaden a seal.",
  physical_document_aliases: legacySources,
  logical_contract_aliases: [
    ["StatisticalProblem", "StatisticalProblemDefinition", "Problem/Estimand Registry record"],
    ["FeatureContract", "FeatureDefinition", "Feature definition"],
    ["LabelContract", "LabelDefinition", "Label definition"],
    ["PredictionEvent", "PredictionReceipt", "Model prediction receipt"],
    ["PolicyExposure", "ExposureReceipt", "Actual exposure receipt"],
    ["EvaluationReport", "EvaluationRun", "Evaluation execution plus report projection"],
    ["DriftAssessment", "DriftReport", "Drift evaluation artifact"],
    ["RetrainingProposal", "RetrainingDecision", "Linked proposal and decision lifecycle records"],
  ].map(([alias_a, alias_b, canonical_concept]) => ({ alias_a, alias_b, canonical_concept, status: "CANONICALIZED_LOGICALLY", creates_physical_resource: false })),
  compatibility_aliases: [
    { legacy: "CandidateExperienceEvent", canonical: "UniversalExperience:ALIF_PROFILE", status: "SUPERSEDED_PROFILE_ALIAS", auto_migrate: false },
    { legacy: "CPIC implementation_status=BLOCKED", canonical: "requirement_progress=BLOCKED", status: "STATUS_AXIS_PROJECTION", auto_migrate: false },
    { legacy: "WITHHELD", canonical: "NOT_SEALED", status: "SEAL_STATUS_SPELLING_NORMALIZATION", auto_migrate: true },
    { legacy: "GRANTED", canonical: "ISSUED", status: "SEAL_STATUS_SPELLING_NORMALIZATION", auto_migrate: true },
    { legacy: "MASTER_ORCHESTRATION_READY", canonical: "GOVERNED_EXECUTION_READY", status: "INTERNAL_GATE_ALIAS_NOT_A_NINTH_SEAL", auto_migrate: false },
    { legacy: "FULL_CAMBRA_INTELLIGENCE_LOOP_VERIFIED", canonical: null, status: "AMBIGUOUS_LEGACY_LABEL_DO_NOT_AUTO_RESOLVE", auto_migrate: false },
    { legacy: "ANALYZER_INTELLIGENCE_INTEGRATED", canonical: null, status: "DOMAIN_EVIDENCE_GATE_NOT_ROOT_SEAL", auto_migrate: false },
    { legacy: "NEGOTIATION_INTELLIGENCE_INTEGRATED", canonical: null, status: "DOMAIN_EVIDENCE_GATE_NOT_ROOT_SEAL", auto_migrate: false },
  ],
  test_alias_map_ref: "config/intelligence/acceptance-test-catalog.v2.json",
};

const scopePrecedence = {
  schema_version: "intelligence-scope-precedence.v2",
  generated_at: generatedAt,
  global_file_order_forbidden: true,
  rule: "Resolve by governed scope and canonical owner; an incompatible conflict remains blocked until an attributable decision exists.",
  precedence: [
    { rank: 1, scope: "LAW_RIGHTS_FINANCIAL_TRUTH", authority: "Applicable law, contracts, data rights and verified financial truth" },
    { rank: 2, scope: "PRIVACY_SECURITY_AUTHORITY_FAIL_CLOSED", authority: "Most restrictive applicable control" },
    { rank: 3, scope: "CURRENT_RUNTIME_FACT", authority: "Authenticated runtime evidence proves actuality, never normative conformance by itself" },
    { rank: 4, scope: "CURRENT_SOURCE_FACT", authority: "Exact inspected source/config/artifact identity" },
    { rank: 5, scope: "ROOT_COMPOSITION", authority: "ORCH composition, compatibility, ownership and compositional seals only" },
    { rank: 6, scope: "SHARED_INTELLIGENCE_CONTRACTS", authority: "CIV2" },
    { rank: 7, scope: "PROBABILITY_UNCERTAINTY_VOI_MATH", authority: "CPIC" },
    { rank: 8, scope: "DISCOVERY_RESEARCH_LEAD_FUNNEL_PROFILE", authority: "ALIF" },
  ],
  canonical_owners: [
    { concept: "Spec composition and compatibility", owner: "ORCH" },
    { concept: "Canonical identity and Universal Experience", owner: "CIV2" },
    { concept: "Evidence, claims, outcomes and learning eligibility", owner: "CIV2/P12" },
    { concept: "Probability, uncertainty and VOI math", owner: "CPIC" },
    { concept: "Source Registry, Router and adaptive lead domain profile", owner: "ALIF" },
    { concept: "Operational truth", owner: "Existing domain source" },
    { concept: "Cost", owner: "CostBudgetControl/CostUsageEvent" },
    { concept: "Authority and approval", owner: "Shared Authority/Approval plus stricter domain gates" },
    { concept: "P4 inference route", owner: "Existing rateIntelligenceQuery route" },
  ],
};

const compatibilityLedger = {
  schema_version: "intelligence-compatibility-ledger.v2",
  generated_at: generatedAt,
  composition_manifest_ref: "config/intelligence/composition-manifest.v2.json",
  supersessions: [
    ["FLAT_TEST_IDS", "Flat/local test IDs", "Composite globally unique test UID"],
    ["FLAT_LIFECYCLE_STATUS", "Flat lifecycle/status field", "Orthogonal status axes"],
    ["CANDIDATE_EXPERIENCE_BUS", "Adaptive Candidate Experience bus", "Universal Experience ALIF profile"],
    ["CPIC_SHARED_SYNONYMS", "CPIC synonyms for shared resources", "Versioned logical aliases to shared owners"],
    ["LINEAR_PHASE_LIST", "One linear phase list", "Dependency DAG and workstreams"],
    ["SANDBOX_EQUALS_READINESS", "Sandbox golden path as full readiness", "Sandbox proves contract/plumbing only"],
    ["BARE_CPIC_RESPONSE", "Illustrative bare CPIC response", "Canonical Probabilistic Estimate"],
    ["UNCOMPOSED_SEALS", "Integration seals without dependency manifest", "Appendix K composed seal framework"],
  ].map(([compatibility_id, superseded, canonical]) => ({
    compatibility_id,
    conflict_type: "EXPLICIT_ROOT_SUPERSESSION",
    decision_status: "RESOLVED",
    superseded,
    canonical,
    controlling_source: `ORCH@${sources.get("ORCH").sha256}::section-6.3`,
    approver_evidence_refs: [],
    migration_status: "NOT_STARTED",
    blocks_seals: true,
  })),
  open_conflicts: [
    { compatibility_id: "EVENT_IMMUTABLE_PAYLOAD_VS_MUTABLE_DELIVERY_FIELDS", decision_status: "OPEN", safe_default: "Keep semantic Event immutable and delivery state separate; do not create a second bus.", blocks_seals: true },
    { compatibility_id: "AGENTTASK_STEP_VS_ATTEMPT_OWNERSHIP", decision_status: "OPEN", safe_default: "Do not add a parallel run ledger or rewrite attempt history.", blocks_seals: true },
    { compatibility_id: "PRIVACY_SAFE_VS_ANONYMIZED_AGGREGATE", decision_status: "OPEN", safe_default: "Do not equate anonymous and pseudonymous/privacy-safe values.", blocks_seals: true },
    { compatibility_id: "ADAPTIVE_PHASE_ORDER_VS_SEAL_DAG", decision_status: "RESOLVED", safe_default: "Implementation may overlap; ADAPTIVE_LEAD_INTEGRATED remains blocked until CPIC_INTEGRATED is ISSUED.", blocks_seals: false },
    { compatibility_id: "STATIC_APPENDIX_TOPOLOGY_VS_CURRENT_REPO", decision_status: "RESOLVED", safe_default: "Treat 26/68/66 as historical snapshot; preserve currently observed 276 physical, 27 logical and do not roll back scheduler inventory.", blocks_seals: false },
  ],
};

const rootSealNames = [
  "SPEC_SET_RECONCILED",
  "INTELLIGENCE_FOUNDATION_INTEGRATED",
  "CPIC_INTEGRATED",
  "ADAPTIVE_LEAD_INTEGRATED",
  "GOVERNED_EXECUTION_READY",
  "FULL_CAMBRA_INTELLIGENCE_LOOP_SANDBOX_VERIFIED",
  "FULL_CAMBRA_INTELLIGENCE_LOOP_REAL_WORLD_VERIFIED",
  "CAMBRA_COMPOUND_INTELLIGENCE_SYSTEM_READY",
];
const dependencies = {
  SPEC_SET_RECONCILED: [],
  INTELLIGENCE_FOUNDATION_INTEGRATED: ["SPEC_SET_RECONCILED"],
  CPIC_INTEGRATED: ["INTELLIGENCE_FOUNDATION_INTEGRATED"],
  ADAPTIVE_LEAD_INTEGRATED: ["CPIC_INTEGRATED"],
  GOVERNED_EXECUTION_READY: ["INTELLIGENCE_FOUNDATION_INTEGRATED"],
  FULL_CAMBRA_INTELLIGENCE_LOOP_SANDBOX_VERIFIED: ["CPIC_INTEGRATED", "ADAPTIVE_LEAD_INTEGRATED", "GOVERNED_EXECUTION_READY"],
  FULL_CAMBRA_INTELLIGENCE_LOOP_REAL_WORLD_VERIFIED: ["FULL_CAMBRA_INTELLIGENCE_LOOP_SANDBOX_VERIFIED"],
  CAMBRA_COMPOUND_INTELLIGENCE_SYSTEM_READY: ["FULL_CAMBRA_INTELLIGENCE_LOOP_REAL_WORLD_VERIFIED"],
};
const rootSeals = {
  schema_version: "intelligence-root-compositional-seals.v2",
  generated_at: generatedAt,
  source: `ORCH@${sources.get("ORCH").sha256}::APPENDIX_K`,
  seal_status_enum: ["NOT_SEALED", "ISSUED", "SUSPENDED", "REVOKED", "EXPIRED"],
  exact_seal_count: 8,
  issuance_policy: "Names are not attestations. No seal is issued without signed, scope-compatible, fresh dependency and evidence manifests.",
  seals: rootSealNames.map((seal_type) => ({
    seal_type,
    status: "NOT_SEALED",
    dependency_seal_types: dependencies[seal_type],
    scope: null,
    attestation_id: null,
    manifest_sha256: null,
    evidence_bundle_sha256: null,
    issued_at: null,
    expires_at: null,
    runtime_evidence_refs: [],
    blockers: seal_type === "SPEC_SET_RECONCILED"
      ? ["UNSIGNED_COMPOSITION_ATTESTATION", "REQUIREMENT_AND_TEST_APPLICABILITY_MAPPING_INCOMPLETE", "INDEPENDENT_APPROVAL_EVIDENCE_MISSING"]
      : ["PREREQUISITE_SEAL_NOT_ISSUED", "CHILD_SEAL_AND_SCOPE_EVIDENCE_MISSING", "RUNTIME_OR_REAL_WORLD_EVIDENCE_MISSING"],
  })),
};

const artifactReceipts = [];
artifactReceipts.push(writeJson("requirement-ledger.v2.json", requirementLedger));
artifactReceipts.push(writeJson("acceptance-test-catalog.v2.json", acceptanceCatalog));
artifactReceipts.push(writeJson("orchestration-p0-remediation.v2.json", p0Ledger));
artifactReceipts.push(writeJson("canonical-alias-map.v2.json", canonicalAliases));
artifactReceipts.push(writeJson("scope-precedence.v2.json", scopePrecedence));
artifactReceipts.push(writeJson("compatibility-ledger.v2.json", compatibilityLedger));
artifactReceipts.push(writeJson("root-seals.v2.json", rootSeals));

const activeV1ArtifactNames = new Set([
  "research-conflicts.v1.json",
  "research-knowledge.v1.json",
  "research-source-manifest.v1.json",
]);
const activeV1Artifacts = [...activeV1ArtifactNames].sort().map((name) => ({
  path: `config/intelligence/${name}`,
  lifecycle_status: "ACTIVE_RESEARCH_KNOWLEDGE_V1",
  read_compatibility: "SUPPORTED",
  write_target: true,
  authority: "CANDIDATE_ONLY_NON_EXECUTABLE",
}));
const legacyV1Artifacts = fs.readdirSync(configDir)
  .filter((name) => name.endsWith(".v1.json") && !activeV1ArtifactNames.has(name))
  .sort()
  .map((name) => ({
    path: `config/intelligence/${name}`,
    lifecycle_status: "SUPERSEDED_FOR_CANONICAL_V2_RECONCILIATION",
    read_compatibility: "SUPPORTED",
    write_target: false,
  }));

const compositionBasis = {
  composition_id: "CAMBRA_INTELLIGENCE_CANONICAL_COMPOSITION_V2_2026-08-13",
  root_version: sources.get("ORCH").version,
  sources: sourceDefinitions.map(({ spec_id, version, physical_locator, sha256, line_count }) => ({ spec_id, version, physical_locator, sha256, line_count })),
  artifacts: artifactReceipts,
};
const compositionManifest = {
  schema_version: "intelligence-composition-manifest.v2",
  generated_at: generatedAt,
  ...compositionBasis,
  composition_hash: sha256Text(json(compositionBasis)),
  source_binding: {
    status: "PASS",
    verification_level: "SOURCE_OBSERVED",
    method: "LOCAL_SHA256_AND_LINE_COUNT_RECOMPUTATION",
    checked_source_count: sourceDefinitions.length,
    checked_at: generatedAt,
    limitation: "This local source-binding receipt is not a signature, runtime attestation, implementation verification or seal.",
  },
  locator_adr: {
    adr_id: "ADR-INTELLIGENCE-PHYSICAL-SOURCE-LOCATORS-001",
    decision_status: "RECORDED",
    decision: "Use the explicitly attached SPECxx and CPICx physical locators, pinned by observed SHA-256 and line count. Treat old names declared inside documents as legacy logical aliases only.",
    rationale: "Files with the old physical names remain present with different content. Filename-only loading would select the wrong normative bytes.",
    loader_rule: "Resolve only a manifest physical_locator and require exact SHA-256 plus line count.",
    external_approval_evidence_refs: [],
  },
  specs: sourceDefinitions.map((source) => ({
    spec_id: source.spec_id,
    version: source.version,
    physical_locator: source.physical_locator,
    declared_logical_name: source.declared_logical_name,
    sha256: source.sha256,
    line_count: source.line_count,
    scope: source.scope,
    lifecycle_status: "ACTIVE",
    loader_eligible: true,
  })),
  legacy_logical_aliases: legacySources,
  active_v1_artifacts: activeV1Artifacts,
  legacy_v1_artifacts: legacyV1Artifacts,
  repository_observation: {
    physical_function_target: 276,
    logical_route_count_observed: 27,
    topology_rule: "Preserve 276 physical functions and 27 logical routes in this slice; no runtime resources are modified.",
    runtime_parity: "UNVERIFIED",
    production_runtime: "UNKNOWN",
  },
  canonical_refs: {
    requirement_ledger: "config/intelligence/requirement-ledger.v2.json",
    acceptance_test_catalog: "config/intelligence/acceptance-test-catalog.v2.json",
    p0_remediation_ledger: "config/intelligence/orchestration-p0-remediation.v2.json",
    aliases: "config/intelligence/canonical-alias-map.v2.json",
    precedence: "config/intelligence/scope-precedence.v2.json",
    compatibility: "config/intelligence/compatibility-ledger.v2.json",
    seals: "config/intelligence/root-seals.v2.json",
  },
  seal_effect: {
    source_binding: "PASS",
    SPEC_SET_RECONCILED: "NOT_SEALED",
    reason: "Local canonical manifests/checks do not supply signed approval, complete applicability mapping or independent seal evidence.",
  },
};
writeJson("composition-manifest.v2.json", compositionManifest);

console.log(
  `intelligence-canonical-v2:generate PASS — ${rootRequirements.length} ORCH requirements · ${testRows.length} tests (${testRows.length - rawTests.ORCH.length} child) · ${collisions.length} collisions · 20 OTR · 8 NOT_SEALED root seals`,
);
