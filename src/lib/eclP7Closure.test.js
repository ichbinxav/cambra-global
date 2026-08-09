import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  P6_ALLOWLIST, P7_ALLOWLIST, STAGE_ECL_P6, STAGE_ECL_P7, STAGE_ECL_P8, STAGE_TRANSITIONS, allowlistForStage,
} from '../../scripts/lib/preEclFreeze.mjs';
import {
  P7_WORKERS, buildIncidentRecord, incidentDedupeKey, incidentIdempotencyKey, recoveryInvocation, workerFreshness,
} from '../../base44/shared/eclOperationalRecovery.ts';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const HEALTH = read('base44/functions/eclProductionHealth/entry.ts');
const HEALTH_CFG = JSON.parse(read('base44/functions/eclProductionHealth/function.jsonc'));
const WORKFLOW = read('base44/functions/eclIncidentWorkflow/entry.ts');
const DLQ = read('base44/functions/processWebhookDeadLetters/entry.ts');
const DLQ_CFG = JSON.parse(read('base44/functions/processWebhookDeadLetters/function.jsonc'));
const RECONCILER = read('base44/functions/reconcileRecoverBilling/entry.ts');
const UI = read('src/pages/admin/EclOperations.jsx');
const APP = read('src/App.jsx');
const ADMIN = read('src/pages/admin/AdminLayout.jsx');
const INCIDENT_SCHEMA = read('base44/entities/OperationalIncident.jsonc');

