import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import {
  AGENT_TASK_ENVELOPE_VERSION,
  attachCanonicalChildTask,
  buildAgentTaskOutputEnvelope,
  buildAgentTaskTerminalEnvelope,
  buildCanonicalEventTraceEnvelope,
  buildChildAgentTaskEnvelope,
  buildRootAgentTaskEnvelope,
  createCanonicalAgentEvent,
  createCanonicalAgentTask,
  hashAgentTaskProjection,
  inspectAgentTaskLineage,
  settleCanonicalAgentTask,
} from '../../base44/shared/agentTaskEnvelope.ts';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const schema = JSON.parse(read('base44/entities/AgentTask.jsonc'));
const eventSchema = JSON.parse(read('base44/entities/Event.jsonc'));
const inventory = JSON.parse(read('config/agenttask-creator-inventory.json'));
const adaptedCoordinators = [
  'autonomousCompanyOrchestrator',
  'brainOrchestrator',
  'leadOrchestrator',
  'marketingOrchestrator',
  'researchOrchestrator',
];
const adaptedMaterialWorkers = [
  'processWebhookDeadLetters',
  'reconcileRecoverBilling',
  'recoverAutopilotWorker',
];

const request = (headers = {}) => new Request('https://cambra.invalid/internal', { headers });
const rootInput = (overrides = {}) => ({
  workflowKey: 'test_workflow',
  workflowVersion: 'v1.0.0',
  tenantKey: '_platform',
  processingPurpose: 'test_only',
  functionName: 'testCoordinator',
  input: { merchant_id: 'merchant-1' },
  ...overrides,
});

