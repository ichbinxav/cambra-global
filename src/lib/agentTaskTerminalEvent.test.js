import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  AGENT_TASK_TERMINAL_EVENT_PERSISTENCE_GUARANTEE,
  buildCanonicalAgentTerminalEvent,
  buildRootAgentTaskEnvelope,
  inspectCanonicalAgentTerminalEventReplay,
  settleCanonicalAgentTask,
} from '../../base44/shared/agentTaskEnvelope.ts';

const request = () => new Request('https://cambra.invalid/internal');

async function openMaterialTask() {
  const root = await buildRootAgentTaskEnvelope(request(), {
    workflowKey: 'terminal_event_test',
    workflowVersion: 'v1.0.0',
    tenantKey: '_platform',
    processingPurpose: 'test_only',
    functionName: 'terminalEventTest',
    input: { batch: 'batch-1' },
    subjectType: 'TestBatch',
    subjectId: 'batch-1',
    policyContext: { status: 'NOT_APPLICABLE' },
    authorityContext: { status: 'NOT_APPLICABLE' },
    intelligenceContext: { status: 'NOT_APPLICABLE' },
    materialEffect: true,
    effectClass: 'EXECUTE',
    costApplicable: false,
  });
  return {
    ...root,
    id: 'task-terminal-1',
    root_task_id: 'task-terminal-1',
    brand_id: '_platform',
    status: 'running',
    trace_revision: 1,
  };
}

async function settleWithIntent() {
  let stored = await openMaterialTask();
  const updateMany = vi.fn(async (_filter, update) => {
    stored = { ...stored, ...update.$set };
    return { success: true, updated: 1 };
  });
  const get = vi.fn(async () => stored);
  const svc = { entities: { AgentTask: { updateMany, get } } };
  const settled = await settleCanonicalAgentTask(svc, stored, {
    status: 'completed',
    completed_at: '2026-08-21T10:00:00.000Z',
  }, {
    terminalState: 'COMPLETED',
    effectState: 'EXECUTED',
    ambiguityState: 'NONE',
    result: { ok: true, processed: 1 },
    effectRefs: [{ type: 'effect_key', id: 'effect-1' }],
    receiptRefs: [{ type: 'Receipt', id: 'receipt-1' }],
    terminalEvent: {
      eventType: 'agent.task.terminal',
      source: 'agent_task_envelope',
      entityType: 'TestBatch',
      entityId: 'batch-1',
      payload: { processed: 1, api_key: 'must-not-persist' },
    },
  });
  return { settled, updateMany, get, svc };
}

