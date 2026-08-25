import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  P6_ALLOWLIST, P7_ALLOWLIST, STAGE_ECL_P6, STAGE_ECL_P7, STAGE_ECL_P8, STAGE_TRANSITIONS, allowlistForStage,
} from '../../scripts/lib/preEclFreeze.mjs';
import {
  P7_WORKERS, buildIncidentRecord, incidentDedupeKey, incidentIdempotencyKey, recoveryInvocation,
  schedulerControlRecoveryDecision, workerFreshness,
} from '../../base44/shared/eclOperationalRecovery.ts';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const HEALTH = read('base44/functions/eclProductionHealth/entry.ts');
const HEALTH_CFG = JSON.parse(read('base44/functions/eclProductionHealth/function.jsonc'));
const WORKFLOW = read('base44/functions/eclIncidentWorkflow/entry.ts');
const DLQ = read('base44/functions/processWebhookDeadLetters/entry.ts');
const DLQ_CFG = JSON.parse(read('base44/functions/processWebhookDeadLetters/function.jsonc'));
const RECONCILER = read('base44/functions/reconcileRecoverBilling/entry.ts');
const INSTANTLY_EVENT_RETRY = read('base44/shared/logical/instantlyProviderEventRetryWorker.ts');
const INSTANTLY_RECONCILIATION = read('base44/shared/logical/instantlyReconciliationWorker.ts');
const DISCOVERY_WORKER = read('base44/functions/alwaysOnLeadDiscoveryWorker/entry.ts');
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

  it('only releases a quarantined scheduler control when task evidence proves no effect started', () => {
    const control = { control_state: 'REVIEW_REQUIRED', active_attempt_id: 'attempt_1' };
    const attempt = { id: 'attempt_1', run_key: 'run_1' };
    expect(schedulerControlRecoveryDecision(control, attempt, [], { allowNoTaskProof: true })).toMatchObject({
      ok: true,
      action: 'reset_control',
      reason: 'no_task_created_before_effect',
    });
    expect(schedulerControlRecoveryDecision(control, attempt, [])).toMatchObject({
      ok: false,
      reason: 'scheduler_no_task_not_proof',
    });
    expect(schedulerControlRecoveryDecision(control, attempt, [{
      id: 'task_1',
      parent_run: 'run_1',
      execution_effects_started: false,
      effect_state: 'NOT_STARTED',
      effect_refs_json: [],
      receipt_refs_json: [],
    }])).toMatchObject({ ok: true, reason: 'task_proves_no_effect_started', taskId: 'task_1' });
    expect(schedulerControlRecoveryDecision(control, attempt, [{
      id: 'task_source_ref',
      parent_run: '',
      source_refs_json: [{ type: 'SchedulerRun', id: 'attempt_1' }],
      execution_effects_started: false,
      effect_state: 'NOT_APPLICABLE',
      effect_refs_json: [],
      receipt_refs_json: [],
    }])).toMatchObject({ ok: true, reason: 'task_proves_no_effect_started', taskId: 'task_source_ref' });
    expect(schedulerControlRecoveryDecision(control, attempt, [{
      id: 'task_1',
      parent_run: 'run_1',
      execution_effects_started: true,
      effect_state: 'EXECUTED',
      effect_refs_json: [{ id: 'effect_1' }],
      receipt_refs_json: [],
    }])).toMatchObject({ ok: false, reason: 'scheduler_effect_nonoccurrence_unproven' });
    expect(schedulerControlRecoveryDecision(control, attempt, [{
      id: 'task_1',
      parent_run: 'run_1',
      execution_effects_started: false,
      effect_state: 'NOT_STARTED',
      effect_refs_json: { unexpected: 'shape' },
      receipt_refs_json: [],
    }])).toMatchObject({ ok: false, reason: 'scheduler_effect_nonoccurrence_unproven' });
  });

  it('reconciles a quiescent post-effect attempt only when both scheduler fences prove effects started', () => {
    const control = {
      control_state: 'REVIEW_REQUIRED',
      active_attempt_id: 'attempt_post_effect',
      active_run_key: 'run_post_effect',
      control_effects_started: true,
    };
    const attempt = {
      id: 'attempt_post_effect',
      run_key: 'run_post_effect',
      status: 'RUNNING',
      effects_started: true,
      material_effect_state: 'EFFECT_STARTED',
    };
    expect(schedulerControlRecoveryDecision(control, attempt, [], {
      allowQuiescentPostEffectProof: true,
    })).toMatchObject({
      ok: true,
      action: 'reconcile_post_effect',
      reason: 'terminal_effect_receipts_quiescent_without_replay',
    });
    expect(schedulerControlRecoveryDecision({ ...control, control_effects_started: false }, attempt, [], {
      allowQuiescentPostEffectProof: true,
    })).toMatchObject({ ok: false, reason: 'scheduler_post_effect_state_unproven' });
    expect(schedulerControlRecoveryDecision(control, { ...attempt, effects_started: false }, [], {
      allowQuiescentPostEffectProof: true,
    })).toMatchObject({ ok: false, reason: 'scheduler_post_effect_state_unproven' });
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
    expect(WORKFLOW).toContain('schedulerControlRecoveryDecision');
    expect(WORKFLOW).toContain('NO_TASK_PRE_EFFECT_PROOF_WORKERS');
    expect(WORKFLOW).toContain("'TASK_NO_EFFECT' | 'GROWTH_ZERO_WRITES' | 'MAINTENANCE_PRE_EFFECT' | 'LEGACY_RECOVER_PRE_EFFECT' | 'INSTANTLY_RETRY_ZERO_WRITES' | 'DISCOVERY_EFFECT_RECONCILIATION'");
    expect(WORKFLOW).toContain("'RECONCILE_NO_REPLAY'");
    expect(WORKFLOW).toContain('ACKNOWLEDGE_POST_EFFECT_NO_REPLAY');
    expect(WORKFLOW).toContain('historical_attempt_replayed: false');
    expect(WORKFLOW).toContain('effects_rolled_back: false');
    expect(WORKFLOW).toContain("material_effect_state: 'FAILED_POST_EFFECT'");
    expect(WORKFLOW).toContain("['GrowthTargetRegistry', ['created_at', 'updated_date']");
    expect(WORKFLOW).toContain('maintenance_failed_run_proves_no_downstream_effects');
    expect(WORKFLOW).toContain('legacy_time_bounded_task_proves_no_effect_started');
    expect(WORKFLOW).toContain('instantly_retry_attempt_has_zero_event_ledger_writes');
    expect(WORKFLOW).toContain('discovery_attempt_zero_writes_and_no_material_authority');
    expect(WORKFLOW).toContain('discovery_terminal_effect_receipts_quiescent_without_replay');
    expect(WORKFLOW).toContain("CostUsageEvent.filter({ source: 'leadDiscoveryAgent'");
    expect(WORKFLOW).toContain("AgentTask.filter({ agent_name: { $in: discoveryAgents }, started_at: { $gte: from, $lte: leaseEnd } }, '-started_at', 100)");
    expect(WORKFLOW).toContain("AgentTask.filter({ agent_name: { $in: discoveryAgents }, started_at: { $gte: afterLease } }, '-started_at', 2)");
    expect(WORKFLOW).not.toContain("AgentTask.filter({ agent_name: { $in: discoveryAgents }, created_date:");
    expect(WORKFLOW).toContain("['first_received_at', 'last_attempt_at', 'processed_at', 'updated_date']");
    expect(WORKFLOW).toContain("['Invoice', ['created_date', 'updated_date', 'issued_at']]");
    expect(WORKFLOW).toContain("control_state: 'REVIEW_REQUIRED'");
    expect(WORKFLOW).toContain("control_state: 'IDLE'");
  });

  it('preserves the request body for hosted worker authentication and scheduler identity', () => {
    for (const source of [INSTANTLY_EVENT_RETRY, INSTANTLY_RECONCILIATION]) {
      expect(source).toContain('await req.clone().json().catch(()=>({}))');
      expect(source).not.toContain('await req.json().catch(()=>({}))');
      expect(source.indexOf('req.clone().json')).toBeLessThan(source.indexOf('claim=await claimSchedulerRun'));
    }
    expect(DLQ.indexOf('createCanonicalAgentTask')).toBeLessThan(DLQ.indexOf('let pending'));
    expect(RECONCILER.indexOf('createCanonicalAgentTask')).toBeLessThan(RECONCILER.indexOf('svc.entities.Invoice.filter'));
    expect(INSTANTLY_EVENT_RETRY.indexOf('const due=')).toBeLessThan(INSTANTLY_EVENT_RETRY.lastIndexOf('markSchedulerEffectStarted'));
    expect(INSTANTLY_EVENT_RETRY).toContain('if(due.length)');
    expect(DISCOVERY_WORKER.indexOf('scheduledDiscoveryWorkPresent')).toBeLessThan(DISCOVERY_WORKER.lastIndexOf('markSchedulerEffectStarted'));
    expect(DISCOVERY_WORKER).toContain('!policy&&!scheduledDiscoveryMayWrite');
  });

  it('versions the DLQ scheduler and makes exhausted replay explicit admin-only', () => {
    expect(DLQ_CFG.automations[0].repeat_interval).toBe(5);
    expect(DLQ_CFG.automations[0].is_active).toBe(true);
    expect(DLQ).toContain('manualReplay && (!gate.isAdmin');
    expect(DLQ).toContain('REPLAY_EXHAUSTED');
    expect(DLQ).toContain('manual_replay_only_for_exhausted');
    expect(DLQ).toContain('const deliveryId = String(dl.delivery_id || dl.id)');
    expect(DLQ).toContain('const effectKey = String(deliveryClaim.attempt_key)');
    expect(DLQ).toContain('"X-CAMBRA-Delivery": deliveryId');
    expect(DLQ).toContain('agent_name: WORKER_AGENT');
  });

  it('observes the P6 reconciler without weakening its Stripe read-only guarantee', () => {
    expect(RECONCILER).toContain("agent_name: RECONCILER_AGENT");
    expect(RECONCILER).toMatch(/stripeRequest\s*\(\s*mode\s*,\s*["']GET["']/);
    expect(RECONCILER).not.toMatch(/stripeRequest\s*\(\s*mode\s*,\s*["']POST["']/);
  });

  it('schema and operator UI expose incident operations without economic authority', () => {
    for (const field of ['dedupe_key', 'idempotency_key', 'recovery_action', 'recovery_attempts', 'resolution_note']) expect(INCIDENT_SCHEMA).toContain(`\"${field}\"`);
    expect(UI).toContain('eclIncidentWorkflow');
    expect(UI).toContain('eclProductionHealth');
    expect(UI).toContain('inspect_scheduler_control');
    expect(UI).toContain('reconcile_scheduler_control');
    expect(UI).toContain('expectedConfirmation');
    expect(UI).toContain('Reconcile without replay');
    expect(UI).toContain('Acknowledge effects and reconcile');
    expect(UI).toContain('row.action === "reconcile_post_effect"');
    expect(UI).toContain('instantlyProviderEventRetryWorker');
    expect(UI).toContain('alwaysOnLeadDiscoveryWorker');
    expect(UI).not.toContain('entities.Invoice');
    expect(UI).not.toContain('entities.SavingsEvidence');
    expect(APP).toContain('/admin/ecl-operations');
    expect(ADMIN).toContain('/admin/ecl-operations');
  });
});
