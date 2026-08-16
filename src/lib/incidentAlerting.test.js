import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  alertRetryDecision,
  buildIncidentAlertBatchPayload,
  dispatchIncidentAlertBatch,
  incidentAlertKey,
  incidentAlertSeverity,
  incidentAlertWindowKey,
  isIncidentAlertingSelfIncident,
  recipientFingerprint,
  selectIncidentAlertBatchCandidates,
} from '../../base44/shared/incidentAlerting.ts';

const BASE_TIME = new Date('2026-08-13T10:00:00.000Z');

function matches(candidate, filter) {
  return Object.entries(filter).every(([key, value]) => candidate[key] === value);
}

function alertControl() {
  return {
    id: 'scheduler_alert_control',
    record_kind: 'CONTROL',
    control_key: 'scheduler-control:incidentAlertingAggregate',
    control_state: 'IDLE',
    control_revision: 0,
    control_token: '',
    control_owner: '',
    control_effects_started: false,
    run_key: 'control:incidentAlertingAggregate',
    worker_key: 'incidentAlertingAggregate',
    cadence_seconds: 900,
    invocation_kind: 'INTERNAL',
    status: 'COMPLETED',
    started_at: BASE_TIME.toISOString(),
    heartbeat_at: BASE_TIME.toISOString(),
    completed_at: BASE_TIME.toISOString(),
  };
}

function criticalIncident(id = 'incident-critical') {
  return {
    id,
    dedupe_key: `runtime:${id}`,
    status: 'open',
    severity: 'critical',
    customer_impact: 'high',
    legal_risk: 'none',
    financial_impact_minor: 0,
    domain: 'worker',
    summary: `Critical incident ${id}`,
    owner_type: 'engineering',
    workflow_state: 'human_review',
    last_seen_at: BASE_TIME.toISOString(),
  };
}

function highIncident(id = 'incident-high') {
  return {
    ...criticalIncident(id),
    severity: 'warning',
    customer_impact: 'high',
    summary: `High incident ${id}`,
  };
}

function scheduledRequest(requestId = crypto.randomUUID()) {
  return new Request('https://example.test/maintenanceEngine', {
    headers: {
      'base44-scheduled-task': 'true',
      'x-request-id': requestId,
    },
  });
}

function internalRequest(key = crypto.randomUUID()) {
  return new Request('https://example.test/maintenanceEngine', {
    headers: {
      'x-cambra-internal': 'true',
      'idempotency-key': key,
    },
  });
}

