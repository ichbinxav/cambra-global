#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
export const OUTPUT_PATH =
  'config/remediation/authority-trace-operational-inventory.v1.json';

const COMPONENT_PATHS = Object.freeze({
  effect_authority: 'config/remediation/effect-authority-registry.v1.json',
  agent_task_trace: 'config/agenttask-creator-inventory.json',
  workforce: 'config/agent-workforce-catalog.v1.json',
  operational_planes: 'config/operational-plane-inventory.v1.json',
});

const EVIDENCE_PATHS = Object.freeze([
  'base44/entities/AgentRun.jsonc',
  'base44/entities/AgentTask.jsonc',
  'base44/entities/AutonomyIncident.jsonc',
  'base44/entities/Event.jsonc',
  'base44/entities/IncidentAlertDelivery.jsonc',
  'base44/entities/OperationalIncident.jsonc',
  'base44/functions/acceptRecoverMandate/entry.ts',
  'base44/functions/autonomousOperationsSupervisor/entry.ts',
  'base44/functions/commercialSendMessage/entry.ts',
  'base44/functions/createPaymentLink/entry.ts',
  'base44/functions/eclIncidentWorkflow/entry.ts',
  'base44/functions/eclProductionHealth/entry.ts',
  'base44/functions/getAdminOperationsCockpit/entry.ts',
  'base44/functions/intelligenceAdmin/entry.ts',
  'base44/functions/operatingHealthWorker/entry.ts',
  'base44/functions/processWebhookDeadLetters/entry.ts',
  'base44/functions/productionReadinessWorker/entry.ts',
  'base44/functions/reconcileRecoverBilling/entry.ts',
  'base44/functions/recoverAutopilotWorker/entry.ts',
  'base44/functions/startPaymentsMigration/entry.ts',
  'base44/functions/systemHealthAgent/entry.ts',
  'base44/shared/agentAuthority.ts',
  'base44/shared/agentTaskEnvelope.ts',
  'base44/shared/canonicalIncident.ts',
  'base44/shared/effectAuthority.ts',
  'base44/shared/supervisorObservation.ts',
  'config/freeze-change-log.json',
  'config/pre-ecl-freeze.json',
  'scripts/generate-agent-workforce-catalog.mjs',
  'scripts/generate-agenttask-creator-inventory.mjs',
  'scripts/generate-operational-plane-inventory.mjs',
  'scripts/generate-remediation-r0.mjs',
  'scripts/lib/preEclFreeze.mjs',
  'src/lib/agentRegistry.js',
  'src/lib/agentTaskCanonicalWork.test.js',
  'src/lib/agentTaskEnvelope.test.js',
  'src/lib/autonomousSupervisorFailClosed.test.js',
  'src/lib/effectAuthority.test.js',
  'src/lib/eclP1Gate.test.js',
  'src/lib/operationalPlaneReconciliation.test.js',
  'src/lib/preEclFreeze.test.js',
  'src/lib/remediationR0Artifacts.test.js',
]);

const fail = (message) => {
  throw new Error(`remediation_r5_invalid:${message}`);
};
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha256File = (file) => sha256(fs.readFileSync(file));
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