describe('ROOT-OTR-013 minimum-delta AgentTask envelope', () => {
  it('builds server-owned root identities and recursively redacts secret keys before hashing', async () => {
    const first = await buildRootAgentTaskEnvelope(
      request({ 'base44-scheduled-task': 'true', 'base44-automation-id': 'automation-1' }),
      rootInput({ input: { merchant_id: 'm1', nested: { api_key: 'first-secret', value: 4 } } }),
    );
    const second = await buildRootAgentTaskEnvelope(
      request({ 'base44-scheduled-task': 'true', 'base44-automation-id': 'automation-1' }),
      rootInput({ input: { merchant_id: 'm1', nested: { api_key: 'different-secret', value: 4 } } }),
    );

    expect(first).toMatchObject({
      envelope_version: AGENT_TASK_ENVELOPE_VERSION,
      lineage_state: 'PARTIAL',
      workflow_key: 'test_workflow',
      workflow_version: 'v1.0.0',
      step_key: 'root',
      step_index: 0,
      attempt_number: 1,
      trigger_type: 'SCHEDULED',
      trigger_ref: 'automation-1',
      tenant_key: '_platform',
      processing_purpose: 'test_only',
      subject_type: 'Platform',
      subject_id: '_platform',
      policy_context_json: { status: 'UNKNOWN' },
      authority_context_json: { status: 'UNKNOWN' },
      intelligence_context_json: { status: 'UNKNOWN' },
      material_effect: false,
      cost_applicable: false,
      effect_state: 'NOT_APPLICABLE',
      effect_coverage_state: 'NOT_APPLICABLE',
      ambiguity_state: 'NONE',
      terminal_state: 'OPEN',
      trace_revision: 0,
    });
    expect(first.trace_id).toMatch(/^trace:/);
    expect(first.orchestration_id).toMatch(/^orchestration:/);
    expect(first.attempt_token).toMatch(/^attempt:/);
    expect(first.fence_token).toMatch(/^task-fence:/);
    expect(first.input_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.input_hash).toBe(second.input_hash);
    expect(first.trace_id).not.toBe(second.trace_id);
  });

  it('rejects invented policy/authority hashes instead of accepting caller-shaped lineage', async () => {
    await expect(buildRootAgentTaskEnvelope(request(), rootInput({ policySnapshotHash: 'not-a-hash' })))
      .rejects.toThrow('invalid_agent_task_envelope_policy_snapshot_hash');
    await expect(buildRootAgentTaskEnvelope(request(), rootInput({ authoritySnapshotHash: '0'.repeat(63) })))
      .rejects.toThrow('invalid_agent_task_envelope_authority_snapshot_hash');
  });

  it('requires a registered effect class for a material root and preserves explicit context truth states', async () => {
    await expect(buildRootAgentTaskEnvelope(request(), rootInput({ materialEffect: true })))
      .rejects.toThrow('invalid_agent_task_envelope_effect_class');
    const envelope = await buildRootAgentTaskEnvelope(request(), rootInput({
      materialEffect: true,
      effectClass: 'EXECUTE',
      costApplicable: true,
      parentRun: 'SchedulerRun:run-1',
      subjectType: 'Invoice',
      subjectId: 'invoice-1',
      policyContext: { status: 'NOT_APPLICABLE' },
      authorityContext: { status: 'OBSERVED', id: 'authority-1', version: 'v3' },
      intelligenceContext: { status: 'UNKNOWN' },
    }));
    expect(envelope).toMatchObject({
      parent_run: 'SchedulerRun:run-1',
      step: { key: 'root', index: 0, attempt: 1 },
      subject_type: 'Invoice',
      subject_id: 'invoice-1',
      material_effect: true,
      effect_class: 'EXECUTE',
      cost_applicable: true,
      effect_state: 'NOT_STARTED',
      effect_coverage_state: 'UNKNOWN',
      policy_context_json: { status: 'NOT_APPLICABLE' },
      authority_context_json: { status: 'OBSERVED', id: 'authority-1', version: 'v3' },
      intelligence_context_json: { status: 'UNKNOWN' },
    });
  });

  it('fails closed instead of truncating hashed inputs or source/receipt references', async () => {
    await expect(buildRootAgentTaskEnvelope(request(), rootInput({
      input: Array.from({ length: 501 }, (_, index) => index),
    }))).rejects.toThrow('agent_task_projection_array_limit_exceeded');
    await expect(buildRootAgentTaskEnvelope(request(), rootInput({
      input: Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`field_${index}`, index])),
    }))).rejects.toThrow('agent_task_projection_object_limit_exceeded');
    await expect(buildRootAgentTaskEnvelope(request(), rootInput({
      sourceRefs: Array.from({ length: 251 }, (_, index) => ({ type: 'ref', id: `ref-${index}` })),
    }))).rejects.toThrow('agent_task_source_refs_limit_exceeded');
    await expect(hashAgentTaskProjection({ amount: Number.NaN }))
      .rejects.toThrow('agent_task_projection_non_finite_number');
    expect(await hashAgentTaskProjection(undefined)).not.toBe(
      await hashAgentTaskProjection('undefined'),
    );
    expect(await hashAgentTaskProjection([undefined])).not.toBe(
      await hashAgentTaskProjection(['undefined']),
    );
  });

  it('creates a canonical root then binds its durable root_task_id', async () => {
    let stored;
    const create = vi.fn(async (row) => (stored = { ...row, id: 'task-root' }));
    const updateMany = vi.fn(async (_filter, patch) => {
      stored = { ...stored, ...patch.$set };
      return { success: true, updated: 1 };
    });
    const get = vi.fn(async () => stored);
    const svc = { entities: { AgentTask: { create, updateMany, get } } };
    const task = await createCanonicalAgentTask(svc, request(), {
      brand_id: '_platform', agent_name: 'test', task_type: 'test', status: 'running',
    }, rootInput());

    expect(task.root_task_id).toBe('task-root');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      brand_id: '_platform', envelope_version: AGENT_TASK_ENVELOPE_VERSION, lineage_state: 'PARTIAL',
    }));
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-root', trace_revision: 0,
    }), { $set: expect.objectContaining({ root_task_id: 'task-root', trace_revision: 1 }) });
    expect(get).toHaveBeenCalledWith('task-root');
  });

  it('CAS-closes a newly created root when durable root binding fails pre-effect', async () => {
    let stored;
    let updates = 0;
    const svc = { entities: { AgentTask: {
      create: vi.fn(async (row) => (stored = { ...row, id: 'task-root' })),
      updateMany: vi.fn(async (_filter, patch) => {
        updates += 1;
        if (updates === 1) return { success: true, updated: 0 };
        stored = { ...stored, ...patch.$set };
        return { success: true, updated: 1 };
      }),
      get: vi.fn(async () => stored),
    } } };
    await expect(createCanonicalAgentTask(svc, request(), {
      brand_id: '_platform',
      agent_name: 'test',
      task_type: 'test',
      status: 'running',
    }, rootInput({
      materialEffect: true,
      effectClass: 'EXECUTE',
    }))).rejects.toThrow('agent_task_root_bind_conflict');
    expect(updates).toBe(2);
    expect(stored).toMatchObject({
      root_task_id: 'task-root',
      status: 'failed',
      terminal_state: 'FAILED',
      effect_state: 'FAILED_PRE_EFFECT',
      effect_coverage_state: 'COMPLETE',
      ambiguity_state: 'NONE',
      lineage_state: 'PARTIAL',
      trace_revision: 1,
    });
    expect(stored.effect_refs_json).toEqual([]);
    expect(stored.receipt_refs_json).toEqual([]);
  });

  it('fails closed when canonical root readback does not preserve trace ownership', async () => {
    const svc = { entities: { AgentTask: {
      create: vi.fn(async (row) => ({ ...row, id: 'task-root' })),
      updateMany: vi.fn(async () => ({ success: true, updated: 1 })),
      get: vi.fn(async () => ({ id: 'task-root', root_task_id: 'other' })),
    } } };
    await expect(createCanonicalAgentTask(svc, request(), {
      brand_id: '_platform', agent_name: 'test', task_type: 'test', status: 'running',
    }, rootInput())).rejects.toThrow('agent_task_root_readback_mismatch');
  });

  it('keeps legacy lineage UNKNOWN and never infers parent or trace', () => {
    expect(inspectAgentTaskLineage({ id: 'legacy', brand_id: '_platform', status: 'completed' })).toEqual({
      state: 'UNKNOWN',
      legacy: true,
      reason: 'LEGACY_ROW_WITHOUT_ENVELOPE',
      missing: ['envelope_version'],
      invalid: [],
    });
  });

  it('links a child to the exact root trace without promoting the slice to COMPLETE', async () => {
    const parentEnvelope = await buildRootAgentTaskEnvelope(request(), rootInput());
    const parent = { ...parentEnvelope, id: 'parent-1', root_task_id: 'parent-1', brand_id: '_platform' };
    const child = await buildChildAgentTaskEnvelope(parent, {
      stepKey: 'discover', stepIndex: 1, input: { query: 'payments' }, sourceRefs: [{ type: 'function', id: 'leadDiscoveryAgent' }],
    });
    expect(child).toMatchObject({
      lineage_state: 'PARTIAL',
      trace_id: parent.trace_id,
      orchestration_id: parent.orchestration_id,
      root_task_id: 'parent-1',
      parent_task_id: 'parent-1',
      workflow_key: parent.workflow_key,
      step_key: 'discover',
      step_index: 1,
      trigger_type: 'INTERNAL',
      tenant_key: '_platform',
    });
    expect(inspectAgentTaskLineage({ ...child, id: 'child-1' }).state).toBe('PARTIAL');
  });

  it('refuses to inherit an incomplete parent or an invalid step index', async () => {
    const parentEnvelope = await buildRootAgentTaskEnvelope(request(), rootInput());
    const validParent = { ...parentEnvelope, id: 'parent-1', root_task_id: 'parent-1', brand_id: '_platform' };
    const incompleteParent = { ...validParent, trace_id: undefined };
    await expect(buildChildAgentTaskEnvelope(incompleteParent, { stepKey: 'discover', stepIndex: 1, input: {} }))
      .rejects.toThrow('parent_agent_task_lineage_unknown');
    await expect(buildChildAgentTaskEnvelope(validParent, { stepKey: 'discover', stepIndex: Number.NaN, input: {} }))
      .rejects.toThrow('invalid_agent_task_envelope_step_index');
  });

  it('attaches only same-tenant children and rejects conflicting existing lineage', async () => {
    const parentEnvelope = await buildRootAgentTaskEnvelope(request(), rootInput());
    const parent = { ...parentEnvelope, id: 'parent-1', root_task_id: 'parent-1', brand_id: '_platform' };
    let sameTenantRow = { id: 'child-1', brand_id: '_platform' };
    const updateMany = vi.fn(async (_filter, patch) => {
      sameTenantRow = { ...sameTenantRow, ...patch.$set };
      return { success: true, updated: 1 };
    });
    const sameTenant = { entities: { AgentTask: { get: vi.fn(async () => sameTenantRow), updateMany } } };
    await attachCanonicalChildTask(sameTenant, 'child-1', parent, { stepKey: 'one', stepIndex: 1, input: {} });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ id: 'child-1' }), { $set: expect.objectContaining({ parent_task_id: 'parent-1' }) });

    const otherTenant = { entities: { AgentTask: { get: vi.fn(async () => ({ id: 'child-2', brand_id: 'other' })), update: vi.fn() } } };
    await expect(attachCanonicalChildTask(otherTenant, 'child-2', parent, { stepKey: 'two', stepIndex: 2, input: {} }))
      .rejects.toThrow('child_agent_task_tenant_scope_conflict');

    const incomplete = { entities: { AgentTask: { get: vi.fn(async () => ({ id: 'child-incomplete', brand_id: '_platform', envelope_version: AGENT_TASK_ENVELOPE_VERSION, trace_id: parent.trace_id, parent_task_id: parent.id })), update: vi.fn() } } };
    await expect(attachCanonicalChildTask(incomplete, 'child-incomplete', parent, { stepKey: 'three', stepIndex: 3, input: {} }))
      .rejects.toThrow('existing_child_agent_task_lineage_invalid');

    const noLineageState = await buildChildAgentTaskEnvelope(parent, { stepKey: 'three', stepIndex: 3, input: {} });
    delete noLineageState.lineage_state;
    const stateMissing = { entities: { AgentTask: { get: vi.fn(async () => ({ ...noLineageState, id: 'child-state-missing', brand_id: '_platform' })), update: vi.fn() } } };
    await expect(attachCanonicalChildTask(stateMissing, 'child-state-missing', parent, { stepKey: 'three', stepIndex: 3, input: {} }))
      .rejects.toThrow('existing_child_agent_task_lineage_invalid');

    const validEnvelope = await buildChildAgentTaskEnvelope(parent, { stepKey: 'three', stepIndex: 3, input: {} });
    const conflicting = { entities: { AgentTask: { get: vi.fn(async () => ({ ...validEnvelope, id: 'child-3', brand_id: '_platform', trace_id: 'other' })), update: vi.fn() } } };
    await expect(attachCanonicalChildTask(conflicting, 'child-3', parent, { stepKey: 'three', stepIndex: 3, input: {} }))
      .rejects.toThrow('child_agent_task_lineage_conflict');

    const noUpdate = vi.fn();
    const existing = { entities: { AgentTask: { get: vi.fn(async () => ({ ...validEnvelope, id: 'child-valid', brand_id: '_platform' })), update: noUpdate } } };
    await expect(attachCanonicalChildTask(existing, 'child-valid', parent, { stepKey: 'three', stepIndex: 3, input: {} }))
      .resolves.toMatchObject({ id: 'child-valid', parent_task_id: parent.id });
    expect(noUpdate).not.toHaveBeenCalled();
  });

  it('offers a deterministic output hash without claiming complete lineage', async () => {
    const first = await buildAgentTaskOutputEnvelope({ ok: true, value: 4 });
    const second = await buildAgentTaskOutputEnvelope({ value: 4, ok: true });
    expect(first.output_hash).toBe(second.output_hash);
    expect(first.output_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toHaveProperty('lineage_state', 'COMPLETE');
  });

  it('binds terminal effect, cost and receipt refs and never promotes incomplete material lineage', async () => {
    const root = await buildRootAgentTaskEnvelope(request(), rootInput({
      materialEffect: true,
      effectClass: 'SPEND',
      costApplicable: true,
      policyContext: { status: 'OBSERVED', id: 'policy-1' },
      authorityContext: { status: 'OBSERVED', id: 'authority-1' },
      intelligenceContext: { status: 'NOT_APPLICABLE' },
    }));
    const task = {
      ...root,
      id: 'task-1',
      root_task_id: 'task-1',
      brand_id: '_platform',
      trace_revision: 1,
    };
    await expect(buildAgentTaskTerminalEnvelope(task, {
      terminalState: 'COMPLETED', effectState: 'EXECUTED', result: { ok: true },
      costRecordRefs: [{ type: 'CostUsageEvent', id: 'cost-1' }],
      effectRefs: [{ type: 'effect_key', id: 'effect-1' }],
      receiptRefs: [], effectCoverageComplete: true,
    })).rejects.toThrow('agent_task_executed_effect_and_receipt_required');

    const partial = await buildAgentTaskTerminalEnvelope(task, {
      terminalState: 'COMPLETED', effectState: 'EXECUTED', result: { ok: true },
      costRecordRefs: [{ type: 'CostUsageEvent', id: 'cost-1' }],
      effectRefs: [{ type: 'effect_key', id: 'effect-1' }],
      receiptRefs: [{ type: 'provider_receipt', id: 'receipt-1' }],
      effectCoverageComplete: false,
    });
    // Caller booleans are not authority. Complete durable refs + coherent
    // terminal/effect states determine coverage even when the deprecated flag
    // says false.
    expect(partial).toMatchObject({ lineage_state: 'COMPLETE', effect_coverage_state: 'COMPLETE' });

    const complete = await buildAgentTaskTerminalEnvelope(task, {
      terminalState: 'COMPLETED', effectState: 'EXECUTED', result: { ok: true },
      costRecordRefs: [{ type: 'CostUsageEvent', id: 'cost-1' }],
      effectRefs: [{ type: 'effect_key', id: 'effect-1' }],
      receiptRefs: [{ type: 'provider_receipt', id: 'receipt-1' }],
      effectCoverageComplete: true,
    });
    expect(complete).toMatchObject({
      lineage_state: 'COMPLETE',
      terminal_state: 'COMPLETED',
      effect_state: 'EXECUTED',
      effect_coverage_state: 'COMPLETE',
      ambiguity_state: 'NONE',
    });
    expect(complete.terminal_result_hash).toMatch(/^[a-f0-9]{64}$/);

    const contradictory = await buildAgentTaskTerminalEnvelope(task, {
      terminalState: 'COMPLETED', effectState: 'FAILED_PRE_EFFECT',
      ambiguityState: 'NONE', result: { ok: false },
      effectCoverageComplete: true,
    });
    expect(contradictory).toMatchObject({
      lineage_state: 'PARTIAL',
      effect_coverage_state: 'PARTIAL',
      terminal_state: 'COMPLETED',
      effect_state: 'FAILED_PRE_EFFECT',
    });
  });

  it('forces post-effect ambiguity and exact terminal readback', async () => {
    const root = await buildRootAgentTaskEnvelope(request(), rootInput({
      materialEffect: true,
      effectClass: 'EXECUTE',
      policyContext: { status: 'NOT_APPLICABLE' },
      authorityContext: { status: 'OBSERVED', id: 'authority-1' },
      intelligenceContext: { status: 'NOT_APPLICABLE' },
    }));
    const task = {
      ...root,
      id: 'task-1',
      root_task_id: 'task-1',
      brand_id: '_platform',
      trace_revision: 1,
    };
    await expect(buildAgentTaskTerminalEnvelope(task, {
      terminalState: 'FAILED', effectState: 'FAILED_POST_EFFECT', ambiguityState: 'NONE',
      result: { ok: false }, effectRefs: [{ type: 'effect_key', id: 'effect-1' }],
    })).rejects.toThrow('agent_task_post_effect_ambiguity_required');
    await expect(buildAgentTaskTerminalEnvelope(task, {
      terminalState: 'FAILED', effectState: 'FAILED_PRE_EFFECT', ambiguityState: 'NONE',
      result: { ok: false }, effectRefs: [{ type: 'effect_key', id: 'effect-1' }],
    })).rejects.toThrow('agent_task_pre_effect_cannot_bind_effect_receipt');

    let stored = { ...task };
    const svc = { entities: { AgentTask: {
      updateMany: vi.fn(async (_filter, patch) => {
        stored = { ...stored, ...patch.$set };
        return { success: true, updated: 1 };
      }),
      get: vi.fn(async () => ({ ...stored, terminal_result_hash: '0'.repeat(64) })),
    } } };
    await expect(settleCanonicalAgentTask(svc, task, { trace_id: 'attacker-trace' }, {
      terminalState: 'FAILED', effectState: 'FAILED_PRE_EFFECT', ambiguityState: 'NONE',
      result: { ok: false }, effectCoverageComplete: true,
    })).rejects.toThrow('agent_task_terminal_protected_field_patch_forbidden');
    await expect(settleCanonicalAgentTask(svc, task, {
      brand_id: 'other-tenant',
      source_refs_json: [{ type: 'attacker', id: 'forged' }],
      policy_context_json: { status: 'NOT_APPLICABLE' },
    }, {
      terminalState: 'FAILED', effectState: 'FAILED_PRE_EFFECT', ambiguityState: 'NONE',
      result: { ok: false },
    })).rejects.toThrow('agent_task_terminal_protected_field_patch_forbidden');
    await expect(settleCanonicalAgentTask(svc, task, { status: 'failed' }, {
      terminalState: 'FAILED', effectState: 'FAILED_PRE_EFFECT', ambiguityState: 'NONE',
      result: { ok: false }, effectCoverageComplete: true,
    })).rejects.toThrow('agent_task_terminal_readback_mismatch');
  });

  it('allows only one concurrent terminal settlement for the same trace fence', async () => {
    const root = await buildRootAgentTaskEnvelope(request(), rootInput({
      materialEffect: true,
      effectClass: 'EXECUTE',
      policyContext: { status: 'NOT_APPLICABLE' },
      authorityContext: { status: 'OBSERVED', id: 'authority-1' },
      intelligenceContext: { status: 'NOT_APPLICABLE' },
    }));
    let stored = {
      ...root,
      id: 'task-1',
      root_task_id: 'task-1',
      brand_id: '_platform',
      trace_revision: 1,
    };
    const svc = { entities: { AgentTask: {
      updateMany: vi.fn(async (filter, patch) => {
        if (stored.trace_revision !== filter.trace_revision) {
          return { success: true, updated: 0 };
        }
        stored = { ...stored, ...patch.$set };
        return { success: true, updated: 1 };
      }),
      get: vi.fn(async () => stored),
    } } };
    const settle = () => settleCanonicalAgentTask(svc, {
      ...root,
      id: 'task-1',
      root_task_id: 'task-1',
      brand_id: '_platform',
      trace_revision: 1,
    }, { status: 'failed' }, {
      terminalState: 'FAILED',
      effectState: 'FAILED_PRE_EFFECT',
      ambiguityState: 'NONE',
      result: { ok: false, reason: 'pre_effect_test' },
      effectCoverageComplete: true,
    });
    const outcomes = await Promise.allSettled([settle(), settle()]);
    expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((row) => row.status === 'rejected')).toHaveLength(1);
    expect(outcomes.find((row) => row.status === 'rejected').reason.message)
      .toContain('agent_task_terminal_settle_conflict');
    expect(stored.trace_revision).toBe(2);
  });

  it('projects the exact canonical task trace into Event and blocks cross-tenant writes', async () => {
    const root = await buildRootAgentTaskEnvelope(request(), rootInput({
      policyContext: { status: 'NOT_APPLICABLE' },
      authorityContext: { status: 'NOT_APPLICABLE' },
      intelligenceContext: { status: 'NOT_APPLICABLE' },
    }));
    const task = { ...root, id: 'task-1', root_task_id: 'task-1', brand_id: '_platform' };
    expect(buildCanonicalEventTraceEnvelope(task)).toMatchObject({
      trace_envelope_version: AGENT_TASK_ENVELOPE_VERSION,
      trace_id: task.trace_id,
      parent_run: 'task-1',
      tenant_key: '_platform',
      subject_type: 'Platform',
      subject_id: '_platform',
      input_hash: task.input_hash,
      agent_task_id: 'task-1',
    });
    const create = vi.fn(async (row) => ({ ...row, id: 'event-1' }));
    const svc = { entities: { Event: { create } } };
    await createCanonicalAgentEvent(svc, task, {
      brand_id: '_platform', event_type: 'test.completed', source: 'test',
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      agent_task_id: 'task-1', trace_id: task.trace_id,
    }));
    await expect(createCanonicalAgentEvent(svc, task, {
      brand_id: 'other', event_type: 'test.completed', source: 'test',
    })).rejects.toThrow('agent_task_event_tenant_scope_conflict');
  });

  it('extends AgentTask/Event additively and preserves the selected canonical writers', () => {
    for (const field of [
      'envelope_version', 'lineage_state', 'trace_id', 'orchestration_id', 'root_task_id', 'parent_task_id',
      'parent_run', 'workflow_key', 'workflow_version', 'step_key', 'step_index', 'step', 'attempt_number',
      'attempt_token', 'fence_token', 'trigger_type', 'trigger_ref', 'tenant_key', 'subject_type', 'subject_id',
      'processing_purpose', 'input_hash', 'output_hash', 'policy_snapshot_id', 'policy_snapshot_hash',
      'authority_snapshot_id', 'authority_snapshot_hash', 'intelligence_snapshot_id', 'intelligence_snapshot_hash',
      'policy_context_json', 'authority_context_json', 'intelligence_context_json', 'material_effect', 'effect_class',
      'cost_applicable', 'effect_state', 'effect_coverage_state', 'ambiguity_state', 'terminal_state',
      'terminal_result_hash', 'terminal_result_json', 'cost_record_refs_json', 'effect_refs_json', 'receipt_refs_json',
      'terminal_event_state', 'terminal_event_idempotency_key', 'terminal_event_payload_hash',
      'terminal_event_intent_json', 'terminal_event_id', 'terminal_event_revision', 'trace_revision',
      'terminal_event_last_attempt_at', 'terminal_event_next_attempt_at',
      'terminal_event_published_at', 'terminal_event_error',
      'terminal_event_conflicting_ids_json', 'terminal_event_claim_token', 'terminal_event_claimed_at',
      'terminal_event_lease_expires_at',
      'deadline_at', 'heartbeat_at', 'source_refs_json',
    ]) expect(schema.properties[field]).toBeTruthy();
    for (const field of [
      'trace_envelope_version', 'trace_lineage_state', 'trace_id', 'parent_run', 'step', 'tenant_key',
      'subject_type', 'subject_id', 'input_hash', 'policy_context_json', 'authority_context_json',
      'intelligence_context_json', 'cost_record_refs_json', 'effect_refs_json', 'receipt_refs_json',
      'terminal_result_hash', 'terminal_result_json', 'terminal_state', 'ambiguity_state',
    ]) expect(eventSchema.properties[field]).toBeTruthy();
    expect(schema.required).toEqual(['brand_id', 'agent_name', 'task_type', 'status']);
    expect(eventSchema.required).toEqual(['brand_id', 'event_type', 'source']);

    // 2026-08-18 — some logical routes now live in base44/shared/logical/<name>.ts
    // (the function directory keeps a re-export so hosts stay inside their bundle).
    // Read the implementation wherever it actually is; the assertions are unchanged.
    const readRoute = (name) => {
      const logical = `base44/shared/logical/${name}.ts`;
      return fs.existsSync(new URL(`../../${logical}`, import.meta.url))
        ? read(logical)
        : read(`base44/functions/${name}/entry.ts`);
    };
    for (const name of adaptedCoordinators) {
      const source = readRoute(name);
      expect(source).toContain('createCanonicalAgentTask');
      expect(source).toContain('attachCanonicalChildTask');
      expect(source).not.toContain('.entities.AgentTask.create(');
      expect(source).not.toContain('AgentRun');
    }
    for (const name of adaptedMaterialWorkers) {
      const source = readRoute(name);
      expect(source).toContain('createCanonicalAgentTask');
      expect(source).toContain('settleCanonicalAgentTask');
      expect(source).not.toContain('.entities.AgentTask.create(');
    }
  });

  it('keeps a reproducible source inventory and OTR-013 honestly NOT_MET', () => {
    const root = new URL('../../', import.meta.url).pathname;
    /* global process */
    const output = execFileSync(process.execPath, ['scripts/generate-agenttask-creator-inventory.mjs', '--check'], { cwd: root, encoding: 'utf8' });
    expect(output).toContain('agenttask-creator-inventory:check PASS');
    expect(inventory.counts.creator_files).toBe(60);
    expect(inventory.counts.material_creator_files).toBe(46);
    expect(inventory.counts.legacy_creator_files).toBe(14);
    expect(inventory.counts.root_envelope_adapted_files).toBe(8);
    expect(inventory.counts.material_terminal_adapted_files).toBe(3);
    expect(inventory.counts.material_event_adapted_files).toBe(3);
    expect(inventory.counts.material_trace_adapted_files).toBe(3);
    // 111 -> 107 (2026-08-18): four hosted route files now resolve at their
    // canonical base44/shared/logical/ path instead of a function directory.
    expect(inventory.counts.unresolved_material_route_files).toBe(104);
    expect(inventory.measurement_semantics.material_route_files).toBe(
      'UNION_OF_EXISTING_REGISTRY_SOURCE_EVIDENCE_AND_MATERIAL_SCHEDULED_ROUTE_FILES_NOT_DISTINCT_PHYSICAL_EXECUTORS',
    );
    expect(inventory.measurement_semantics.unresolved_material_route_files).toBe(
      'REGISTRY_DERIVED_SOURCE_FILES_WITHOUT_FULL_SOURCE_LOCAL_ROOT_TERMINAL_EVENT_ADAPTER_SURFACE',
    );
    expect(inventory.counts.not_adapted_files).toBeGreaterThan(0);
    const terminalAdaptedMaterialCreators = inventory.creators.filter((row) =>
      row.classification === 'MATERIAL_BOUNDARY_CREATOR' &&
      row.terminal_adapter_present
    );
    expect(terminalAdaptedMaterialCreators.map((row) => row.path)).toEqual([
      'base44/functions/processWebhookDeadLetters/entry.ts',
      'base44/functions/reconcileRecoverBilling/entry.ts',
      'base44/functions/recoverAutopilotWorker/entry.ts',
    ]);
    expect(terminalAdaptedMaterialCreators.every((row) =>
      row.trace_status === 'MATERIAL_TRACE_ADAPTED_LOCAL' &&
      row.event_adapter_present === true &&
      row.terminal_event_intent_coverage === true &&
      row.canonical_event_outbox_intent_sites === row.canonical_terminal_sites &&
      row.complete_local_adapter_surface === true
    )).toBe(true);
    expect(inventory.root_otr_013).toMatchObject({
      implementation_status: 'PARTIAL',
      binary_closure_status: 'NOT_MET',
      local_test_status: 'PASSED_LOCAL',
      verification_level: 'LOCAL_FAILURE_INJECTION',
    });
    expect(inventory.root_otr_013.material_creator_blockers.length).toBeGreaterThan(0);
    expect(inventory.root_otr_013.material_route_blockers.length).toBeGreaterThan(0);
    expect(inventory.compatibility).toEqual({
      legacy_row_lineage: 'UNKNOWN',
      v1_envelope_lineage: 'PARTIAL_UNTIL_EXPLICIT_V2_RECONCILIATION',
      implicit_parent_inference: false,
      implicit_trace_inference: false,
      implicit_effect_receipt_inference: false,
      backfill_performed: false,
    });
  });
});