function createAlertState(options = {}) {
  const stores = {
    SchedulerRun: [alertControl(), ...(options.schedulerRows || [])],
    AutonomyIncident: [...(options.incidents || [criticalIncident()])],
    IncidentAlertDelivery: [...(options.deliveries || [])],
    OutboundControl: options.outboundRows || [{
      id: 'outbound-global',
      control_key: 'global',
      acquisition_enabled: true,
      volume_resend_enabled: true,
      control_revision: 1,
    }],
    EmergencyControl: options.emergencyRows || [{
      id: 'emergency-global',
      control_key: 'global',
      safe_mode: false,
      communications_paused: false,
      negotiations_paused: false,
      migrations_paused: false,
      billing_issuance_paused: false,
      paid_discovery_paused: false,
      resume_check_required: false,
      control_revision: 7,
      updated_at: BASE_TIME.toISOString(),
    }],
  };
  const sequences = Object.fromEntries(
    Object.entries(stores).map(([name, rows]) => [name, rows.length]),
  );
  const faults = {
    failAcceptedUpdateOnce: Boolean(options.failAcceptedUpdateOnce),
    failSchedulerFinalize: Boolean(options.failSchedulerFinalize),
    failEmergencyRead: Boolean(options.failEmergencyRead),
  };

  function api(name) {
    const rows = stores[name];
    return {
      async filter(filter, _order, limit = 5000) {
        if (name === 'EmergencyControl' && faults.failEmergencyRead) {
          throw new Error('injected_emergency_read_failure');
        }
        return rows.filter((row) => matches(row, filter)).slice(0, limit)
          .map((row) => structuredClone(row));
      },
      async list(_order, limit = 5000) {
        return rows.slice(0, limit).map((row) => structuredClone(row));
      },
      async get(id) {
        const row = rows.find((candidate) => candidate.id === id);
        if (!row) throw new Error(`${name}_not_found`);
        return structuredClone(row);
      },
      async create(value) {
        const row = {
          id: `${name}_${++sequences[name]}`,
          created_date: new Date(sequences[name] * 1000).toISOString(),
          ...structuredClone(value),
        };
        rows.push(row);
        return structuredClone(row);
      },
      async update(id, patch) {
        if (
          name === 'IncidentAlertDelivery' && patch?.status === 'ACCEPTED' &&
          faults.failAcceptedUpdateOnce
        ) {
          faults.failAcceptedUpdateOnce = false;
          throw new Error('injected_acceptance_persistence_failure');
        }
        const row = rows.find((candidate) => candidate.id === id);
        if (!row) throw new Error(`${name}_not_found`);
        Object.assign(row, structuredClone(patch));
        return structuredClone(row);
      },
      async updateMany(filter, update) {
        if (
          name === 'SchedulerRun' && faults.failSchedulerFinalize &&
          filter?.record_kind === 'CONTROL' && filter?.control_state === 'RUNNING' &&
          update?.$set?.control_state === 'IDLE'
        ) return { updated: 0 };
        const selected = rows.filter((row) => matches(row, filter));
        for (const row of selected) Object.assign(row, structuredClone(update.$set || {}));
        return { updated: selected.length };
      },
    };
  }

  const svc = {
    entities: Object.fromEntries(Object.keys(stores).map((name) => [name, api(name)])),
    ...(options.senderAvailable === false
      ? {}
      : { integrations: { Core: { SendEmail: vi.fn() } } }),
  };
  return {
    svc,
    stores,
    delivery: () => stores.IncidentAlertDelivery.at(-1),
    alertControl: () => stores.SchedulerRun.find(
      (row) => row.control_key === 'scheduler-control:incidentAlertingAggregate',
    ),
  };
}