describe('canonical AgentTask terminal Event outbox contract', () => {
  it('does not add outbox state to existing settlements unless explicitly requested', async () => {
    let stored = await openMaterialTask();
    const updateMany = vi.fn(async (_filter, update) => {
      stored = { ...stored, ...update.$set };
      return { success: true, updated: 1 };
    });
    const svc = { entities: { AgentTask: {
      updateMany,
      get: vi.fn(async () => stored),
    } } };
    const settled = await settleCanonicalAgentTask(svc, stored, {
      status: 'failed',
    }, {
      terminalState: 'FAILED',
      effectState: 'FAILED_PRE_EFFECT',
      result: { ok: false, error: 'pre_effect' },
      effectRefs: [],
      receiptRefs: [],
    });
    expect(settled.terminal_event_state).toBeUndefined();
    expect(updateMany.mock.calls[0][1].$set).not.toHaveProperty(
      'terminal_event_intent_json',
    );
  });

  it('persists a deterministic redacted Event intent in the same terminal CAS without publishing Event', async () => {
    const { settled, updateMany, svc } = await settleWithIntent();
    expect(AGENT_TASK_TERMINAL_EVENT_PERSISTENCE_GUARANTEE).toBe(
      'DURABLE_TASK_OUTBOX_INTENT_ONLY_NO_CROSS_ENTITY_EXACTLY_ONCE_GUARANTEE',
    );
    expect(settled).toMatchObject({
      terminal_state: 'COMPLETED',
      trace_revision: 2,
      terminal_event_state: 'PENDING',
      terminal_event_idempotency_key:
        'agent-task-terminal:_platform:task-terminal-1:agent.task.terminal',
      terminal_event_revision: 0,
    });
    expect(settled.terminal_event_payload_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Date.parse(settled.terminal_event_next_attempt_at))
      .toBeGreaterThan(0);
    expect(settled.terminal_event_intent_json).toMatchObject({
      agent_task_id: 'task-terminal-1',
      trace_lineage_state: 'COMPLETE',
      terminal_state: 'COMPLETED',
      effect_refs_json: [{ type: 'effect_key', id: 'effect-1' }],
      receipt_refs_json: [{ type: 'Receipt', id: 'receipt-1' }],
      payload_json: { processed: 1, api_key: '[REDACTED]' },
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][1].$set).toMatchObject({
      terminal_event_state: 'PENDING',
      terminal_event_intent_json: expect.any(Object),
    });
    await expect(settleCanonicalAgentTask(svc, settled, {
      status: 'failed',
    }, {
      terminalState: 'FAILED',
      effectState: 'FAILED_PRE_EFFECT',
      result: { ok: false, error: 'late_rewrite' },
    })).rejects.toThrow('agent_task_terminal_already_settled');
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('derives the same key/hash on retry and detects changed content, duplicates and unscoped reads', async () => {
    const { settled } = await settleWithIntent();
    const first = settled.terminal_event_intent_json;
    const retry = await buildCanonicalAgentTerminalEvent(settled, {
      eventType: 'agent.task.terminal',
      source: 'agent_task_envelope',
      entityType: 'TestBatch',
      entityId: 'batch-1',
      payload: { processed: 1, api_key: 'different-secret' },
    });
    expect(retry.idempotency_key).toBe(first.idempotency_key);
    expect(retry.payload_content_hash).toBe(first.payload_content_hash);
    expect(inspectCanonicalAgentTerminalEventReplay([], retry).state)
      .toBe('NO_OBSERVED_EVENT');
    expect(inspectCanonicalAgentTerminalEventReplay([
      { id: 'event-1', ...first },
    ], retry)).toEqual({
      state: 'MATCHED_REPLAY',
      event_id: 'event-1',
      event_ids: ['event-1'],
      mismatched_fields: [],
    });

    const changed = await buildCanonicalAgentTerminalEvent(settled, {
      eventType: 'agent.task.terminal',
      source: 'agent_task_envelope',
      entityType: 'TestBatch',
      entityId: 'batch-1',
      payload: { processed: 2 },
    });
    expect(changed.idempotency_key).toBe(first.idempotency_key);
    expect(changed.payload_content_hash).not.toBe(first.payload_content_hash);
    expect(inspectCanonicalAgentTerminalEventReplay([
      { id: 'event-1', ...first },
    ], changed)).toMatchObject({
      state: 'CONTENT_CONFLICT',
      event_id: 'event-1',
      mismatched_fields: expect.arrayContaining([
        'payload_content_hash',
        'payload_json',
      ]),
    });
    expect(inspectCanonicalAgentTerminalEventReplay([
      { id: 'event-1', ...first },
      { id: 'event-2', ...first },
    ], retry)).toMatchObject({
      state: 'AMBIGUOUS_DUPLICATES',
      event_ids: ['event-1', 'event-2'],
    });
    expect(() => inspectCanonicalAgentTerminalEventReplay([
      { id: 'wrong-scope', ...first, idempotency_key: 'another-key' },
    ], retry)).toThrow('agent_task_terminal_event_candidate_scope_conflict');
  });

  it('rejects open, forged-tenant and incomplete entity projections', async () => {
    const open = await openMaterialTask();
    const input = {
      eventType: 'agent.task.terminal',
      source: 'agent_task_envelope',
    };
    await expect(buildCanonicalAgentTerminalEvent(open, input))
      .rejects.toThrow('agent_task_terminal_event_requires_settled_task');

    const { settled } = await settleWithIntent();
    await expect(buildCanonicalAgentTerminalEvent({
      ...settled,
      brand_id: 'other-tenant',
    }, input)).rejects.toThrow(
      'agent_task_terminal_event_tenant_scope_conflict',
    );
    await expect(buildCanonicalAgentTerminalEvent(settled, {
      ...input,
      entityType: 'TestBatch',
    })).rejects.toThrow(
      'agent_task_terminal_event_entity_reference_incomplete',
    );
  });

  it('does not claim an outbox intent when terminal settlement loses its CAS', async () => {
    const task = await openMaterialTask();
    const updateMany = vi.fn(async () => ({ success: true, updated: 0 }));
    const get = vi.fn();
    const svc = { entities: { AgentTask: { updateMany, get } } };
    await expect(settleCanonicalAgentTask(svc, task, {
      status: 'completed',
    }, {
      terminalState: 'COMPLETED',
      effectState: 'EXECUTED',
      result: { ok: true },
      effectRefs: [{ type: 'effect_key', id: 'effect-1' }],
      receiptRefs: [{ type: 'Receipt', id: 'receipt-1' }],
      terminalEvent: {
        eventType: 'agent.task.terminal',
        source: 'agent_task_envelope',
      },
    })).rejects.toThrow('agent_task_terminal_settle_conflict');
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects caller patches that forge terminal Event publication state', async () => {
    const task = await openMaterialTask();
    const updateMany = vi.fn();
    const svc = { entities: { AgentTask: {
      updateMany,
      get: vi.fn(),
    } } };
    await expect(settleCanonicalAgentTask(svc, task, {
      status: 'completed',
      terminal_event_state: 'PUBLISHED',
      terminal_event_id: 'forged-event',
    }, {
      terminalState: 'COMPLETED',
      effectState: 'EXECUTED',
      result: { ok: true },
      effectRefs: [{ type: 'effect_key', id: 'effect-1' }],
      receiptRefs: [{ type: 'Receipt', id: 'receipt-1' }],
    })).rejects.toThrow(
      'agent_task_terminal_protected_field_patch_forbidden',
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('fails closed when an OPEN task already contains any terminal Event outbox state', async () => {
    const task = await openMaterialTask();
    const updateMany = vi.fn();
    const svc = { entities: { AgentTask: {
      updateMany,
      get: vi.fn(),
    } } };
    for (const [field, value] of Object.entries({
      terminal_event_state: 'PENDING',
      terminal_event_idempotency_key: 'preexisting-key',
      terminal_event_payload_hash: `sha256:${'a'.repeat(64)}`,
      terminal_event_intent_json: {},
      terminal_event_id: 'event-preexisting',
      terminal_event_revision: 0,
      terminal_event_last_attempt_at: '2026-08-21T10:00:00.000Z',
      terminal_event_next_attempt_at: '2026-08-21T10:00:00.000Z',
      terminal_event_published_at: '2026-08-21T10:00:00.000Z',
      terminal_event_error: 'preexisting-error',
      terminal_event_conflicting_ids_json: ['event-conflict'],
      terminal_event_claim_token: 'claim-preexisting',
      terminal_event_claimed_at: '2026-08-21T10:00:00.000Z',
      terminal_event_lease_expires_at: '2026-08-21T10:05:00.000Z',
    })) {
      await expect(settleCanonicalAgentTask(svc, {
        ...task,
        [field]: value,
      }, { status: 'failed' }, {
        terminalState: 'FAILED',
        effectState: 'FAILED_PRE_EFFECT',
        result: { ok: false },
      })).rejects.toThrow('agent_task_terminal_event_outbox_preexisting');
    }
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('closes both manual dead-letter rejection branches before returning and emits no Event directly', () => {
    const source = fs.readFileSync(
      new URL('../../base44/functions/processWebhookDeadLetters/entry.ts', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(
      /if \(!one\) \{[\s\S]*?task = await settleCanonicalAgentTask\([\s\S]*?effectState: "FAILED_PRE_EFFECT"[\s\S]*?error: "dead_letter_not_found"[\s\S]*?return Response\.json/,
    );
    expect(source).toMatch(
      /if \(one\.status !== "exhausted"\) \{[\s\S]*?task = await settleCanonicalAgentTask\([\s\S]*?effectState: "FAILED_PRE_EFFECT"[\s\S]*?error: "manual_replay_only_for_exhausted"[\s\S]*?return Response\.json/,
    );
    expect(source).not.toContain('createCanonicalAgentEvent');
  });
});
