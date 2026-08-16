import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  observeSupervisorCollection,
  observeSupervisorRecord,
  summarizeSupervisorDependencies,
  supervisorAuthorityDependency,
  supervisorIncidentRecoveryDemonstrated,
} from '../../base44/shared/supervisorObservation.ts';
import {
  canonicalIncidentView,
  observeBoundedOperationalCollection,
  requireCompleteOperationalCollection,
} from '../../base44/shared/canonicalIncident.ts';
import {
  commercialFollowUpRecoveryState,
  commercialFollowUpResultIsComplete,
  commercialFollowUpResultIsPartial,
  readCriticalFollowUpCollection,
} from '../../base44/shared/commercialFollowUpRecovery.ts';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const SUPERVISOR = read('base44/functions/autonomousOperationsSupervisor/entry.ts');
const COCKPIT = read('base44/functions/getAdminOperationsCockpit/entry.ts');
const ECL_HEALTH = read('base44/functions/eclProductionHealth/entry.ts');
const COMMERCIAL_FOLLOW_UP = read('base44/functions/commercialFollowUpWorker/entry.ts');

afterEach(() => vi.restoreAllMocks());

describe('ROOT-OTR-014 — autonomous supervisor dependency truth', () => {
  it('makes the specialized ECL sweep UNKNOWN on failed, malformed or truncated reads', async () => {
    const failed = await observeBoundedOperationalCollection('failed', 2, async () => {
      throw new Error('injected');
    });
    const malformed = await observeBoundedOperationalCollection('malformed', 2, async () => null);
    const truncated = await observeBoundedOperationalCollection('truncated', 2, async (limit) =>
      Array.from({ length: limit }, (_, index) => ({ id: String(index) }))
    );
    const complete = await observeBoundedOperationalCollection('complete', 2, async () => [{ id: '1' }]);

    expect(failed).toMatchObject({ coverage_status: 'UNKNOWN', reason_code: 'READ_FAILED' });
    expect(malformed).toMatchObject({ coverage_status: 'UNKNOWN', reason_code: 'NON_ARRAY_RESULT' });
    expect(truncated).toMatchObject({
      coverage_status: 'UNKNOWN',
      reason_code: 'RESULT_SET_TRUNCATED',
      requested_limit: 3,
    });
    expect(() => requireCompleteOperationalCollection(failed)).toThrow('critical_operational_read_unknown');
    expect(() => requireCompleteOperationalCollection(malformed)).toThrow('critical_operational_read_unknown');
    expect(() => requireCompleteOperationalCollection(truncated)).toThrow('critical_operational_read_unknown');
    expect(requireCompleteOperationalCollection(complete)).toEqual([{ id: '1' }]);
  });

  it('binds every ECL absence decision to cap-plus-one complete reads', () => {
    expect(ECL_HEALTH).toContain('readCriticalHealthCollection');
    expect(ECL_HEALTH).toContain('observeBoundedOperationalCollection');
    expect(ECL_HEALTH).toContain('requireCompleteOperationalCollection');
    expect(ECL_HEALTH).not.toMatch(/\|\|\s*\[\]/);
    expect(ECL_HEALTH).toContain('p7_incident_duplicate_active_episode');
    expect(ECL_HEALTH.indexOf('const existingActive = await activeHealthIncidents(svc)'))
      .toBeLessThan(ECL_HEALTH.indexOf('for (const incident of existingActive)'));
  });

  it('distinguishes complete empty, complete observed, unavailable and ambiguous reads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const empty = await observeSupervisorCollection('empty', async () => [], { limit: 10 });
    const observed = await observeSupervisorCollection('observed', async () => [{ id: '1' }], { limit: 10 });
    const unavailable = await observeSupervisorCollection('failed', async () => { throw new Error('injected'); }, { limit: 10 });
    const malformed = await observeSupervisorCollection('malformed', async () => null, { limit: 10 });
    const capped = await observeSupervisorCollection('capped', async () => [{ id: '1' }, { id: '2' }], { limit: 2 });

    expect(empty).toMatchObject({ availability: 'COMPLETE', observation_state: 'EMPTY', count: 0 });
    expect(observed).toMatchObject({ availability: 'COMPLETE', observation_state: 'OBSERVED', count: 1 });
    expect(unavailable).toMatchObject({ availability: 'UNAVAILABLE', observation_state: 'ERROR', count: null, reason: 'READ_FAILED' });
    expect(malformed).toMatchObject({ availability: 'AMBIGUOUS', observation_state: 'UNKNOWN', count: null });
    expect(capped).toMatchObject({ availability: 'AMBIGUOUS', observation_state: 'OBSERVED', reason: 'RESULT_SET_MAY_BE_TRUNCATED' });
  });

  it('treats an absent record as known empty but a thrown read as unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const absent = await observeSupervisorRecord('record', async () => null);
    const failed = await observeSupervisorRecord('record', async () => { throw new TypeError('injected'); });
    expect(absent).toMatchObject({ availability: 'COMPLETE', observation_state: 'EMPTY', count: 0 });
    expect(failed).toMatchObject({ availability: 'UNAVAILABLE', observation_state: 'ERROR', count: null });
  });

  it('blocks every automated action when data or internal authority is not demonstrated', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const complete = await observeSupervisorCollection('complete', async () => [], { limit: 10 });
    const failed = await observeSupervisorCollection('failed', async () => { throw new Error('injected'); }, { limit: 10 });
    const noAuthority = supervisorAuthorityDependency('commercial_followup_authority', false);

    expect(summarizeSupervisorDependencies([complete])).toMatchObject({
      data_complete: true,
      health_status: 'COMPLETE',
      readiness_status: 'COMPLETE',
      automated_action_allowed: true,
    });
    expect(summarizeSupervisorDependencies([complete, failed, noAuthority])).toMatchObject({
      data_complete: false,
      health_status: 'DEGRADED',
      readiness_status: 'UNKNOWN',
      automated_action_allowed: false,
      blocked_dependencies: ['failed', 'commercial_followup_authority'],
    });
  });

  it('removes empty fallbacks from critical reads and surfaces a failed sweep', () => {
    expect(SUPERVISOR).toContain('observeSupervisorCollection');
    expect(SUPERVISOR).toContain('observeSupervisorRecord');
    expect(SUPERVISOR).not.toContain('safeBestEffort');
    expect(SUPERVISOR).not.toMatch(/entities\.[A-Za-z0-9_]+\.(?:filter|list|get)\([\s\S]{0,260}?\.catch\(/);
    expect(SUPERVISOR).toContain("health_status: 'DEGRADED'");
    expect(SUPERVISOR).toContain("readiness_status: 'UNKNOWN'");
    expect(SUPERVISOR).toContain('automated_recovery_allowed: false');
    expect(SUPERVISOR).toMatch(/status:\s*503/);
    expect(SUPERVISOR).toContain("error: 'supervisor_dependency_unknown'");
  });

  it('places the dependency barrier before recovery and never clears a manual pause', () => {
    const barrier = SUPERVISOR.indexOf('if (!dependencySummary.automated_action_allowed)');
    const followup = SUPERVISOR.indexOf("svc.functions.invoke('commercialFollowUpWorker'");
    expect(barrier).toBeGreaterThan(0);
    expect(followup).toBeGreaterThan(barrier);
    expect(SUPERVISOR).toContain("dependencyDedupeKey(dependency.dependency)");
    expect(SUPERVISOR).toContain("severity: 'critical'");
    expect(SUPERVISOR).toContain("workflow_state: 'human_review'");
    const update = SUPERVISOR.match(/CommunicationThread\.update\(thread\.id, \{[\s\S]{0,240}?\}\);/)?.[0] || '';
    expect(update).toContain("status: 'awaiting_counterparty'");
    expect(update).toContain('next_action_at');
    expect(update).not.toContain('automation_paused');
    expect(update).not.toContain('pause_reason');
  });

  it('turns a failed recovery invocation into a canonical review incident', () => {
    expect(SUPERVISOR).toContain("dedupe_key: 'supervisor_recovery:commercial_followups'");
    expect(SUPERVISOR).toContain("subject_type: 'Worker'");
    expect(SUPERVISOR).toContain("subject_id: 'commercialFollowUpWorker'");
    expect(SUPERVISOR).toContain("throw new Error('commercial_followup_recovery_failed')");
    expect(SUPERVISOR).toContain('no healthy result was emitted');
    expect(SUPERVISOR).toContain('commercialFollowUpResultIsComplete(result)');
    expect(SUPERVISOR).toContain('commercialFollowUpResultIsPartial(result)');
  });

  it('rejects failed, ambiguous and capped follow-up reads and never promotes degradation', async () => {
    await expect(readCriticalFollowUpCollection('failed', 2, async () => {
      throw new Error('injected');
    })).rejects.toThrow('critical_read_failed:failed');
    await expect(readCriticalFollowUpCollection('ambiguous', 2, async () => null))
      .rejects.toThrow('critical_read_ambiguous:ambiguous');
    await expect(readCriticalFollowUpCollection('capped', 2, async () => [{ id: 1 }, { id: 2 }]))
      .rejects.toThrow('critical_read_truncated:capped');

    expect(commercialFollowUpRecoveryState([{ error: 'send_failed' }])).toMatchObject({
      data_complete: true,
      recovery_status: 'DEGRADED',
      recovery_complete: false,
      failed: 1,
    });
    expect(commercialFollowUpRecoveryState([], 3)).toMatchObject({
      data_complete: true,
      recovery_status: 'PARTIAL',
      recovery_complete: false,
      failed: 0,
      pending: 3,
    });
    expect(commercialFollowUpResultIsComplete({
      ok: true,
      data_complete: true,
      recovery_status: 'DEGRADED',
      recovery_complete: false,
      failed: 1,
    })).toBe(false);
    expect(commercialFollowUpResultIsComplete({
      ok: true,
      data_complete: true,
      recovery_status: 'COMPLETE',
      recovery_complete: true,
      failed: 0,
    })).toBe(true);
    expect(commercialFollowUpResultIsPartial({
      ok: true,
      data_complete: true,
      recovery_status: 'PARTIAL',
      recovery_complete: false,
      failed: 0,
      pending: 3,
    })).toBe(true);
  });

  it('surfaces partial follow-up recovery as attention instead of healthy completion', () => {
    expect(COMMERCIAL_FOLLOW_UP).toContain('const workerComplete = workerSucceeded && recoveryComplete');
    expect(COMMERCIAL_FOLLOW_UP).toContain("status: workerComplete ? 'completed' : workerSucceeded ? 'waiting_input' : 'failed'");
    expect(COMMERCIAL_FOLLOW_UP).toContain('executionOk = workerComplete');
    expect(SUPERVISOR).toContain('partialCommercialRecovery = recoveryPartial');
    expect(SUPERVISOR).toContain('(partialCommercialRecovery ? 1 : 0)');
    expect(SUPERVISOR).toContain("readiness_status: partialCommercialRecovery ? 'PARTIAL' : 'COMPLETE'");
    expect(SUPERVISOR).toContain("status: partialCommercialRecovery ? 'waiting_input' : 'completed'");
    expect(SUPERVISOR).toContain('partialCommercialRecovery ? { status: 503 } : undefined');
  });

  it('re-probes the exact dependency before resolving its incident', () => {
    const incident = { subject_id: 'InternalCallAuthority.commercialFollowUpWorker' };
    expect(supervisorIncidentRecoveryDemonstrated(incident, [])).toBe(false);
    expect(supervisorIncidentRecoveryDemonstrated(incident, [
      supervisorAuthorityDependency('OtherAuthority', true),
    ])).toBe(false);
    expect(supervisorIncidentRecoveryDemonstrated(incident, [
      supervisorAuthorityDependency('InternalCallAuthority.commercialFollowUpWorker', false),
    ])).toBe(false);
    expect(supervisorIncidentRecoveryDemonstrated(incident, [
      supervisorAuthorityDependency('InternalCallAuthority.commercialFollowUpWorker', true),
    ])).toBe(true);
    expect(SUPERVISOR).toContain('supervisorIncidentRecoveryDemonstrated(incident, dependencies)');
    expect(SUPERVISOR).toContain('openDependencyIncidents,\n        dependencies,');
  });
});