describe('aggregated founder incident alerting', () => {
  it('classifies only HIGH/CRITICAL incidents and excludes alerting recursion', () => {
    expect(incidentAlertSeverity({
      severity: 'warning', customer_impact: 'none', legal_risk: 'none',
    })).toBeNull();
    expect(incidentAlertSeverity({ severity: 'warning', customer_impact: 'high' }))
      .toBe('HIGH');
    expect(incidentAlertSeverity({ severity: 'critical' })).toBe('CRITICAL');
    expect(isIncidentAlertingSelfIncident({
      domain: 'incident_alerting', dedupe_key: 'incident-alerting:send-failed',
    })).toBe(true);
  });

  it('preserves legacy key/fingerprint helpers and stable 15-minute windows', () => {
    expect(incidentAlertKey({ id: 'abc' }, 'CRITICAL')).toBe('incident:abc:CRITICAL');
    expect(recipientFingerprint('founder@example.com')).toBe('f***@example.com');
    expect(incidentAlertWindowKey(new Date('2026-08-13T10:14:59.999Z')))
      .toBe('2026-08-13T10:00:00.000Z');
    expect(incidentAlertWindowKey(new Date('2026-08-13T10:15:00.000Z')))
      .toBe('2026-08-13T10:15:00.000Z');
  });

  it('never retries accepted or ambiguous effects blindly', () => {
    for (const status of [
      'ACCEPTED', 'OBSERVED', 'DELIVERED', 'EFFECTING', 'RETRY_PENDING',
      'REVIEW_REQUIRED', 'FAILED',
    ]) expect(alertRetryDecision({ status }).allowed, status).toBe(false);
    expect(alertRetryDecision({
      status: 'BLOCKED', attempt_count: 1,
      next_retry_at: new Date(Date.now() + 60_000).toISOString(),
    }).reason).toBe('retry_cooldown');
  });

  it('deduplicates accepted links, quarantines ambiguous links and excludes self-alerts', () => {
    const incidents = [
      criticalIncident('accepted'),
      criticalIncident('ambiguous'),
      highIncident('new'),
      {
        ...criticalIncident('self'),
        domain: 'incident_alerting',
        details_json: { alerting_origin: true },
      },
    ];
    const selected = selectIncidentAlertBatchCandidates(incidents, [
      {
        status: 'ACCEPTED', severity: 'CRITICAL',
        incident_ids: ['accepted'],
      },
      {
        status: 'REVIEW_REQUIRED', severity: 'CRITICAL',
        incident_ids: ['ambiguous'],
      },
    ]);
    expect(selected.candidates.map((incident) => incident.id)).toEqual(['new']);
    expect(selected.acknowledged_incident_ids).toEqual(['accepted']);
    expect(selected.ambiguous_incident_ids).toEqual(['ambiguous']);
    expect(selected.self_excluded_incident_ids).toEqual(['self']);
  });

  it('aggregates every eligible incident into one accepted provider effect and durable links', async () => {
    const state = createAlertState({
      incidents: [highIncident('high-1'), criticalIncident('critical-1')],
    });
    const sends = [];
    const result = await dispatchIncidentAlertBatch(
      state.svc,
      scheduledRequest('aggregate'),
      {
        now: BASE_TIME,
        recipient: 'founder@example.com',
        send: async (_svc, input, payload) => {
          sends.push({ input, payload });
          return { id: 'provider-accepted-1', status: '202 Accepted' };
        },
      },
    );

    expect(result).toMatchObject({
      attempted: true,
      status: 'ACCEPTED',
      provider_effects: 1,
      delivery_observed: false,
      incident_ids: ['critical-1', 'high-1'],
    });
    expect(sends).toHaveLength(1);
    expect(sends[0].input).toMatchObject({
      event_key: 'incident-alert-batch:2026-08-13T10:00:00.000Z',
      stable_event_key: true,
      source: 'incidentAlerting',
      related_entity_type: 'IncidentAlertDelivery',
    });
    expect(sends[0].payload.subject).toContain('2 operational incidents');
    expect(state.delivery()).toMatchObject({
      status: 'ACCEPTED',
      incident_ids: ['critical-1', 'high-1'],
      provider_message_id: 'provider-accepted-1',
      provider_receipt_json: { delivery_observed: false },
    });
    expect(state.delivery().incident_links_json).toHaveLength(2);
    expect(state.delivery().delivered_at).toBeUndefined();
  });

  it('escapes incident content in the aggregate email body', () => {
    const payload = buildIncidentAlertBatchPayload([
      { ...criticalIncident(), summary: '<script>alert("x")</script>' },
    ], 'CRITICAL', 'founder@example.com');
    expect(payload.body).not.toContain('<script>');
    expect(payload.body).toContain('&lt;script&gt;');
  });

  it('allows only one provider effect across two concurrent cycles', async () => {
    const state = createAlertState();
    const send = vi.fn(async () => ({ id: 'one-effect', status: 'accepted' }));
    const [left, right] = await Promise.all([
      dispatchIncidentAlertBatch(state.svc, scheduledRequest('cycle-left'), {
        now: BASE_TIME, recipient: 'founder@example.com', send,
      }),
      dispatchIncidentAlertBatch(state.svc, scheduledRequest('cycle-right'), {
        now: BASE_TIME, recipient: 'founder@example.com', send,
      }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect([left.status, right.status]).toContain('ACCEPTED');
    expect([left.status, right.status]).toEqual(
      expect.arrayContaining(['ACCEPTED', expect.stringMatching(/BLOCKED|COOLDOWN/)]),
    );
    expect(state.stores.IncidentAlertDelivery).toHaveLength(1);
  });

  it('enforces a rolling cooldown across adjacent scheduler windows', async () => {
    const state = createAlertState();
    const send = vi.fn(async () => ({ id: 'first-effect' }));
    await dispatchIncidentAlertBatch(state.svc, internalRequest('cooldown-first'), {
      now: BASE_TIME, recipient: 'founder@example.com', send,
    });
    state.stores.AutonomyIncident.push({
      ...criticalIncident('new-during-cooldown'),
      last_seen_at: new Date(BASE_TIME.getTime() + 5 * 60_000).toISOString(),
    });
    const second = await dispatchIncidentAlertBatch(
      state.svc,
      internalRequest('cooldown-second'),
      {
        now: new Date(BASE_TIME.getTime() + 10 * 60_000),
        recipient: 'founder@example.com',
        send,
      },
    );
    expect(second).toMatchObject({
      attempted: false,
      status: 'COOLDOWN',
      reason: 'one_provider_effect_per_rolling_15_minutes',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('uses a distinct nested worker authority while maintenanceEngine is already running', async () => {
    const parent = {
      id: 'maintenance-parent-control',
      record_kind: 'CONTROL',
      control_key: 'scheduler-control:maintenanceEngine',
      control_state: 'RUNNING',
      control_revision: 12,
      control_token: 'parent-token',
      control_owner: 'parent-owner',
      control_effects_started: true,
      active_attempt_id: 'parent-attempt',
      worker_key: 'maintenanceEngine',
      status: 'COMPLETED',
      control_expires_at: new Date(Date.now() + 600_000).toISOString(),
    };
    const state = createAlertState({ schedulerRows: [parent] });
    const send = vi.fn(async () => ({ id: 'nested-effect' }));
    const result = await dispatchIncidentAlertBatch(
      state.svc,
      scheduledRequest('nested'),
      { now: BASE_TIME, recipient: 'founder@example.com', send },
    );
    expect(result.status).toBe('ACCEPTED');
    expect(send).toHaveBeenCalledTimes(1);
    expect(state.stores.SchedulerRun.find((row) => row.id === parent.id))
      .toMatchObject({ control_state: 'RUNNING', control_token: 'parent-token' });
  });

  it('fails closed on missing sender, Emergency authority failure and outbound containment', async () => {
    const senderMissing = createAlertState({ senderAvailable: false });
    await expect(dispatchIncidentAlertBatch(
      senderMissing.svc,
      internalRequest('sender-missing'),
      { now: BASE_TIME, recipient: 'founder@example.com' },
    )).resolves.toMatchObject({
      attempted: false,
      status: 'CONFIGURATION_REQUIRED',
      reason: 'EMAIL_SENDER_UNAVAILABLE',
    });

    const emergencyUnavailable = createAlertState({ failEmergencyRead: true });
    const emergencySend = vi.fn();
    const emergency = await dispatchIncidentAlertBatch(
      emergencyUnavailable.svc,
      internalRequest('emergency-unavailable'),
      { now: BASE_TIME, recipient: 'founder@example.com', send: emergencySend },
    );
    expect(emergency).toMatchObject({ attempted: false, status: 'BLOCKED' });
    expect(emergency.reason).toBe('EMERGENCY_CONTROL_PAUSED');
    expect(emergencySend).not.toHaveBeenCalled();

    const outboundContained = createAlertState({
      outboundRows: [{
        id: 'outbound-global', control_key: 'global',
        acquisition_enabled: false, volume_resend_enabled: true,
      }],
    });
    const outboundSend = vi.fn();
    await expect(dispatchIncidentAlertBatch(
      outboundContained.svc,
      internalRequest('outbound-contained'),
      { now: BASE_TIME, recipient: 'founder@example.com', send: outboundSend },
    )).resolves.toMatchObject({
      attempted: false,
      status: 'BLOCKED',
      reason: 'OUTBOUND_COMMUNICATION_CONTAINED',
    });
    expect(outboundSend).not.toHaveBeenCalled();
  });

  it('persists budget denial as BLOCKED but generic provider ambiguity as REVIEW_REQUIRED', async () => {
    const budget = createAlertState();
    const budgetResult = await dispatchIncidentAlertBatch(
      budget.svc,
      internalRequest('budget-denied'),
      {
        now: BASE_TIME,
        recipient: 'founder@example.com',
        send: async () => {
          throw Object.assign(new Error('budget denied before provider'), {
            code: 'COST_BUDGET_BLOCKED',
          });
        },
      },
    );
    expect(budgetResult).toMatchObject({ attempted: true, status: 'BLOCKED' });

    const ambiguous = createAlertState();
    const ambiguousResult = await dispatchIncidentAlertBatch(
      ambiguous.svc,
      internalRequest('provider-ambiguous'),
      {
        now: BASE_TIME,
        recipient: 'founder@example.com',
        send: async () => {
          throw new Error('provider connection reset after request write');
        },
      },
    );
    expect(ambiguousResult).toMatchObject({
      attempted: true,
      status: 'REVIEW_REQUIRED',
      review_required: true,
    });
    expect(ambiguous.delivery()).toMatchObject({
      status: 'REVIEW_REQUIRED', next_retry_at: null,
    });
  });

  it('quarantines provider success plus local persistence failure and never replays', async () => {
    const state = createAlertState({ failAcceptedUpdateOnce: true });
    const send = vi.fn(async () => ({ id: 'provider-success-before-crash' }));
    const first = await dispatchIncidentAlertBatch(
      state.svc,
      internalRequest('persistence-first'),
      { now: BASE_TIME, recipient: 'founder@example.com', send },
    );
    expect(first).toMatchObject({
      attempted: true,
      status: 'REVIEW_REQUIRED',
      provider_effects: 1,
      review_required: true,
    });
    expect(state.delivery()).toMatchObject({
      status: 'REVIEW_REQUIRED',
      next_retry_at: null,
    });
    const replay = await dispatchIncidentAlertBatch(
      state.svc,
      internalRequest('persistence-replay'),
      {
        now: new Date(BASE_TIME.getTime() + 20 * 60_000),
        recipient: 'founder@example.com',
        send,
      },
    );
    expect(replay).toMatchObject({ attempted: false, status: 'REVIEW_REQUIRED' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('surfaces scheduler finalization ambiguity after acceptance without replaying the effect', async () => {
    const state = createAlertState({ failSchedulerFinalize: true });
    const send = vi.fn(async () => ({ id: 'accepted-before-finalize-loss' }));
    await expect(dispatchIncidentAlertBatch(
      state.svc,
      internalRequest('finalize-loss'),
      { now: BASE_TIME, recipient: 'founder@example.com', send },
    )).rejects.toMatchObject({
      code: 'INCIDENT_ALERT_SCHEDULER_FINALIZE_AMBIGUOUS',
      review_required: true,
    });
    expect(state.delivery().status).toBe('ACCEPTED');
    expect(send).toHaveBeenCalledTimes(1);
    state.alertControl().control_expires_at = new Date(0).toISOString();
    const retry = await dispatchIncidentAlertBatch(
      state.svc,
      internalRequest('finalize-loss-retry'),
      {
        now: new Date(BASE_TIME.getTime() + 20 * 60_000),
        recipient: 'founder@example.com',
        send,
      },
    );
    expect(retry).toMatchObject({
      attempted: false,
      status: 'BLOCKED',
      review_required: true,
      reason: 'scheduler_previous_effect_ambiguous',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the bounded delivery history reaches its coverage cap', async () => {
    const deliveries = Array.from({ length: 5000 }, (_, index) => ({
      id: `delivery-${index}`,
      alert_key: `old-${index}`,
      incident_id: `old-incident-${index}`,
      incident_ids: [`old-incident-${index}`],
      severity: 'HIGH',
      channel: 'EMAIL',
      status: 'OBSERVED',
      attempt_count: 1,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
    }));
    const state = createAlertState({ deliveries });
    const send = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(dispatchIncidentAlertBatch(
        state.svc,
        internalRequest('delivery-cap'),
        { now: BASE_TIME, recipient: 'founder@example.com', send },
      )).rejects.toThrow(/incident_alert_delivery_history_coverage_truncated/);
    } finally {
      errorSpy.mockRestore();
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('keeps the implementation on the existing maintenance host and canonical planes', () => {
    const alerting = fs.readFileSync('base44/shared/incidentAlerting.ts', 'utf8');
    const maintenance = fs.readFileSync(
      'base44/functions/maintenanceEngine/entry.ts',
      'utf8',
    );
    const entity = fs.readFileSync(
      'base44/entities/IncidentAlertDelivery.jsonc',
      'utf8',
    );
    expect(maintenance).toContain('dispatchIncidentAlertBatch(s,req)');
    expect(maintenance).not.toContain('dispatchIncidentAlert(s,incident)');
    expect(alerting).toContain("worker_key: INCIDENT_ALERT_BATCH_WORKER_KEY");
    expect(alerting).toContain('sendCostGovernedEmail');
    expect(alerting).toContain('AutonomyIncident.filter');
    expect(alerting).not.toContain('OperationalIncident');
    expect(alerting).toContain("status: 'ACCEPTED'");
    expect(alerting).not.toContain("status: 'DELIVERED'");
    expect(fs.existsSync('base44/functions/founderAlertWorker')).toBe(false);
    expect(entity).toContain('"incident_ids"');
    expect(entity).toContain('"REVIEW_REQUIRED"');
    expect(entity).toContain('ACCEPTED is a provider acknowledgement, not delivery');
    expect(entity).toContain('"role": "__service_role_only__"');
  });
});
