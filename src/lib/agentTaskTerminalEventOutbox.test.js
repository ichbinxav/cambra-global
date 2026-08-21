import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildRootAgentTaskEnvelope,
  settleCanonicalAgentTask,
} from '../../base44/shared/agentTaskEnvelope.ts';
import {
  AGENT_TASK_TERMINAL_EVENT_RECONCILER_GUARANTEE,
  agentTaskTerminalReconcilerFailureLog,
  reconcileCanonicalAgentTerminalEventOutboxRow,
  stableAgentTaskTerminalWorkerErrorCode,
} from '../../base44/shared/agentTaskTerminalEventOutbox.ts';

const request = () => new Request('https://cambra.invalid/internal');

async function pendingOutboxTask() {
  const root = await buildRootAgentTaskEnvelope(request(), {
    workflowKey: 'outbox_reconciler_test',
    workflowVersion: 'v1.0.0',
    tenantKey: '_platform',
    processingPurpose: 'test_only',
    functionName: 'outboxReconcilerTest',
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
  let stored = {
    ...root,
    id: 'task-outbox-1',
    root_task_id: 'task-outbox-1',
    brand_id: '_platform',
    status: 'running',
    trace_revision: 1,
  };
  const svc = { entities: { AgentTask: {
    updateMany: vi.fn(async (_filter, update) => {
      stored = { ...stored, ...update.$set };
      return { success: true, updated: 1 };
    }),
    get: vi.fn(async () => stored),
  } } };
  stored = await settleCanonicalAgentTask(svc, stored, {
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
      source: 'outboxReconcilerTest',
      entityType: 'TestBatch',
      entityId: 'batch-1',
      payload: { processed: 1 },
    },
  });
  return stored;
}

function memoryService(initialTask, initialEvents = [], options = {}) {
  let task = structuredClone(initialTask);
  const events = initialEvents.map((row) => structuredClone(row));
  const updateMany = vi.fn(async (filter, update) => {
    const matches = Object.entries(filter).every(([key, value]) =>
      task[key] === value
    );
    if (!matches) return { success: true, updated: 0 };
    task = { ...task, ...update.$set };
    if (typeof options.afterUpdate === 'function') {
      task = options.afterUpdate(structuredClone(task), filter, update);
    }
    return { success: true, updated: 1 };
  });
  const get = vi.fn(async () => structuredClone(task));
  const filter = vi.fn(async (query) => {
    if (options.filterError?.()) throw new Error('event_read_unavailable');
    return events.filter((row) =>
      row.brand_id === query.brand_id &&
      row.idempotency_key === query.idempotency_key
    ).slice(0, 2).map((row) => structuredClone(row));
  });
  const create = vi.fn(async (row) => {
    const created = { id: `event-${events.length + 1}`, ...structuredClone(row) };
    if (options.createMode === 'throw_after_insert') {
      events.push(created);
      throw new Error('ambiguous_create_response');
    }
    if (options.createMode === 'throw_without_insert') {
      throw new Error('ambiguous_create_response');
    }
    events.push(created);
    if (options.duplicateAfterCreate) {
      events.push({ ...structuredClone(created), id: 'event-duplicate' });
    }
    return structuredClone(created);
  });
  return {
    svc: { entities: { AgentTask: { updateMany, get }, Event: { filter, create } } },
    events,
    updateMany,
    getTask: () => structuredClone(task),
    create,
  };
}

describe('AgentTask terminal Event outbox reconciler', () => {
  it('preserves the request body for the scheduler authority read', () => {
    const worker = readFileSync(
      'base44/shared/logical/agentTaskTerminalEventReconciler.ts',
      'utf8',
    );
    expect(worker).toContain('await req.clone().json().catch(() => ({}))');
    expect(worker).not.toMatch(/const body = await req\.json\(\)/);
    expect(worker).toContain('terminal_event_next_attempt_at: { $lte:');
    expect(worker).toContain('terminal_event_next_attempt_at: null');
    expect(worker).toContain('initializeMissingNextAttempt');
    expect(worker).toContain('state: "ERROR"');
    expect(worker).toContain('success = counts.worker_errors === 0');
    expect(worker).toContain('console.error(JSON.stringify(failureLog))');
    expect(worker).not.toMatch(/console\.error\([^\n]*,\s*error\s*\)/);
  });

  it('logs only a stable code and safe request id for a raw global worker error', () => {
    const syntheticSecret = ["sk", "-ant-", "X".repeat(24)].join("");
    const error = Object.assign(
      new Error(`datastore body ${syntheticSecret} founder@example.invalid`),
      { cause: { password: 'never-log-this' }, provider_body: syntheticSecret },
    );
    const log = agentTaskTerminalReconcilerFailureLog(error, 'request-safe-001');
    expect(log).toEqual({
      level: 'error',
      event: 'agent_task_terminal_event_reconciler_failed',
      error_code: 'UNEXPECTED_ERROR',
      request_id: 'request-safe-001',
    });
    const serialized = JSON.stringify(log);
    expect(serialized).not.toContain(syntheticSecret);
    expect(serialized).not.toContain('founder@example.invalid');
    expect(serialized).not.toContain('never-log-this');
    expect(stableAgentTaskTerminalWorkerErrorCode(
      new Error('agent_task_terminal_event_transition_conflict'),
    )).toBe('AGENT_TASK_TERMINAL_EVENT_TRANSITION_CONFLICT');
    const unsafeRequest = agentTaskTerminalReconcilerFailureLog(
      error,
      'founder@example.invalid',
    );
    expect(unsafeRequest.request_id).not.toContain('@');
    expect(unsafeRequest.request_id).toMatch(/^[a-f0-9-]{36}$/);
  });

  it('quarantines a deterministically corrupted persisted intent before create', async () => {
    const task = await pendingOutboxTask();
    task.terminal_event_intent_json = {
      ...task.terminal_event_intent_json,
      payload_json: { processed: 999 },
    };
    const memory = memoryService(task);
    await expect(reconcileCanonicalAgentTerminalEventOutboxRow(memory.svc, task))
      .resolves.toMatchObject({
        state: 'REVIEW_REQUIRED',
        reason:
          'INVALID_OUTBOX_AGENT_TASK_TERMINAL_EVENT_TASK_BINDING_CONFLICT',
        event_id: null,
      });
    expect(memory.create).not.toHaveBeenCalled();
    expect(memory.getTask().terminal_event_state).toBe('REVIEW_REQUIRED');

    const invalidKeyTask = await pendingOutboxTask();
    invalidKeyTask.terminal_event_intent_json = {
      ...invalidKeyTask.terminal_event_intent_json,
      event_type: 'not a safe event type!',
    };
    const invalidKey = memoryService(invalidKeyTask);
    await expect(
      reconcileCanonicalAgentTerminalEventOutboxRow(
        invalidKey.svc,
        invalidKeyTask,
      ),
    ).resolves.toMatchObject({
      state: 'REVIEW_REQUIRED',
      reason:
        'INVALID_OUTBOX_INVALID_AGENT_TASK_ENVELOPE_TERMINAL_EVENT_TYPE',
    });
    expect(invalidKey.create).not.toHaveBeenCalled();
  });

  it('fails closed if tenant binding or any claimed patch field drifts on readback', async () => {
    const task = await pendingOutboxTask();
    const tenantDrift = memoryService(task, [], {
      afterUpdate: (row) => ({ ...row, tenant_key: 'other-tenant' }),
    });
    await expect(
      reconcileCanonicalAgentTerminalEventOutboxRow(tenantDrift.svc, task),
    ).rejects.toThrow('agent_task_terminal_event_transition_readback_mismatch');
    expect(tenantDrift.updateMany.mock.calls[0][0]).toMatchObject({
      brand_id: task.brand_id,
      tenant_key: task.tenant_key,
      terminal_event_idempotency_key: task.terminal_event_idempotency_key,
      terminal_event_payload_hash: task.terminal_event_payload_hash,
    });
    expect(tenantDrift.create).not.toHaveBeenCalled();

    const partialPatch = memoryService(task, [], {
      afterUpdate: (row) => {
        const copy = { ...row };
        delete copy.terminal_event_lease_expires_at;
        return copy;
      },
    });
    await expect(
      reconcileCanonicalAgentTerminalEventOutboxRow(partialPatch.svc, task),
    ).rejects.toThrow('agent_task_terminal_event_transition_readback_mismatch');
    expect(partialPatch.create).not.toHaveBeenCalled();
  });

  it('accepts a canonically equal intent read back with reordered JSON keys', async () => {
    const task = await pendingOutboxTask();
    const memory = memoryService(task, [], {
      afterUpdate: (row) => ({
        ...row,
        terminal_event_intent_json: Object.fromEntries(
          Object.entries(row.terminal_event_intent_json).reverse(),
        ),
      }),
    });
    await expect(reconcileCanonicalAgentTerminalEventOutboxRow(memory.svc, task))
      .resolves.toMatchObject({ state: 'PUBLISHED', event_id: 'event-1' });
    expect(memory.create).toHaveBeenCalledTimes(1);
  });

  it('publishes once through CLAIMED and PUBLISHING, then records exact readback', async () => {
    const task = await pendingOutboxTask();
    const memory = memoryService(task);
    const result = await reconcileCanonicalAgentTerminalEventOutboxRow(
      memory.svc,
      task,
    );
    expect(result).toMatchObject({
      state: 'PUBLISHED',
      reason: 'POST_CREATE_MATCHED_REPLAY',
      event_id: 'event-1',
    });
    expect(memory.create).toHaveBeenCalledTimes(1);
    expect(memory.updateMany.mock.calls.map((call) =>
      call[1].$set.terminal_event_state
    )).toEqual(['CLAIMED', 'PUBLISHING', 'PUBLISHED']);
    expect(memory.getTask()).toMatchObject({
      terminal_event_state: 'PUBLISHED',
      terminal_event_revision: 3,
      terminal_event_id: 'event-1',
      terminal_event_claim_token: null,
    });
    expect(AGENT_TASK_TERMINAL_EVENT_RECONCILER_GUARANTEE)
      .toContain('NO_DATASTORE_EXACTLY_ONCE_GUARANTEE');
  });

  it('finalizes an exact pre-existing replay without another Event create', async () => {
    const task = await pendingOutboxTask();
    const memory = memoryService(task, [
      { id: 'event-existing', ...task.terminal_event_intent_json },
    ]);
    const result = await reconcileCanonicalAgentTerminalEventOutboxRow(
      memory.svc,
      task,
    );
    expect(result).toMatchObject({
      state: 'PUBLISHED',
      reason: 'PRE_CREATE_MATCHED_REPLAY',
      event_id: 'event-existing',
    });
    expect(memory.create).not.toHaveBeenCalled();
  });

  it('quarantines a same-key content conflict and ambiguous duplicates', async () => {
    const task = await pendingOutboxTask();
    const conflict = {
      id: 'event-conflict',
      ...task.terminal_event_intent_json,
      payload_content_hash: `sha256:${'f'.repeat(64)}`,
    };
    const one = memoryService(task, [conflict]);
    await expect(reconcileCanonicalAgentTerminalEventOutboxRow(one.svc, task))
      .resolves.toMatchObject({
        state: 'REVIEW_REQUIRED',
        reason: 'PRE_CREATE_CONTENT_CONFLICT',
        event_id: null,
        conflicting_event_ids: ['event-conflict'],
      });
    expect(one.create).not.toHaveBeenCalled();
    expect(one.getTask()).toMatchObject({
      terminal_event_state: 'REVIEW_REQUIRED',
      terminal_event_id: null,
      terminal_event_conflicting_ids_json: ['event-conflict'],
    });

    const duplicate = memoryService(task, [
      { id: 'event-1', ...task.terminal_event_intent_json },
      { id: 'event-2', ...task.terminal_event_intent_json },
    ]);
    await expect(reconcileCanonicalAgentTerminalEventOutboxRow(duplicate.svc, task))
      .resolves.toMatchObject({
        state: 'REVIEW_REQUIRED',
        reason: 'PRE_CREATE_AMBIGUOUS_DUPLICATES',
        event_id: null,
        conflicting_event_ids: ['event-1', 'event-2'],
      });
    expect(duplicate.create).not.toHaveBeenCalled();
  });

  it('recovers a create response error only when exact readback proves the Event', async () => {
    const task = await pendingOutboxTask();
    const recovered = memoryService(task, [], { createMode: 'throw_after_insert' });
    await expect(reconcileCanonicalAgentTerminalEventOutboxRow(recovered.svc, task))
      .resolves.toMatchObject({
        state: 'PUBLISHED',
        reason: 'CREATE_ERROR_RECONCILIATION_MATCHED_REPLAY',
      });
    expect(recovered.create).toHaveBeenCalledTimes(1);

    const ambiguous = memoryService(task, [], { createMode: 'throw_without_insert' });
    await expect(reconcileCanonicalAgentTerminalEventOutboxRow(ambiguous.svc, task))
      .resolves.toMatchObject({
        state: 'REVIEW_REQUIRED',
        reason: 'EVENT_CREATE_OUTCOME_AMBIGUOUS',
      });
    expect(ambiguous.create).toHaveBeenCalledTimes(1);
  });

  it('keeps an unproven create ID only as a review candidate, never a receipt', async () => {
    const task = await pendingOutboxTask();
    let eventReads = 0;
    const memory = memoryService(task, [], {
      filterError: () => ++eventReads >= 2,
    });
    await expect(reconcileCanonicalAgentTerminalEventOutboxRow(memory.svc, task))
      .resolves.toMatchObject({
        state: 'REVIEW_REQUIRED',
        reason: 'EVENT_CREATE_READBACK_UNPROVEN',
        event_id: null,
        conflicting_event_ids: ['event-1'],
      });
    expect(memory.create).toHaveBeenCalledTimes(1);
    expect(memory.getTask()).toMatchObject({
      terminal_event_state: 'REVIEW_REQUIRED',
      terminal_event_id: null,
      terminal_event_conflicting_ids_json: ['event-1'],
    });
  });

  it('reclaims only an expired pre-effect CLAIMED row', async () => {
    const base = await pendingOutboxTask();
    const claimed = {
      ...base,
      terminal_event_state: 'CLAIMED',
      terminal_event_revision: 1,
      terminal_event_claim_token: 'expired-claim',
      terminal_event_claimed_at: '2026-08-20T00:00:00.000Z',
      terminal_event_lease_expires_at: '2026-08-20T00:05:00.000Z',
    };
    const memory = memoryService(claimed);
    const result = await reconcileCanonicalAgentTerminalEventOutboxRow(
      memory.svc,
      claimed,
    );
    expect(result.state).toBe('PUBLISHED');
    expect(memory.create).toHaveBeenCalledTimes(1);
    expect(memory.updateMany.mock.calls[0][1].$set)
      .toMatchObject({ terminal_event_state: 'CLAIMED' });
    expect(memory.updateMany.mock.calls[0][1].$set.terminal_event_claim_token)
      .not.toBe('expired-claim');
  });

  it('never retries an expired PUBLISHING row with no observed Event', async () => {
    const base = await pendingOutboxTask();
    const publishing = {
      ...base,
      terminal_event_state: 'PUBLISHING',
      terminal_event_revision: 2,
      terminal_event_claim_token: 'expired-publishing',
      terminal_event_claimed_at: '2026-08-20T00:00:00.000Z',
      terminal_event_lease_expires_at: '2026-08-20T00:05:00.000Z',
    };
    const memory = memoryService(publishing);
    const result = await reconcileCanonicalAgentTerminalEventOutboxRow(
      memory.svc,
      publishing,
    );
    expect(result).toMatchObject({
      state: 'REVIEW_REQUIRED',
      reason: 'STALE_PUBLISHING_NO_EVENT_REVIEW_REQUIRED',
    });
    expect(memory.create).not.toHaveBeenCalled();
  });

  it('permits only one concurrent claim through the task CAS', async () => {
    const task = await pendingOutboxTask();
    const memory = memoryService(task);
    const outcomes = await Promise.allSettled([
      reconcileCanonicalAgentTerminalEventOutboxRow(memory.svc, task),
      reconcileCanonicalAgentTerminalEventOutboxRow(memory.svc, task),
    ]);
    expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((row) => row.status === 'rejected')).toHaveLength(1);
    expect(outcomes.find((row) => row.status === 'rejected').reason.message)
      .toContain('agent_task_terminal_event_transition_conflict');
    expect(memory.create).toHaveBeenCalledTimes(1);
  });
});
