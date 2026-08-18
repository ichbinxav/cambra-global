import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INCIDENT_PLANE_CONTRACT,
  canonicalIncidentView,
  observeBoundedOperationalCollection,
  requireCompleteOperationalCollection,
} from '../../base44/shared/canonicalIncident.ts';
import {
  observeSupervisorCollection,
  summarizeSupervisorDependencies,
  unavailableSupervisorDependency,
} from '../../base44/shared/supervisorObservation.ts';
import workforce from '../../config/agent-workforce-catalog.v1.json';
import planes from '../../config/operational-plane-inventory.v1.json';

const read = (file) => fs.readFileSync(file, 'utf8');
const SOURCES = Object.fromEntries(
  planes.health_planes.surfaces.map((row) => [row.function_name, read(row.path)]),
);

afterEach(() => vi.restoreAllMocks());

describe('ROOT-OTR-014 — all supervisor and health surfaces fail closed', () => {
  it.each(
    planes.health_planes.surfaces
      .filter((row) => row.dependency_labels.length)
      .map((row) => [row.function_name, row.dependency_labels]),
  )('%s preserves EMPTY/OBSERVED/UNKNOWN/ERROR and blocks on injected failure', async (_worker, labels) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dependencies = await Promise.all([
      observeSupervisorCollection(labels[0], async () => [], { limit: 10 }),
      observeSupervisorCollection(labels[1], async () => [{ id: 'observed' }], { limit: 10 }),
      observeSupervisorCollection(labels[2], async () => null, { limit: 10 }),
      observeSupervisorCollection(labels[3], async () => { throw new Error('injected-critical-read'); }, { limit: 10 }),
    ]);
    expect(dependencies.map((row) => row.observation_state)).toEqual([
      'EMPTY', 'OBSERVED', 'UNKNOWN', 'ERROR',
    ]);
    expect(summarizeSupervisorDependencies(dependencies)).toMatchObject({
      health_status: 'DEGRADED',
      readiness_status: 'UNKNOWN',
      automated_action_allowed: false,
    });
  });

  it('represents missing runtime identity as UNKNOWN authority rather than empty permission', () => {
    const dependency = unavailableSupervisorDependency(
      'release_verifications',
      'RUNTIME_GIT_SHA_MISSING',
      'RUNTIME_IDENTITY_UNAVAILABLE',
    );
    expect(dependency).toMatchObject({
      availability: 'UNAVAILABLE',
      observation_state: 'UNKNOWN',
      count: null,
    });
    expect(summarizeSupervisorDependencies([dependency]).automated_action_allowed).toBe(false);
  });

  it('wires the fail-closed barrier before recovery or runtime-evidence effects', () => {
    const canonical = SOURCES.autonomousOperationsSupervisor;
    const operating = SOURCES.operatingHealthWorker;
    const readiness = SOURCES.productionReadinessWorker;
    expect(canonical.indexOf('if (!dependencySummary.automated_action_allowed)'))
      .toBeLessThan(canonical.indexOf("svc.functions.invoke('commercialFollowUpWorker'"));
    expect(operating.indexOf('summarizeSupervisorDependencies(dependencies)'))
      .toBeLessThan(operating.indexOf('markSchedulerEffectStarted(svc, schedulerClaim)'));
    expect(readiness.indexOf('if (!dependencySummary.automated_action_allowed)'))
      .toBeLessThan(readiness.indexOf('markSchedulerEffectStarted(svc, schedulerClaim)'));
    for (const source of [canonical, operating, readiness]) {
      expect(source).toContain('readiness_status');
      expect(source).toContain('UNKNOWN');
      expect(source).not.toMatch(/entities\.[A-Za-z0-9_]+\.(?:filter|list|get)\([^;]{0,260}?fallback:\s*\[\]/s);
    }
  });

  it('includes the authoritative ECL sweep and refuses incomplete bounded pages', async () => {
    expect(planes.health_planes).toMatchObject({
      surface_count: 5,
      authoritative_specialized_sweep_count: 1,
    });
    expect(planes.health_planes.surfaces.map((row) => row.function_name)).toContain(
      'eclProductionHealth',
    );
    const truncated = await observeBoundedOperationalCollection(
      'ecl-test',
      1,
      async (limit) => Array.from({ length: limit }, (_, index) => ({ id: index })),
    );
    expect(truncated.coverage_status).toBe('UNKNOWN');
    expect(() => requireCompleteOperationalCollection(truncated)).toThrow(
      'critical_operational_read_unknown',
    );
    expect(SOURCES.eclProductionHealth).toContain('readCriticalHealthCollection');
  });

  it('never promotes a complete-but-empty operating baseline to healthy', () => {
    const operating = SOURCES.operatingHealthWorker;
    expect(operating).toMatch(/emptyBaseline\s*\?\s*["']EMPTY["']/);
    expect(operating).toMatch(/health_status:\s*["']DEGRADED["']/);
    expect(operating).toMatch(/readiness_status:\s*["']UNKNOWN["']/);
    const schema = JSON.parse(read('base44/entities/OperatingHealthAssessment.jsonc'));
    expect(schema.properties.health_status.enum).toEqual([
      'HEALTHY', 'ATTENTION_REQUIRED', 'EMPTY', 'DEGRADED',
    ]);
    expect(schema.rls.write.user_condition.role).toBe('__service_role_only__');
  });
});

describe('ROOT-OTR-015 — canonical incident view and exact producer plane', () => {
  it('keeps AutonomyIncident canonical and IncidentAlertDelivery transport-only', () => {
    expect(INCIDENT_PLANE_CONTRACT).toEqual({
      canonical_authority: 'AutonomyIncident',
      ecl_compatibility_ledger: 'OperationalIncident',
      transport_delivery_ledger: 'IncidentAlertDelivery',
      command_center_projection: 'canonicalIncidentView',
      third_incident_entity_allowed: false,
    });
    expect(planes.incidents.canonical_authority).toBe('AutonomyIncident');
    expect(planes.incidents.entity_paths).toHaveLength(3);
    expect(planes.incidents.third_incident_entity_count).toBe(0);
    expect(planes.incidents.writer_counts.IncidentAlertDelivery).toBe(1);
    expect(planes.incidents.writer_files.IncidentAlertDelivery).toEqual([
      'base44/shared/incidentAlerting.ts',
    ]);
  });

  it('deduplicates shared keys but never collides unrelated unkeyed ledgers', () => {
    expect(canonicalIncidentView(
      [{ id: 'a', dedupe_key: 'shared', status: 'open', summary: 'A' }],
      [{ id: 'b', dedupe_key: 'shared', status: 'open', summary: 'B' }],
    )).toHaveLength(1);
    const unkeyed = canonicalIncidentView(
      [{ id: 'same-id', status: 'open', summary: 'A' }],
      [{ id: 'same-id', status: 'open', summary: 'B' }],
    );
    expect(unkeyed).toHaveLength(2);
    expect(new Set(unkeyed.map((row) => row.canonical_key)).size).toBe(2);
  });

  it('allows OperationalIncident writes only from the two versioned ECL backends', () => {
    expect(planes.incidents.operational_writer_allowlist_exact).toBe(true);
    expect(planes.incidents.writer_files.OperationalIncident).toEqual([
      'base44/functions/eclIncidentWorkflow/entry.ts',
      'base44/functions/eclProductionHealth/entry.ts',
    ]);
    for (const file of planes.incidents.writer_files.OperationalIncident) {
      expect(read(file)).toContain('base44.asServiceRole');
    }
    expect(planes.incidents.write_roles).toEqual({
      AutonomyIncident: '__service_role_only__',
      OperationalIncident: '__service_role_only__',
      IncidentAlertDelivery: '__service_role_only__',
    });
    expect(Object.values(planes.incidents.writer_files).flat().some((file) => file.startsWith('src/'))).toBe(false);
  });

  it('exposes one stable command-center row with source linkage', () => {
    expect(planes.incidents.adapter).toMatchObject({
      version: 'canonical-incident-adapter-v1.3.0',
      autonomy_projection: true,
      operational_projection: true,
      stable_dedupe_projection: true,
      third_entity_allowed: false,
    });
    expect(planes.incidents.command_center).toEqual({
      path: 'base44/functions/getAdminOperationsCockpit/entry.ts',
      reads_autonomy: true,
      reads_operational: true,
      uses_canonical_view: true,
      stable_linkage_exposed: true,
      all_observed_active_rows_exposed: true,
      source_coverage_exposed: true,
      exact_counts_require_complete_sources: true,
    });
  });
});

describe('ROOT-OTR-020 — one work plane, one general supervisor, exact catalog', () => {
  it('quarantines the former parallel system-health plane and removes invocation paths', () => {
    const source = SOURCES.systemHealthAgent;
    expect(source).toContain('QUARANTINED_COMPATIBILITY_NO_WRITES');
    expect(source).toContain('{ status: 410 }');
    expect(source).toContain('operational_plane_writes: 0');
    expect(source).toContain('compatibility_probe_audit_write_possible: true');
    expect(source).not.toMatch(/entities\.(?:AgentTask|Event|AutonomyIncident|OperationalIncident|IncidentAlertDelivery|OperatingHealthAssessment|ProductionReadinessSnapshot)\.(?:create|update|updateMany|delete|bulkCreate)/);
    expect(planes.health_planes).toMatchObject({
      active_general_supervisor_count: 1,
      active_non_authoritative_projection_count: 2,
      authoritative_specialized_sweep_count: 1,
      quarantined_compatibility_count: 1,
      system_health_quarantine_proven: true,
      admin_invocation_removed: true,
    });
    expect(read('src/lib/agentRegistry.js')).toContain('status: "QUARANTINED_COMPATIBILITY"');
  });

  it('keeps AgentRun service-only legacy history with zero repository writers', () => {
    expect(planes.work_planes).toMatchObject({
      canonical_entity: 'AgentTask',
      legacy_entity: 'AgentRun',
      legacy_write_role: '__service_role_only__',
      agent_run_writer_files: [],
      agent_run_writer_count: 0,
    });
  });

  it('generates an exact workforce and orchestrator catalog from source', () => {
    expect(workforce.counts).toEqual({
      declared_agents: 34,
      declared_orchestrators: 5,
      authority_rows: 33,
      quarantined_compatibility_agents: 1,
      material_authority_rows: 0,
    });
    expect(workforce.health_plane_relationships.active_general_supervisor_count).toBe(1);
    expect(workforce.agents.find((row) => row.function_name === 'systemHealthAgent')).toMatchObject({
      status: 'QUARANTINED_COMPATIBILITY',
      canonical_replacement: 'autonomousOperationsSupervisor',
    });
    /* global process */
    execFileSync(process.execPath, ['scripts/generate-agent-workforce-catalog.mjs', '--check'], { stdio: 'pipe' });
    execFileSync(process.execPath, ['scripts/generate-operational-plane-inventory.mjs', '--check'], { stdio: 'pipe' });
  });
});