describe('ECL P7 — Production Operations & Incident Recovery', () => {
  it('keeps P7 historical rollback to P6 while allowing the sanctioned P8 advance', () => {
    expect(STAGE_TRANSITIONS[STAGE_ECL_P6]).toEqual([expect.any(String), STAGE_ECL_P7]);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P6]).toContain(STAGE_ECL_P7);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P7]).toEqual([STAGE_ECL_P6, STAGE_ECL_P8]);
    expect(allowlistForStage(STAGE_ECL_P7)).toEqual(P7_ALLOWLIST);
  });

  it('widens P6 by exactly nine operational artifacts', () => {
    expect(P7_ALLOWLIST.slice(0, P6_ALLOWLIST.length)).toEqual(P6_ALLOWLIST);
    expect(P7_ALLOWLIST.slice(P6_ALLOWLIST.length)).toEqual([
      'base44/entities/OperationalIncident.jsonc',
      'base44/shared/eclOperationalRecovery.ts',
      'base44/functions/eclProductionHealth/entry.ts',
      'base44/functions/eclProductionHealth/function.jsonc',
      'base44/functions/eclIncidentWorkflow/entry.ts',
      'base44/functions/processWebhookDeadLetters/entry.ts',
      'base44/functions/processWebhookDeadLetters/function.jsonc',
      'src/pages/admin/EclOperations.jsx',
      'src/lib/eclP7Closure.test.js',
    ]);
    expect(P7_ALLOWLIST).toHaveLength(P6_ALLOWLIST.length + 9);
  });

  it('has deterministic incident identity and freshness contracts', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z');
    expect(incidentDedupeKey('worker_liveness', 'ecl_lifecycle_scheduler')).toBe('worker_liveness:ecl_lifecycle_scheduler');
    expect(incidentIdempotencyKey('x:y', now)).toBe('p7-incident:x:y:2026-08-09T12:00:00.000Z');
    expect(workerFreshness('worker', [{ agent_name: 'worker', status: 'completed', completed_at: '2026-08-09T11:45:00.000Z' }], now, 20).healthy).toBe(true);
    expect(workerFreshness('worker', [], now, 20).reason).toBe('no_completed_run');
    const row = buildIncidentRecord({ dedupeKey: 'x:y', domain: 'platform', incidentType: 'x', severity: 'warning', recoveryAction: 'inspect_manual', summary: 'ok' }, '2026-08-09T12:00:00.000Z');
    expect(row.status).toBe('open');
    expect(row.recovery_attempts).toBe(0);
  });

  it('maps recovery to a closed allowlist and requires a subject for replay', () => {
    expect(recoveryInvocation('run_ecl_lifecycle_scheduler').functionName).toBe('eclLifecycleScheduler');
    expect(recoveryInvocation('run_recover_billing_reconciler').functionName).toBe('reconcileRecoverBilling');
    expect(recoveryInvocation('run_webhook_dead_letters').functionName).toBe('processWebhookDeadLetters');
    expect(recoveryInvocation('inspect_manual')).toBeNull();
    expect(() => recoveryInvocation('replay_webhook_dead_letter')).toThrow('webhook_dead_letter_id_required');
    expect(recoveryInvocation('replay_webhook_dead_letter', 'dlq_1').payload).toMatchObject({ deadLetterId: 'dlq_1', manualReplay: true, confirm: 'REPLAY_EXHAUSTED' });
    expect(() => recoveryInvocation('arbitrary_function')).toThrow('unsupported_recovery_action');
  });

  it('health uses authoritative reads, never invokes recovery, and reopens a manually-cleared live signal', () => {
    expect(HEALTH).toContain("Promise.all([");
    expect(HEALTH).not.toMatch(/entities\.(StatementImport|SavingsEvidence|Invoice|WebhookDeadLetter|ReviewCase)\.(filter|list)\([^\n]+\)\.catch\(\(\) => \[\]\)/);
    expect(HEALTH).not.toContain('.functions.invoke(');
    expect(HEALTH).toContain("claimed?.status === 'resolved'");
    expect(HEALTH).toContain("status: 'open'");
    expect(HEALTH).toContain("recovery: 'never_auto_executes'");
  });

  it('schedules health inside every worker SLO', () => {
    expect(HEALTH_CFG.automations[0].is_active).toBe(true);
    expect(HEALTH_CFG.automations[0].repeat_unit).toBe('minutes');
    expect(HEALTH_CFG.automations[0].repeat_interval).toBe(10);
    expect(Math.max(...Object.values(P7_WORKERS).map((x) => x.maxAgeMinutes))).toBeLessThanOrEqual(40);
  });

  it('incident workflow is admin-only, race-claims recovery and cannot accept arbitrary function names', () => {
    expect(WORKFLOW).toContain("user.role !== 'admin'");
    expect(WORKFLOW).toContain("status: 'recovering'");
    expect(WORKFLOW).toContain('updateMany');
    expect(WORKFLOW).toContain('recoveryInvocation(incident.recovery_action');
    expect(WORKFLOW).not.toMatch(/body\.(functionName|function_name)/);
    expect(WORKFLOW).toContain("manual_inspection_required");
  });

  it('versions the DLQ scheduler and makes exhausted replay explicit admin-only', () => {
    expect(DLQ_CFG.automations[0].repeat_interval).toBe(5);
    expect(DLQ_CFG.automations[0].is_active).toBe(true);
    expect(DLQ).toContain('manualReplay && (!gate.isAdmin');
    expect(DLQ).toContain('REPLAY_EXHAUSTED');
    expect(DLQ).toContain('manual_replay_only_for_exhausted');
    expect(DLQ).toContain('"X-CAMBRA-Delivery": dl.id');
    expect(DLQ).toContain('agent_name: WORKER_AGENT');
  });

  it('observes the P6 reconciler without weakening its Stripe read-only guarantee', () => {
    expect(RECONCILER).toContain("agent_name: RECONCILER_AGENT");
    expect(RECONCILER).toContain("stripeRequest(mode, 'GET'");
    expect(RECONCILER).not.toContain("stripeRequest(mode, 'POST'");
  });

  it('schema and operator UI expose incident operations without economic authority', () => {
    for (const field of ['dedupe_key', 'idempotency_key', 'recovery_action', 'recovery_attempts', 'resolution_note']) expect(INCIDENT_SCHEMA).toContain(`\"${field}\"`);
    expect(UI).toContain('eclIncidentWorkflow');
    expect(UI).toContain('eclProductionHealth');
    expect(UI).not.toContain('entities.Invoice');
    expect(UI).not.toContain('entities.SavingsEvidence');
    expect(APP).toContain('/admin/ecl-operations');
    expect(ADMIN).toContain('/admin/ecl-operations');
  });
});