describe('ROOT-OTR-015 minimum — one canonical incident command-center view', () => {
  it('keeps AutonomyIncident authoritative and attaches ECL source linkage once', () => {
    const rows = canonicalIncidentView(
      [{
        id: 'autonomy-1', dedupe_key: 'shared:key', domain: 'worker', severity: 'warning', status: 'open',
        workflow_state: 'human_review', owner_type: 'engineering', summary: 'Canonical summary',
        first_seen_at: '2026-08-13T08:00:00.000Z', last_seen_at: '2026-08-13T09:00:00.000Z',
      }],
      [{
        id: 'ecl-1', dedupe_key: 'shared:key', source: 'ecl_production_health', domain: 'platform',
        incident_type: 'worker_liveness', severity: 'critical', status: 'acknowledged', summary: 'ECL detail',
        first_seen_at: '2026-08-13T07:00:00.000Z', last_seen_at: '2026-08-13T10:00:00.000Z', occurrence_count: 3,
      }],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'autonomy-1',
      canonical_key: 'incident:shared:key',
      canonical_authority: 'AutonomyIncident',
      severity: 'critical',
      status: 'open',
      summary: 'Canonical summary',
      occurrence_count: 3,
    });
    expect(rows[0].source_links).toEqual([
      { entity: 'AutonomyIncident', id: 'autonomy-1', source: 'autonomy' },
      { entity: 'OperationalIncident', id: 'ecl-1', source: 'ecl_production_health' },
    ]);
  });

  it('adapts distinct ECL incidents without creating a third writer or entity', () => {
    const rows = canonicalIncidentView(
      [{ id: 'autonomy-1', dedupe_key: 'a', status: 'resolved', summary: 'A' }],
      [{ id: 'ecl-1', dedupe_key: 'b', status: 'recovering', summary: 'B' }],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.dedupe_key === 'b')).toMatchObject({
      id: 'operational:ecl-1',
      canonical_authority: 'AutonomyIncident',
      status: 'open',
      workflow_state: 'auto_resolution',
    });
    expect(COCKPIT).toMatch(/safeRead\(\s*'AutonomyIncident'/);
    expect(COCKPIT).toMatch(/safeRead\(\s*'OperationalIncident'/);
    expect(COCKPIT).toMatch(/canonicalIncidentView\(\s*autonomyIncidents,\s*operationalIncidents/);
    expect(COCKPIT).toContain('source_links: x.source_links');
    expect(COCKPIT).not.toContain('CanonicalIncident.create');
  });

  it('never presents an open incident with a resolved workflow or resolved timestamp', () => {
    const [row] = canonicalIncidentView(
      [{
        id: 'autonomy-resolved', dedupe_key: 'same', status: 'resolved',
        workflow_state: 'resolved', resolved_at: '2026-08-13T09:00:00.000Z',
        last_seen_at: '2026-08-13T09:00:00.000Z', summary: 'Old canonical episode',
      }],
      [{
        id: 'operational-open', dedupe_key: 'same', status: 'recovering',
        resolved_at: '2026-08-13T08:00:00.000Z',
        last_seen_at: '2026-08-13T10:00:00.000Z', summary: 'Still active',
      }],
    );
    expect(row).toMatchObject({
      status: 'open',
      workflow_state: 'auto_resolution',
      resolved_at: null,
    });
  });

  it('marks capped cockpit reads as truncated and incomplete', () => {
    expect(COCKPIT).toContain('observeBoundedOperationalCollection<any>');
    expect(COCKPIT).toContain("observation.reason_code === 'RESULT_SET_TRUNCATED'");
    expect(COCKPIT).toContain('pushUnique(truncatedSources, name)');
    expect(COCKPIT).toContain('truncated_sources: truncatedSources');
    expect(COCKPIT).toMatch(/degradedSources\.length === 0\s*&&\s*\n\s*truncatedSources\.length === 0/);
    expect(COCKPIT).toContain('all_observed_active_rows_returned: true');
    expect(COCKPIT).not.toContain('activeIncidents.slice(');
  });
});