function exact(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label}:${JSON.stringify(actual)}`);
  }
}

function readJson(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) fail(`missing_component:${relative}`);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch {
    fail(`invalid_json:${relative}`);
  }
}

function evidence(root, relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) fail(`missing_evidence:${relative}`);
  const bytes = fs.readFileSync(absolute);
  if (bytes.length === 0) fail(`empty_evidence:${relative}`);
  return { path: relative, sha256: sha256(bytes), bytes: bytes.length };
}

function validateComponents(components, root = REPO_ROOT) {
  const effect = components.effect_authority.document;
  exact(effect.schema_version, 'cambra-effect-authority-registry-v1',
    'effect_schema');
  exact(effect.summary, {
    effect_class_count: 10,
    boundary_count: 42,
    locally_wired_boundary_count: 5,
    source_observed_only_boundary_count: 37,
    implementation_partial_count: 42,
    binary_closed_count: 0,
    runtime_verified_count: 0,
  }, 'effect_summary');
  exact(effect.effect_classes.map((row) => row.key), [
    'SEND',
    'NEGOTIATE',
    'SCHEDULE_MATERIAL',
    'EXECUTE',
    'APPROVE',
    'SIGN_MANDATE',
    'SPEND',
    'BILL_CHARGE',
    'MIGRATE_GO_LIVE',
    'PROMOTE_LEARNING',
  ], 'effect_classes');
  if (effect.effect_classes.some((row) =>
    row.implementation_status !== 'PARTIAL' ||
    row.binary_closure_status !== 'NOT_MET' || row.runtime_verified !== false
  )) fail('effect_false_closure');

  const trace = components.agent_task_trace.document;
  exact(trace.schema_version, 'agenttask-creator-inventory-v2.0.0',
    'trace_schema');
  exact(trace.envelope_version, 'agent-task-envelope-v2.0.0',
    'trace_envelope_version');
  exact(trace.counts.creator_files, 60, 'trace_creator_count');
  exact(trace.counts.material_creator_files, 46, 'trace_material_creators');
  exact(trace.counts.material_trace_adapted_files, 0,
    'trace_material_adapted');
  exact(trace.counts.material_not_adapted_files, 43,
    'trace_material_unadapted');
  exact(trace.counts.unresolved_material_route_files, 111,
    'trace_unresolved_routes');
  exact(trace.root_otr_013.implementation_status, 'PARTIAL',
    'trace_implementation_status');
  exact(trace.root_otr_013.binary_closure_status, 'NOT_MET',
    'trace_binary_status');
  exact(trace.root_otr_013.local_test_status, 'PASSED_LOCAL',
    'trace_local_test_status');

  const workforce = components.workforce.document;
  exact(workforce.schema_version, 'agent-workforce-catalog-v1.0.0',
    'workforce_schema');
  exact(workforce.counts, {
    declared_agents: 34,
    declared_orchestrators: 5,
    authority_rows: 33,
    quarantined_compatibility_agents: 1,
    material_authority_rows: 0,
  }, 'workforce_counts');
  const packageDocument = readJson(root, 'package.json');
  exact(workforce.release_identity, {
    package_version: packageDocument.version,
    release_name: packageDocument.releaseName,
  }, 'workforce_release_identity');
  if (!workforce.generation.sources.some((row) => row.path === 'package.json')) {
    fail('workforce_release_source_missing');
  }
  exact(workforce.health_plane_relationships, {
    canonical_general_supervisor: 'autonomousOperationsSupervisor',
    advisory_projection: 'operatingHealthWorker',
    release_readiness_evaluator: 'productionReadinessWorker',
    quarantined_compatibility_surface: 'systemHealthAgent',
    active_general_supervisor_count: 1,
  }, 'workforce_health_relationships');
  const quarantined = workforce.agents.filter((row) =>
    row.status === 'QUARANTINED_COMPATIBILITY'
  );
  if (
    quarantined.length !== 1 ||
    quarantined[0].function_name !== 'systemHealthAgent' ||
    quarantined[0].canonical_replacement !== 'autonomousOperationsSupervisor'
  ) fail('workforce_quarantine_drift');

  const planes = components.operational_planes.document;
  exact(planes.schema_version, 'operational-plane-inventory-v1.0.0',
    'operational_schema');
  exact(planes.health_planes.surface_count, 5, 'health_surface_count');
  exact(planes.health_planes.active_general_supervisor_count, 1,
    'general_supervisor_count');
  exact(planes.health_planes.active_non_authoritative_projection_count, 2,
    'non_authoritative_projection_count');
  exact(planes.health_planes.quarantined_compatibility_count, 1,
    'quarantined_surface_count');
  exact(planes.health_planes.authoritative_specialized_sweep_count, 1,
    'specialized_health_sweep_count');
  exact(planes.health_planes.surfaces.map((row) => row.function_name), [
    'autonomousOperationsSupervisor',
    'eclProductionHealth',
    'operatingHealthWorker',
    'productionReadinessWorker',
    'systemHealthAgent',
  ], 'health_surface_names');
  if (
    planes.health_planes.system_health_quarantine_proven !== true ||
    planes.health_planes.admin_invocation_removed !== true
  ) fail('system_health_quarantine_not_proven');
  exact(planes.incidents.incident_entity_count, 3, 'incident_entity_count');
  exact(planes.incidents.third_incident_entity_count, 0,
    'third_incident_entity_count');
  exact(planes.incidents.write_roles, {
    AutonomyIncident: '__service_role_only__',
    OperationalIncident: '__service_role_only__',
    IncidentAlertDelivery: '__service_role_only__',
  }, 'incident_write_roles');
  if (
    planes.incidents.operational_writer_allowlist_exact !== true ||
    planes.incidents.adapter.autonomy_projection !== true ||
    planes.incidents.adapter.operational_projection !== true ||
    planes.incidents.adapter.stable_dedupe_projection !== true ||
    planes.incidents.adapter.version !== 'canonical-incident-adapter-v1.3.0' ||
    planes.incidents.adapter.third_entity_allowed !== false ||
    Object.values(planes.incidents.command_center).some((value) =>
      typeof value === 'boolean' && value !== true
    )
  ) fail('canonical_incident_projection_incomplete');
  exact(planes.work_planes.canonical_entity, 'AgentTask',
    'canonical_work_plane');
  exact(planes.work_planes.legacy_entity, 'AgentRun', 'legacy_work_plane');
  exact(planes.work_planes.legacy_write_role, '__service_role_only__',
    'legacy_work_plane_role');
  exact(planes.work_planes.agent_run_writer_count, 0,
    'legacy_work_plane_writers');
}

function otrRows(components) {
  const trace = components.agent_task_trace.document;
  return [
    {
      otr_id: 'ROOT-OTR-012',
      implementation_status: 'PARTIAL',
      local_test_status: 'PASSED_LOCAL',
      verification_level: 'LOCAL_FAILURE_INJECTION',
      binary_closure_status: 'NOT_MET',
      runtime_verified: false,
      evidence_component: 'effect_authority',
      blockers: [
        '37 of 42 material boundaries remain SOURCE_OBSERVED_ONLY and are not wired to the common facade',
        'deployed final-SHA authority denials and zero-effect receipts are absent',
      ],
    },
    {
      otr_id: 'ROOT-OTR-013',
      implementation_status: 'PARTIAL',
      local_test_status: 'PASSED_LOCAL',
      verification_level: 'LOCAL_FAILURE_INJECTION',
      binary_closure_status: 'NOT_MET',
      runtime_verified: false,
      evidence_component: 'agent_task_trace',
      blockers: [...trace.root_otr_013.blockers],
    },
    {
      otr_id: 'ROOT-OTR-014',
      implementation_status: 'REPO_REMEDIATED_RUNTIME_PENDING',
      local_test_status: 'PASSED_LOCAL',
      verification_level: 'LOCAL_FAILURE_INJECTION',
      binary_closure_status: 'NOT_MET',
      runtime_verified: false,
      evidence_component: 'operational_planes',
      blockers: [
        'deployed dependency outage, ambiguous-read and recovery containment drills are absent',
        'real supervisor windows and denominator sufficiency are not observed',
      ],
    },
    {
      otr_id: 'ROOT-OTR-015',
      implementation_status: 'REPO_REMEDIATED_RUNTIME_PENDING',
      local_test_status: 'PASSED_LOCAL',
      verification_level: 'LOCAL_FAILURE_INJECTION',
      binary_closure_status: 'NOT_MET',
      runtime_verified: false,
      evidence_component: 'operational_planes',
      blockers: [
        'live AutonomyIncident/OperationalIncident parity and dedupe reconciliation have not run',
        'incident adapter and command-center linkage are not verified on deployed final-SHA rows',
      ],
    },
    {
      otr_id: 'ROOT-OTR-020',
      implementation_status: 'REPO_REMEDIATED_RUNTIME_PENDING',
      local_test_status: 'PASSED_LOCAL',
      verification_level: 'LOCAL_FAILURE_INJECTION',
      binary_closure_status: 'NOT_MET',
      runtime_verified: false,
      evidence_component: 'workforce',
      blockers: [
        'deployed workforce/catalog parity and stale legacy caller behavior are not observed',
        'AgentRun zero-writer and systemHealthAgent quarantine claims are source-local only',
      ],
    },
  ];
}

export function validateArtifact(document) {
  if (document?.schema_version !== 'cambra-remediation-r5-inventory-v1') {
    fail('schema_version');
  }
  if (document?.catalog_version !== 'remediation-r5.1') {
    fail('catalog_version');
  }
  if (!Array.isArray(document.otr_rows) || document.otr_rows.length !== 5) {
    fail('otr_row_count');
  }
  exact(document.otr_rows.map((row) => row.otr_id), [
    'ROOT-OTR-012', 'ROOT-OTR-013', 'ROOT-OTR-014', 'ROOT-OTR-015',
    'ROOT-OTR-020',
  ], 'otr_ids');
  if (document.otr_rows.some((row) =>
    row.binary_closure_status !== 'NOT_MET' || row.runtime_verified !== false ||
    !['PARTIAL', 'REPO_REMEDIATED_RUNTIME_PENDING'].includes(
      row.implementation_status,
    )
  )) fail('false_runtime_or_binary_closure');
  exact(document.summary, {
    otr_count: 5,
    implementation_partial_count: 2,
    implementation_repo_remediated_runtime_pending_count: 3,
    binary_not_met_count: 5,
    binary_closed_count: 0,
    runtime_verified_count: 0,
    effect_class_count: 10,
    material_boundary_count: 42,
    material_boundary_facade_wired_count: 5,
    material_trace_adapted_creator_count: 0,
    active_general_supervisor_count: 1,
    health_plane_surface_count: 5,
    authoritative_specialized_sweep_count: 1,
    incident_entity_count: 3,
    third_incident_entity_count: 0,
    agent_run_writer_count: 0,
    declared_agent_count: 34,
    declared_orchestrator_count: 5,
  }, 'summary');
  if (!Array.isArray(document.components) || document.components.length !== 4) {
    fail('component_count');
  }
  if (!Array.isArray(document.evidence) || document.evidence.length !==
    EVIDENCE_PATHS.length) fail('evidence_count');
  return document;
}

export function buildArtifact(root = REPO_ROOT) {
  const components = Object.fromEntries(
    Object.entries(COMPONENT_PATHS).map(([key, relative]) => {
      const document = readJson(root, relative);
      return [key, {
        path: relative,
        document,
        sha256: sha256File(path.join(root, relative)),
      }];
    }),
  );
  validateComponents(components, root);
  const rows = otrRows(components);
  const evidenceRows = EVIDENCE_PATHS.map((relative) =>
    evidence(root, relative)
  );
  const componentRows = Object.entries(components).map(([key, value]) => ({
    key,
    path: value.path,
    sha256: value.sha256,
    schema_version: value.document.schema_version,
  }));
  const effect = components.effect_authority.document;
  const trace = components.agent_task_trace.document;
  const workforce = components.workforce.document;
  const planes = components.operational_planes.document;
  const document = {
    schema_version: 'cambra-remediation-r5-inventory-v1',
    catalog_version: 'remediation-r5.1',
    truth_boundary:
      'Local source-derived authority, trace and operational-plane evidence only. It proves no deployed behavior, live provider receipt, production incident parity, binary OTR closure or root seal.',
    input_fingerprint_sha256: sha256(JSON.stringify({
      components: componentRows,
      evidence: evidenceRows.map(({ path: evidencePath, sha256: digest }) => ({
        path: evidencePath,
        sha256: digest,
      })),
    })),
    components: componentRows,
    summary: {
      otr_count: rows.length,
      implementation_partial_count: rows.filter((row) =>
        row.implementation_status === 'PARTIAL'
      ).length,
      implementation_repo_remediated_runtime_pending_count: rows.filter(
        (row) =>
          row.implementation_status === 'REPO_REMEDIATED_RUNTIME_PENDING',
      ).length,
      binary_not_met_count: rows.filter((row) =>
        row.binary_closure_status === 'NOT_MET'
      ).length,
      binary_closed_count: 0,
      runtime_verified_count: 0,
      effect_class_count: effect.summary.effect_class_count,
      material_boundary_count: effect.summary.boundary_count,
      material_boundary_facade_wired_count:
        effect.summary.locally_wired_boundary_count,
      material_trace_adapted_creator_count:
        trace.counts.material_trace_adapted_files,
      active_general_supervisor_count:
        planes.health_planes.active_general_supervisor_count,
      health_plane_surface_count: planes.health_planes.surface_count,
      authoritative_specialized_sweep_count:
        planes.health_planes.authoritative_specialized_sweep_count,
      incident_entity_count: planes.incidents.incident_entity_count,
      third_incident_entity_count: planes.incidents.third_incident_entity_count,
      agent_run_writer_count: planes.work_planes.agent_run_writer_count,
      declared_agent_count: workforce.counts.declared_agents,
      declared_orchestrator_count: workforce.counts.declared_orchestrators,
    },
    closure_rule:
      'REPO_REMEDIATED_RUNTIME_PENDING means the local criterion is failure-injected and source-bound; binary closure still requires deployed final-SHA drills, receipts or runtime evidence.',
    otr_rows: rows,
    runtime_pending: [
      'deployed final-SHA effect-authority denial receipts for every registered material route',
      'production trace completeness and orphan/ambiguity denominator windows',
      'real CostUsageEvent and provider/domain receipt linkage for material AgentTask runs',
      'deployed supervisor dependency outage and containment drills',
      'live AutonomyIncident/OperationalIncident parity and dedupe reconciliation',
      'deployed systemHealthAgent stale-caller quarantine behavior',
      'deployed workforce catalog and AgentRun zero-writer parity',
      'legacy AgentTask/Event/AgentRun reconciliation or backfill decision',
    ],
    evidence: evidenceRows,
  };
  return validateArtifact(document);
}

export function generateArtifact(root = REPO_ROOT) {
  const document = buildArtifact(root);
  const absolute = path.join(root, OUTPUT_PATH);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, canonicalJson(document));
  return document;
}

export function checkArtifact(root = REPO_ROOT) {
  const expected = buildArtifact(root);
  const absolute = path.join(root, OUTPUT_PATH);
  if (!fs.existsSync(absolute)) fail(`generated_missing:${OUTPUT_PATH}`);
  if (fs.readFileSync(absolute, 'utf8') !== canonicalJson(expected)) {
    fail(`generated_drift:${OUTPUT_PATH}`);
  }
  return expected;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH;
if (isMain) {
  try {
    const document = process.argv.includes('--check')
      ? checkArtifact(REPO_ROOT)
      : generateArtifact(REPO_ROOT);
    console.log(
      `remediation-r5:${process.argv.includes('--check') ? 'check' : 'generate'} PASS — ` +
      `${document.summary.otr_count} OTR rows; ` +
      `${document.summary.implementation_partial_count} PARTIAL; ` +
      `${document.summary.implementation_repo_remediated_runtime_pending_count} REPO_REMEDIATED_RUNTIME_PENDING; ` +
      `${document.evidence.length} hash-bound evidence files; 0 CLOSED; 0 runtime-verified.`,
    );
  } catch (error) {
    console.error(`remediation-r5:${process.argv.includes('--check') ? 'check' : 'generate'} FAIL — ${error?.message || error}`);
    process.exitCode = 1;
  }
}
