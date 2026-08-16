#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const OUTPUT = 'config/operational-plane-inventory.v1.json';
const check = process.argv.includes('--check');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relativeFiles = (root, predicate) => fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath || entry.path, entry.name).replaceAll('\\', '/'))
  .filter(predicate)
  .sort();
const sourceFiles = [
  ...relativeFiles('base44/functions', (file) => file.endsWith('/entry.ts')),
  ...relativeFiles('base44/shared', (file) => file.endsWith('.ts')),
  ...relativeFiles('src', (file) => /\.(?:js|jsx|ts|tsx)$/.test(file) && !/\.test\./.test(file)),
];
const writers = (entity) => {
  const pattern = new RegExp(`entities\\.${entity}\\.(?:create|update|updateMany|delete|bulkCreate|updateMany)\\s*\\(`);
  return sourceFiles.filter((file) => pattern.test(fs.readFileSync(file, 'utf8')));
};
const dependencyLabels = (file, callName = 'observeSupervisorCollection') => {
  const source = fs.readFileSync(file, 'utf8');
  const direct = [...source.matchAll(new RegExp(`${callName}\\(\\s*['\"]([^'\"]+)`, 'g'))].map((row) => row[1]);
  const critical = [...source.matchAll(/criticalRead\(\s*['"]([^'"]+)/g)].map((row) => row[1]);
  const bounded = [...source.matchAll(/readCriticalHealthCollection(?:<[^>]+>)?\(\s*['"]([^'"]+)/g)].map((row) => row[1]);
  const unavailable = [...source.matchAll(/unavailableSupervisorDependency\(\s*['"]([^'"]+)/g)].map((row) => row[1]);
  return [...new Set([...direct, ...critical, ...bounded, ...unavailable])].sort();
};

const OPERATIONAL_PLANE_PATTERN = /OPERATIONAL_PLANE_DECLARATION\s*=\s*Object\.freeze\((\{[^\n]+\})\)/;
const PLANE_CANDIDATE_PATTERN = /AUTONOMOUS_OPERATIONS_SUPERVISOR_VERSION|OPERATING_HEALTH_PROJECTION_VERSION|evaluateProductionSeal|HEALTH_AGENT\s*=\s*['"]ecl_production_health['"]|SYSTEM_HEALTH_COMPATIBILITY_STATE/;
const planeCandidateFiles = sourceFiles.filter((file) =>
  file.startsWith('base44/functions/') && file.endsWith('/entry.ts') &&
  PLANE_CANDIDATE_PATTERN.test(fs.readFileSync(file, 'utf8'))
);
const undeclaredPlaneCandidates = planeCandidateFiles.filter((file) =>
  !OPERATIONAL_PLANE_PATTERN.test(fs.readFileSync(file, 'utf8'))
);
if (undeclaredPlaneCandidates.length > 0) {
  throw new Error(`operational_plane_declaration_missing:${undeclaredPlaneCandidates.join(',')}`);
}
const healthSurfaces = planeCandidateFiles.map((file) => {
  const source = fs.readFileSync(file, 'utf8');
  const match = source.match(OPERATIONAL_PLANE_PATTERN);
  let declaration;
  try {
    declaration = JSON.parse(match[1]);
  } catch {
    throw new Error(`operational_plane_declaration_invalid:${file}`);
  }
  const expectedPath = `base44/functions/${declaration.function_name}/entry.ts`;
  if (expectedPath !== file) {
    throw new Error(`operational_plane_path_binding_mismatch:${file}:${expectedPath}`);
  }
  if (!Array.isArray(declaration.authoritative_for)) {
    throw new Error(`operational_plane_authority_invalid:${file}`);
  }
  return {
    ...declaration,
    path: file,
    dependency_labels: dependencyLabels(file),
  };
}).sort((left, right) => left.function_name.localeCompare(right.function_name));
if (new Set(healthSurfaces.map((row) => row.function_name)).size !== healthSurfaces.length) {
  throw new Error('operational_plane_duplicate_declaration');
}

const incidentEntities = fs.readdirSync('base44/entities')
  .filter((name) => /Incident/.test(name) && name.endsWith('.jsonc'))
  .map((name) => `base44/entities/${name}`)
  .sort();
const autonomyWriters = writers('AutonomyIncident');
const operationalWriters = writers('OperationalIncident');
const deliveryWriters = writers('IncidentAlertDelivery');
const agentRunWriters = writers('AgentRun');
const expectedOperationalWriters = [
  'base44/functions/eclIncidentWorkflow/entry.ts',
  'base44/functions/eclProductionHealth/entry.ts',
];
const canonicalSource = fs.readFileSync('base44/shared/canonicalIncident.ts', 'utf8');
const cockpitSource = fs.readFileSync('base44/functions/getAdminOperationsCockpit/entry.ts', 'utf8');
const systemHealthSource = fs.readFileSync('base44/functions/systemHealthAgent/entry.ts', 'utf8');
const adminAgentSource = fs.readFileSync('base44/functions/adminAgentOperations/entry.ts', 'utf8');
const schema = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const role = (file) => schema(file)?.rls?.write?.user_condition?.role || null;

const payload = {
  schema_version: 'operational-plane-inventory-v1.0.0',
  generation: {
    mode: 'SOURCE_DERIVED',
    source_hashes: Object.fromEntries([
      ...healthSurfaces.map((row) => row.path),
      'base44/shared/supervisorObservation.ts',
      'base44/shared/canonicalIncident.ts',
      'base44/functions/getAdminOperationsCockpit/entry.ts',
      'base44/entities/AgentRun.jsonc',
      ...incidentEntities,
    ].sort().map((file) => [file, sha256(file)])),
  },
  health_planes: {
    surface_count: healthSurfaces.length,
    active_general_supervisor_count: healthSurfaces.filter((row) => row.classification === 'CANONICAL_GENERAL_SUPERVISOR' && row.status === 'ACTIVE').length,
    active_non_authoritative_projection_count: healthSurfaces.filter((row) => row.status === 'ACTIVE_NON_AUTHORITATIVE').length,
    authoritative_specialized_sweep_count: healthSurfaces.filter((row) => row.status === 'ACTIVE_SPECIALIZED').length,
    quarantined_compatibility_count: healthSurfaces.filter((row) => row.classification === 'QUARANTINED_COMPATIBILITY').length,
    surfaces: healthSurfaces,
    system_health_quarantine_proven: systemHealthSource.includes("{ status: 410 }") && systemHealthSource.includes('operational_plane_writes: 0') && systemHealthSource.includes('compatibility_probe_audit_write_possible: true') && !/entities\.(?:AgentTask|Event|AutonomyIncident|OperationalIncident|IncidentAlertDelivery|OperatingHealthAssessment|ProductionReadinessSnapshot)\.(?:create|update|updateMany|delete|bulkCreate)\s*\(/.test(systemHealthSource),
    admin_invocation_removed: !adminAgentSource.match(/const ALLOWED[^;]+systemHealthAgent/) && !adminAgentSource.match(/const SAFE_BATCH[^;]+systemHealthAgent/),
  },
  incidents: {
    canonical_authority: 'AutonomyIncident',
    ecl_compatibility_ledger: 'OperationalIncident',
    transport_ledger: 'IncidentAlertDelivery',
    entity_paths: incidentEntities,
    incident_entity_count: incidentEntities.length,
    third_incident_entity_count: incidentEntities.filter((file) => ![
      'base44/entities/AutonomyIncident.jsonc',
      'base44/entities/OperationalIncident.jsonc',
      'base44/entities/IncidentAlertDelivery.jsonc',
    ].includes(file)).length,
    write_roles: {
      AutonomyIncident: role('base44/entities/AutonomyIncident.jsonc'),
      OperationalIncident: role('base44/entities/OperationalIncident.jsonc'),
      IncidentAlertDelivery: role('base44/entities/IncidentAlertDelivery.jsonc'),
    },
    writer_files: {
      AutonomyIncident: autonomyWriters,
      OperationalIncident: operationalWriters,
      IncidentAlertDelivery: deliveryWriters,
    },
    writer_counts: {
      AutonomyIncident: autonomyWriters.length,
      OperationalIncident: operationalWriters.length,
      IncidentAlertDelivery: deliveryWriters.length,
    },
    operational_writer_allowlist: expectedOperationalWriters,
    operational_writer_allowlist_exact: JSON.stringify(operationalWriters) === JSON.stringify(expectedOperationalWriters),
    adapter: {
      path: 'base44/shared/canonicalIncident.ts',
      version: (canonicalSource.match(/CANONICAL_INCIDENT_ADAPTER_VERSION\s*=\s*["']([^"']+)["']/) || [])[1] || null,
      autonomy_projection: canonicalSource.includes('projectAutonomyIncident'),
      operational_projection: canonicalSource.includes('adaptOperationalIncident'),
      stable_dedupe_projection: canonicalSource.includes('canonicalIncidentView'),
      third_entity_allowed: canonicalSource.includes('third_incident_entity_allowed: false') ? false : null,
    },
    command_center: {
      path: 'base44/functions/getAdminOperationsCockpit/entry.ts',
      reads_autonomy: cockpitSource.includes("safeRead(\n      'AutonomyIncident'"),
      reads_operational: cockpitSource.includes("safeRead(\n      'OperationalIncident'"),
      uses_canonical_view: cockpitSource.includes('canonicalIncidentView(\n    autonomyIncidents,\n    operationalIncidents'),
      stable_linkage_exposed: cockpitSource.includes('canonical_key: x.canonical_key') && cockpitSource.includes('source_links: x.source_links'),
      all_observed_active_rows_exposed:
        cockpitSource.includes('incidents: activeIncidents.map(') &&
        !cockpitSource.includes('activeIncidents.slice('),
      source_coverage_exposed:
        cockpitSource.includes('incident_coverage: {') &&
        cockpitSource.includes('all_observed_active_rows_returned: true'),
      exact_counts_require_complete_sources:
        cockpitSource.includes('active_incidents: incidentCoverage.data_complete') &&
        cockpitSource.includes('critical_incidents: incidentCoverage.data_complete') &&
        canonicalSource.includes('count_semantics: dataComplete ? "EXACT"'),
    },
  },
  work_planes: {
    canonical_entity: 'AgentTask',
    legacy_entity: 'AgentRun',
    legacy_write_role: role('base44/entities/AgentRun.jsonc'),
    agent_run_writer_files: agentRunWriters,
    agent_run_writer_count: agentRunWriters.length,
  },
};

const serialized = `${JSON.stringify(payload, null, 2)}\n`;
if (check) {
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8') !== serialized) {
    console.error(`operational-planes:check FAIL — regenerate ${OUTPUT}`);
    process.exit(1);
  }
  console.log(`operational-planes:check PASS — one general supervisor, ${incidentEntities.length} incident entities, ${autonomyWriters.length}/${operationalWriters.length}/${deliveryWriters.length} writers, ${agentRunWriters.length} AgentRun writers.`);
} else {
  fs.writeFileSync(OUTPUT, serialized);
  console.log(`operational-planes:generate PASS — wrote ${OUTPUT}`);
}
