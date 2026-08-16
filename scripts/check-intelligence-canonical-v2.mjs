#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const configDir = path.resolve(argValue("--config-dir") ?? path.join(root, "config", "intelligence"));
const specDirRaw = argValue("--spec-dir") ?? process.env.CAMBRA_INTELLIGENCE_SPEC_DIR ?? null;
const specDir = specDirRaw ? path.resolve(specDirRaw) : null;
const fail = (message) => {
  throw new Error(`intelligence_canonical_v2_invalid:${message}`);
};
const read = (name) => {
  const file = path.join(configDir, name);
  if (!fs.existsSync(file)) fail(`missing_file:${name}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`json_parse:${name}:${error instanceof Error ? error.message : String(error)}`);
  }
};
const sha256Text = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const sha256File = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const normalizeText = (value) => value.normalize("NFC").trim().replace(/\s+/gu, " ");
const lineCount = (value) => value.split("\n").length - (value.endsWith("\n") ? 1 : 0);
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const unique = (values, label) => {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate_${label}:${value}`);
    seen.add(value);
  }
  return seen;
};
const exactArray = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label}:${JSON.stringify(actual)}`);
};
const splitMarkdownRow = (line) =>
  line.trim().slice(1, -1).split("|").map((cell) => normalizeText(cell));

const expectedSources = [
  ["ORCH", "2.0.0-root", "CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPECxx.md", "f64a20bd69cb46c0f767f024ebaff4cf7145ff746f80ff0e01534da316bc5123", 7921],
  ["CIV2", "2.0.0-master-spec", "CAMBRA_INTELLIGENCE_V2_MASTER_SPEC.md", "48f781020c8893a439c84743703152d337e5a917348297dbb015a5bf448905c6", 4859],
  ["ALIF", "2.0.0-master-spec", "CAMBRA_ADAPTIVE_LEAD_INTELLIGENCE_FUNNEL_MASTER_SPEC.md", "78236a93e571ce6aa4ec095294df91e8e1c1a51f43c266cf99ff944823157d4f", 5989],
  ["CPIC", "1.0.0", "CAMBRA_CPIC_ULTRA_MASTER_SPECx.md", "6279c2cb83bc9bdbab31167a6d1acbaca1a6a8c1ee5a400eb418800d599a6502", 7929],
];
const sourceById = new Map(expectedSources.map(([specId, version, locator, hash, lines]) => [specId, { specId, version, locator, hash, lines }]));
const expectedRootSeals = [
  "SPEC_SET_RECONCILED",
  "INTELLIGENCE_FOUNDATION_INTEGRATED",
  "CPIC_INTEGRATED",
  "ADAPTIVE_LEAD_INTEGRATED",
  "GOVERNED_EXECUTION_READY",
  "FULL_CAMBRA_INTELLIGENCE_LOOP_SANDBOX_VERIFIED",
  "FULL_CAMBRA_INTELLIGENCE_LOOP_REAL_WORLD_VERIFIED",
  "CAMBRA_COMPOUND_INTELLIGENCE_SYSTEM_READY",
];
const expectedDependencies = {
  SPEC_SET_RECONCILED: [],
  INTELLIGENCE_FOUNDATION_INTEGRATED: ["SPEC_SET_RECONCILED"],
  CPIC_INTEGRATED: ["INTELLIGENCE_FOUNDATION_INTEGRATED"],
  ADAPTIVE_LEAD_INTEGRATED: ["CPIC_INTEGRATED"],
  GOVERNED_EXECUTION_READY: ["INTELLIGENCE_FOUNDATION_INTEGRATED"],
  FULL_CAMBRA_INTELLIGENCE_LOOP_SANDBOX_VERIFIED: ["CPIC_INTEGRATED", "ADAPTIVE_LEAD_INTEGRATED", "GOVERNED_EXECUTION_READY"],
  FULL_CAMBRA_INTELLIGENCE_LOOP_REAL_WORLD_VERIFIED: ["FULL_CAMBRA_INTELLIGENCE_LOOP_SANDBOX_VERIFIED"],
  CAMBRA_COMPOUND_INTELLIGENCE_SYSTEM_READY: ["FULL_CAMBRA_INTELLIGENCE_LOOP_REAL_WORLD_VERIFIED"],
};
const expectedP0StatusAxes = {
  implementation_status: ["NOT_STARTED", "PARTIAL", "IN_PROGRESS", "REPO_REMEDIATED_RUNTIME_PENDING"],
  binary_closure_status: ["NOT_MET", "CLOSED"],
  test_status: ["NOT_RUN", "PASSED_LOCAL", "FAILED_LOCAL"],
  verification_level: ["SOURCE_OBSERVED", "LOCAL_FAILURE_INJECTION", "RUNTIME_VERIFIED"],
};
const expectedP0TestFiles = [
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
const expectedP0TestCommand = `node_modules/.bin/vitest run ${expectedP0TestFiles.join(" ")}`;
const expectedRepositoryRemediatedRuntimePending = new Set([
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

const manifest = read("composition-manifest.v2.json");
const ledger = read("requirement-ledger.v2.json");
const tests = read("acceptance-test-catalog.v2.json");
const p0 = read("orchestration-p0-remediation.v2.json");
const aliases = read("canonical-alias-map.v2.json");
const precedence = read("scope-precedence.v2.json");
const compatibility = read("compatibility-ledger.v2.json");
const seals = read("root-seals.v2.json");

if (manifest.schema_version !== "intelligence-composition-manifest.v2") fail("manifest_schema_version");
if (ledger.schema_version !== "intelligence-requirement-ledger.v2") fail("ledger_schema_version");
if (tests.schema_version !== "intelligence-acceptance-test-catalog.v2") fail("test_catalog_schema_version");
if (p0.schema_version !== "orchestration-p0-remediation-ledger.v2") fail("p0_schema_version");
if (aliases.schema_version !== "intelligence-canonical-alias-map.v2") fail("alias_schema_version");
if (precedence.schema_version !== "intelligence-scope-precedence.v2") fail("precedence_schema_version");
if (compatibility.schema_version !== "intelligence-compatibility-ledger.v2") fail("compatibility_schema_version");
if (seals.schema_version !== "intelligence-root-compositional-seals.v2") fail("seal_schema_version");

if (manifest.source_binding?.status !== "PASS") fail("source_binding_not_pass");
if (manifest.source_binding?.method !== "LOCAL_SHA256_AND_LINE_COUNT_RECOMPUTATION") fail("source_binding_method");
if (manifest.seal_effect?.source_binding !== "PASS") fail("source_binding_seal_effect");
if (manifest.seal_effect?.SPEC_SET_RECONCILED !== "NOT_SEALED") fail("source_binding_false_seal");
if (manifest.locator_adr?.adr_id !== "ADR-INTELLIGENCE-PHYSICAL-SOURCE-LOCATORS-001") fail("locator_adr_missing");
if (manifest.locator_adr?.loader_rule !== "Resolve only a manifest physical_locator and require exact SHA-256 plus line count.") fail("locator_adr_loader_rule");

if (!Array.isArray(manifest.specs) || manifest.specs.length !== expectedSources.length) fail("manifest_spec_count");
for (const [specId, version, locator, hash, lines] of expectedSources) {
  const source = manifest.specs.find((entry) => entry.spec_id === specId);
  if (!source) fail(`manifest_source_missing:${specId}`);
  if (source.version !== version || source.physical_locator !== locator || source.sha256 !== hash || source.line_count !== lines) {
    fail(`manifest_source_identity:${specId}`);
  }
  if (source.lifecycle_status !== "ACTIVE" || source.loader_eligible !== true) fail(`manifest_source_inactive:${specId}`);
}
if (manifest.repository_observation?.physical_function_target !== 276 || manifest.repository_observation?.logical_route_count_observed !== 27) {
  fail("topology_preservation_contract");
}

const legacyAliases = manifest.legacy_logical_aliases;
if (!Array.isArray(legacyAliases) || legacyAliases.length !== 2) fail("legacy_document_alias_count");
for (const [logical, target] of [
  ["CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPEC.md", "CAMBRA_INTELLIGENCE_MASTER_ORCHESTRATION_SPECxx.md"],
  ["CAMBRA_CPIC_ULTRA_MASTER_SPEC.md", "CAMBRA_CPIC_ULTRA_MASTER_SPECx.md"],
]) {
  const alias = legacyAliases.find((entry) => entry.logical_alias === logical);
  if (!alias || alias.authoritative_physical_locator !== target) fail(`legacy_document_alias:${logical}`);
  if (alias.alias_status !== "CONTENT_MISMATCH" || alias.lifecycle_status !== "SUPERSEDED" || alias.loader_eligible !== false) {
    fail(`legacy_document_alias_status:${logical}`);
  }
}

const activeV1Names = [
  "research-conflicts.v1.json",
  "research-knowledge.v1.json",
  "research-source-manifest.v1.json",
];
const allV1Names = fs.readdirSync(configDir).filter((name) => name.endsWith(".v1.json")).sort();
const legacyNames = allV1Names.filter((name) => !activeV1Names.includes(name));
const declaredActiveV1Names = (manifest.active_v1_artifacts || []).map((entry) => path.basename(entry.path)).sort();
exactArray(declaredActiveV1Names, activeV1Names, "active_v1_inventory");
for (const entry of manifest.active_v1_artifacts) {
  if (entry.lifecycle_status !== "ACTIVE_RESEARCH_KNOWLEDGE_V1" || entry.read_compatibility !== "SUPPORTED" || entry.write_target !== true || entry.authority !== "CANDIDATE_ONLY_NON_EXECUTABLE") {
    fail(`active_v1_status:${entry.path}`);
  }
}
const declaredLegacyNames = manifest.legacy_v1_artifacts.map((entry) => path.basename(entry.path)).sort();
exactArray(declaredLegacyNames, legacyNames, "legacy_v1_inventory");
for (const entry of manifest.legacy_v1_artifacts) {
  if (entry.lifecycle_status !== "SUPERSEDED_FOR_CANONICAL_V2_RECONCILIATION" || entry.read_compatibility !== "SUPPORTED" || entry.write_target !== false) {
    fail(`legacy_v1_status:${entry.path}`);
  }
}
for (const required of ["requirement-ledger.v1.json", "spec-compatibility-matrix.v1.json", "gates.v1.json"]) {
  if (!legacyNames.includes(required)) fail(`legacy_v1_missing:${required}`);
}

if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 7) fail("artifact_receipt_count");
for (const receipt of manifest.artifacts) {
  const file = path.join(configDir, path.basename(receipt.path));
  if (!fs.existsSync(file)) fail(`artifact_missing:${receipt.path}`);
  if (sha256File(file) !== receipt.sha256) fail(`artifact_hash:${receipt.path}`);
}
const compositionBasis = {
  composition_id: manifest.composition_id,
  root_version: manifest.root_version,
  sources: manifest.sources,
  artifacts: manifest.artifacts,
};
if (manifest.composition_hash !== sha256Text(canonicalJson(compositionBasis))) fail("composition_hash");

exactArray(ledger.status_axes?.requirement_progress, ["NOT_STARTED", "IN_PROGRESS", "IMPLEMENTED", "VERIFIED", "BLOCKED", "DEFERRED", "SUPERSEDED"], "requirement_progress_enum");
exactArray(ledger.status_axes?.implementation_status, ["EXISTING", "PARTIAL", "NOT_PRESENT", "TARGET", "DEPRECATED", "OUT_OF_SCOPE"], "implementation_status_enum");
exactArray(ledger.status_axes?.verification_level, ["UNKNOWN", "SOURCE_OBSERVED", "TEST_VERIFIED", "RUNTIME_VERIFIED", "PRODUCTION_EVIDENCED", "REAL_WORLD_VALIDATED"], "verification_level_enum");
if (ledger.requirement_counts?.ORCH !== 538 || !Array.isArray(ledger.requirements) || ledger.requirements.length !== 538) fail("root_requirement_count");
const requirementIds = unique(ledger.requirements.map((row) => row.local_requirement_id), "root_requirement_id");
unique(ledger.requirements.map((row) => row.requirement_uid), "root_requirement_uid");
for (const row of ledger.requirements) {
  const expectedUid = `ORCH@${sourceById.get("ORCH").hash}::${row.local_requirement_id}`;
  if (!/^ORCH-R-[A-Z0-9-]+$/u.test(row.local_requirement_id)) fail(`root_requirement_id:${row.local_requirement_id}`);
  if (row.requirement_uid !== expectedUid) fail(`root_requirement_uid:${row.local_requirement_id}`);
  if (row.source_spec_id !== "ORCH" || row.source_spec_version !== "2.0.0-root" || row.source_spec_hash !== sourceById.get("ORCH").hash) fail(`root_requirement_source:${row.local_requirement_id}`);
  if (row.requirement_text !== normalizeText(row.requirement_text)) fail(`root_requirement_normalization:${row.local_requirement_id}`);
  if (row.requirement_text_hash !== sha256Text(row.requirement_text)) fail(`root_requirement_text_hash:${row.local_requirement_id}`);
  if (row.requirement_progress !== "NOT_STARTED" || row.implementation_status !== "TARGET" || row.verification_level !== "UNKNOWN") fail(`root_requirement_false_progress:${row.local_requirement_id}`);
  if (row.source_binding_status !== "BOUND") fail(`root_requirement_binding:${row.local_requirement_id}`);
  if (row.runtime_evidence_refs.length !== 0) fail(`root_requirement_runtime_evidence:${row.local_requirement_id}`);
}
if (!requirementIds.has("ORCH-R-DOC-001") || !requirementIds.has("ORCH-R-RESP-004")) fail("root_requirement_boundary_ids");

if (!Array.isArray(tests.tests) || tests.tests.length !== 892) fail("test_total_count");
if (tests.counts?.root !== 200 || tests.counts?.child !== 692 || tests.counts?.total !== 892 || tests.counts?.not_run !== 892 || tests.counts?.pass !== 0) fail("test_declared_counts");
if (tests.counts?.by_spec?.ORCH !== 200 || tests.counts?.by_spec?.CIV2 !== 113 || tests.counts?.by_spec?.ALIF !== 249 || tests.counts?.by_spec?.CPIC !== 330) fail("test_spec_counts");
unique(tests.tests.map((row) => row.test_uid), "test_uid");
for (const row of tests.tests) {
  const source = sourceById.get(row.source_spec_id);
  if (!source) fail(`test_source:${row.test_uid}`);
  if (row.test_uid !== `${row.source_spec_id}@${source.hash}::${row.local_test_id}`) fail(`test_uid:${row.test_uid}`);
  if (row.source_spec_version !== source.version || row.source_spec_hash !== source.hash || row.source_hash !== source.hash) fail(`test_source_identity:${row.test_uid}`);
  if (row.definition_hash !== sha256Text(normalizeText(row.definition_fields.join(" | ")))) fail(`test_definition_hash:${row.test_uid}`);
  if (row.status !== "NOT_RUN" || row.executed_at !== null || row.executed_by !== null || row.evidence_refs.length !== 0) fail(`test_false_execution:${row.test_uid}`);
  if (row.applicability?.status !== "PENDING_ASSESSMENT") fail(`test_applicability:${row.test_uid}`);
}
if (!Array.isArray(tests.alias_collisions) || tests.alias_collisions.length !== 22) fail("test_collision_count");
const actualCiv2 = new Set(tests.tests.filter((row) => row.source_spec_id === "CIV2").map((row) => row.local_test_id));
const actualAlif = new Set(tests.tests.filter((row) => row.source_spec_id === "ALIF").map((row) => row.local_test_id));
const actualCollisions = [...actualCiv2].filter((id) => actualAlif.has(id)).sort();
exactArray(tests.alias_collisions.map((row) => row.local_test_id).sort(), actualCollisions, "test_collision_inventory");
for (const collision of tests.alias_collisions) {
  if (collision.collision_status !== "DISAMBIGUATED_BY_COMPOSITE_UID" || collision.test_uids.length !== 2) fail(`test_collision_resolution:${collision.local_test_id}`);
}

for (const [axis, values] of Object.entries(expectedP0StatusAxes)) {
  exactArray(p0.status_axes?.[axis], values, `p0_${axis}_enum`);
}
if (
  p0.closure_rule?.expression !== "binary_closure_status == CLOSED AND test_status == PASSED_LOCAL AND verification_level == RUNTIME_VERIFIED" ||
  p0.closure_rule?.all_conditions_required !== true ||
  p0.closure_rule?.partial_local_tests_can_close !== false ||
  p0.closure_rule?.repo_remediated_runtime_pending_definition !==
    "REPO_REMEDIATED_RUNTIME_PENDING: criterio probado con inyección de fallo/concurrencia en repo; el cierre binario requiere drill, receipts o evidencia de runtime desplegado." ||
  !String(p0.closure_rule?.description || "").includes("REPO_REMEDIATED_RUNTIME_PENDING")
) fail("p0_closure_rule");
if (!Array.isArray(p0.items) || p0.items.length !== 20) fail("p0_item_count");
if (
  p0.counts?.total !== 20 ||
  p0.counts?.implementation_partial !== 11 ||
  p0.counts?.implementation_repo_remediated_runtime_pending !== 9 ||
  p0.counts?.closed !== 0 ||
  p0.counts?.not_met !== 20 ||
  p0.counts?.test_not_run !== 0 ||
  p0.counts?.test_passed_local !== 20 ||
  p0.counts?.test_failed_local !== 0 ||
  p0.counts?.source_observed !== 0 ||
  p0.counts?.local_failure_injection !== 20 ||
  p0.counts?.runtime_verified !== 0 ||
  p0.counts?.local_partial_criterion_only !== 11 ||
  p0.counts?.local_repository_criterion_complete_runtime_pending !== 9
) fail("p0_counts");
if (!Array.isArray(p0.local_test_runs) || p0.local_test_runs.length !== 1) fail("p0_local_test_run_count");
const p0LocalRun = p0.local_test_runs[0];
if (
  p0LocalRun.run_id !== "R5-LOCAL-VITEST-2026-08-14" ||
  p0LocalRun.status !== "PASSED_LOCAL" ||
  p0LocalRun.local_test_scope !== "MIXED_REPOSITORY_AND_PARTIAL_CRITERIA" ||
  p0LocalRun.working_directory !== "." ||
  p0LocalRun.command !== expectedP0TestCommand ||
  p0LocalRun.runner !== "vitest@4.1.10" ||
  !p0LocalRun.limitation
) fail("p0_local_test_run_identity");
exactArray(p0LocalRun.test_files, expectedP0TestFiles, "p0_local_test_files");
if (
  p0LocalRun.observed_result?.test_files_passed !== 36 ||
  p0LocalRun.observed_result?.test_files_total !== 36 ||
  p0LocalRun.observed_result?.tests_passed !== 505 ||
  p0LocalRun.observed_result?.tests_total !== 505
) fail("p0_local_test_result");
for (const ref of expectedP0TestFiles) if (!fs.existsSync(path.join(root, ref))) fail(`p0_local_test_file:${ref}`);
const p0LocalTestFileSet = new Set(expectedP0TestFiles);
exactArray(p0.items.map((row) => row.otr_id), Array.from({ length: 20 }, (_, index) => `ROOT-OTR-${String(index + 1).padStart(3, "0")}`), "p0_ids");
for (const row of p0.items) {
  for (const [axis, values] of Object.entries(expectedP0StatusAxes)) {
    if (!values.includes(row[axis])) fail(`p0_unknown_${axis}:${row.otr_id}:${row[axis]}`);
  }
  const repositoryPending = expectedRepositoryRemediatedRuntimePending.has(row.otr_id);
  const expectedImplementation = repositoryPending
    ? "REPO_REMEDIATED_RUNTIME_PENDING"
    : "PARTIAL";
  const expectedLocalScope = repositoryPending
    ? "REPOSITORY_CRITERION_COMPLETE_RUNTIME_PENDING"
    : "PARTIAL_CRITERION_ONLY";
  if (row.implementation_status !== expectedImplementation) fail(`p0_implementation_status:${row.otr_id}`);
  if (row.binary_closure_status !== "NOT_MET") fail(`p0_false_closure:${row.otr_id}`);
  if (row.test_status !== "PASSED_LOCAL" || row.local_test_scope !== expectedLocalScope) fail(`p0_local_test_scope:${row.otr_id}`);
  if (row.verification_level === "RUNTIME_VERIFIED") fail(`p0_false_runtime_verification:${row.otr_id}`);
  if (row.local_test_run_ref !== p0LocalRun.run_id || !Array.isArray(row.local_test_refs) || row.local_test_refs.length === 0) fail(`p0_local_test_refs:${row.otr_id}`);
  for (const ref of row.local_test_refs) if (!p0LocalTestFileSet.has(ref)) fail(`p0_local_test_ref_unknown:${row.otr_id}:${ref}`);
  exactArray(
    row.assessment_classification,
    repositoryPending ? ["EXISTING", "RUNTIME_ONLY"] : ["EXISTING", "GAP", "RUNTIME_ONLY"],
    `p0_classification:${row.otr_id}`,
  );
  for (const field of ["implementation_existing", "material_effect_covered", "local_partial_criterion_verified", "gap_local", "gap_runtime", "assessment_scope"]) {
    if (typeof row[field] !== "string" || row[field].trim().length === 0) fail(`p0_assessment_field:${row.otr_id}:${field}`);
  }
  if (row.runtime_evidence_refs.length !== 0 || row.blockers.length === 0) fail(`p0_evidence:${row.otr_id}`);
  for (const ref of row.source_evidence_refs) if (!fs.existsSync(path.join(root, ref))) fail(`p0_source_ref:${row.otr_id}:${ref}`);
}
const p0ClosedRows = p0.items.filter((row) => row.binary_closure_status === "CLOSED");
if (p0ClosedRows.some((row) => row.test_status !== "PASSED_LOCAL" || row.verification_level !== "RUNTIME_VERIFIED")) fail("p0_closed_without_complete_predicate");
const p0CompleteClosureRows = p0.items.filter((row) =>
  row.binary_closure_status === "CLOSED" &&
  row.test_status === "PASSED_LOCAL" &&
  row.verification_level === "RUNTIME_VERIFIED"
);
if (p0CompleteClosureRows.length !== p0.counts.closed) fail("p0_closed_count_not_predicate_derived");

const expectedLogicalAliases = [
  ["StatisticalProblem", "StatisticalProblemDefinition"],
  ["FeatureContract", "FeatureDefinition"],
  ["LabelContract", "LabelDefinition"],
  ["PredictionEvent", "PredictionReceipt"],
  ["PolicyExposure", "ExposureReceipt"],
  ["EvaluationReport", "EvaluationRun"],
  ["DriftAssessment", "DriftReport"],
  ["RetrainingProposal", "RetrainingDecision"],
];
for (const [aliasA, aliasB] of expectedLogicalAliases) {
  const entry = aliases.logical_contract_aliases.find((row) => row.alias_a === aliasA && row.alias_b === aliasB);
  if (!entry || entry.creates_physical_resource !== false) fail(`logical_alias:${aliasA}`);
}
const ambiguousLegacySeal = aliases.compatibility_aliases.find((row) => row.legacy === "FULL_CAMBRA_INTELLIGENCE_LOOP_VERIFIED");
if (!ambiguousLegacySeal || ambiguousLegacySeal.canonical !== null || ambiguousLegacySeal.auto_migrate !== false) fail("ambiguous_legacy_seal_alias");
if (aliases.compatibility_aliases.find((row) => row.legacy === "MASTER_ORCHESTRATION_READY")?.status !== "INTERNAL_GATE_ALIAS_NOT_A_NINTH_SEAL") fail("master_orchestration_alias");

if (precedence.global_file_order_forbidden !== true || !Array.isArray(precedence.precedence) || precedence.precedence.length !== 8) fail("scope_precedence");
exactArray(precedence.precedence.map((row) => row.rank), [1, 2, 3, 4, 5, 6, 7, 8], "scope_precedence_ranks");
if (precedence.precedence.find((row) => row.scope === "ROOT_COMPOSITION")?.authority !== "ORCH composition, compatibility, ownership and compositional seals only") fail("root_precedence_scope");

if (!Array.isArray(compatibility.supersessions) || compatibility.supersessions.length !== 8) fail("supersession_count");
for (const row of compatibility.supersessions) {
  if (row.decision_status !== "RESOLVED" || row.migration_status !== "NOT_STARTED" || row.blocks_seals !== true) fail(`supersession_status:${row.compatibility_id}`);
}
for (const row of compatibility.open_conflicts) {
  if (row.decision_status === "OPEN" && row.blocks_seals !== true) fail(`open_conflict_not_blocking:${row.compatibility_id}`);
}

if (seals.exact_seal_count !== 8 || !Array.isArray(seals.seals) || seals.seals.length !== 8) fail("root_seal_count");
exactArray(seals.seals.map((row) => row.seal_type), expectedRootSeals, "root_seal_names");
for (const row of seals.seals) {
  if (row.status !== "NOT_SEALED" || row.attestation_id !== null || row.runtime_evidence_refs.length !== 0 || row.blockers.length === 0) fail(`root_seal_false_issue:${row.seal_type}`);
  exactArray(row.dependency_seal_types, expectedDependencies[row.seal_type], `root_seal_dependencies:${row.seal_type}`);
  for (const dependency of row.dependency_seal_types) if (!expectedRootSeals.includes(dependency)) fail(`root_seal_unknown_dependency:${row.seal_type}:${dependency}`);
}

const visiting = new Set();
const visited = new Set();
const visitSeal = (sealType) => {
  if (visiting.has(sealType)) fail(`root_seal_cycle:${sealType}`);
  if (visited.has(sealType)) return;
  visiting.add(sealType);
  for (const dependency of expectedDependencies[sealType]) visitSeal(dependency);
  visiting.delete(sealType);
  visited.add(sealType);
};
for (const sealType of expectedRootSeals) visitSeal(sealType);

let attachedCanonicalSourceBindingStatus = "NOT_RUN";
if (specDir) {
  const externalLines = new Map();
  for (const [specId, , locator, hash, lines] of expectedSources) {
    const file = path.join(specDir, locator);
    if (!fs.existsSync(file)) fail(`external_source_missing:${specId}:${file}`);
    const content = fs.readFileSync(file, "utf8");
    if (sha256File(file) !== hash) fail(`external_source_hash:${specId}`);
    if (lineCount(content) !== lines) fail(`external_source_lines:${specId}`);
    externalLines.set(specId, content.split("\n"));
  }
  for (const row of ledger.requirements) {
    const lineNumber = Number(row.source_anchor.slice("line:".length));
    const line = externalLines.get("ORCH")[lineNumber - 1];
    const match = line?.match(/^\*\*(ORCH-R-[A-Z0-9-]+)\*\*\s+—\s+(.+)$/u);
    if (!match || match[1] !== row.local_requirement_id || normalizeText(match[2]) !== row.requirement_text) fail(`external_requirement_binding:${row.local_requirement_id}`);
  }
  for (const row of tests.tests) {
    const lineNumber = Number(row.source_anchor.slice("line:".length));
    const line = externalLines.get(row.source_spec_id)[lineNumber - 1];
    if (row.source_spec_id === "CPIC") {
      const match = line?.match(/^- \*\*(CPIC-AT-\d{3}) — (.+?):\*\*\s+(.+)$/u);
      if (!match || match[1] !== row.local_test_id || JSON.stringify([normalizeText(match[2]), normalizeText(match[3])]) !== JSON.stringify(row.definition_fields)) fail(`external_test_binding:${row.test_uid}`);
    } else {
      const cells = splitMarkdownRow(line ?? "");
      if (cells[0] !== row.local_test_id || JSON.stringify(cells.slice(1)) !== JSON.stringify(row.definition_fields)) fail(`external_test_binding:${row.test_uid}`);
    }
  }
  attachedCanonicalSourceBindingStatus = "PASS";
}

console.log(
  `intelligence-canonical-v2:check PASS — source_binding=PASS attached_canonical_source_binding=${attachedCanonicalSourceBindingStatus} external_research_source_reverification=NOT_RUN · 538 ORCH requirements · 200 ORCH tests + 692 child tests · 22 collision aliases · 20/20 OTR PASSED_LOCAL(11 PARTIAL_CRITERION_ONLY + 9 REPOSITORY_CRITERION_COMPLETE_RUNTIME_PENDING) · 20/20 OTR NOT_MET · 8/8 root seals NOT_SEALED`,
);
