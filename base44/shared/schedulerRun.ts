import {
  MATERIAL_EFFECT_CONTRACT_VERSION,
  projectMaterialEffectState,
  schedulerMaterialEffectState,
} from './materialEffectContract.ts';

export const SCHEDULER_GUARD_VERSION = 'scheduler-guard-2.1.0';
export const SCHEDULER_CONTROL_VERSION = 'scheduler-control-cas-v3.0.0';
export const SCHEDULER_DEFAULT_LEASE_SECONDS = 900;
export const SCHEDULER_HEARTBEAT_MAX_SECONDS = 120;

type ScheduledGuardSpec = {
  worker_key: string;
  cadence_seconds: number;
  lease_seconds?: number;
  routes?: Record<string, {
    worker_key: string;
    cadence_seconds: number;
    lease_seconds?: number;
  }>;
};
const ACTIVE_REQUEST_CLAIMS = new WeakMap<Request, any>();
const PROVEN_DUPLICATE_REASONS = new Set([
  'same_worker_same_cadence_slot',
  'same_logical_operation',
  'worker_single_flight_active',
]);

/** A rejected claim is benign only when the scheduler authority proved that
 * this exact logical invocation is already running or already terminal. Read
 * failures, duplicate controls, CAS conflicts and fence loss are operational
 * failures: callers must not acknowledge them as successful duplicates. */
export function schedulerClaimDeniedResponse(claim: any): Response | null {
  if (claim?.allowed === true) return null;
  const reason = String(claim?.reason || 'scheduler_claim_unknown');
  if (
    claim?.duplicate === true && claim?.duplicate_proven === true &&
    PROVEN_DUPLICATE_REASONS.has(reason)
  ) {
    return Response.json({
      ok: true,
      duplicate_blocked: true,
      duplicate_proven: true,
      reason,
      run_key: claim?.run_key || null,
    });
  }
  return Response.json({
    ok: false,
    error: 'scheduler_claim_not_authorized',
    duplicate_blocked: false,
    duplicate_proven: false,
    review_required: claim?.review_required === true,
    reason,
    run_key: claim?.run_key || null,
  }, { status: 503 });
}

export function schedulerHttpResponseSucceeded(response: Response) {
  return response.status >= 200 && response.status < 300;
}

/** Wraps the actual Deno entry boundary, so every scheduled invocation claims
 * its cadence slot before the legacy handler can perform side effects. Manual
 * and authenticated internal invocations preserve their existing contract. */
export function guardedScheduledServe(
  spec: ScheduledGuardSpec,
  clientFactory: (req: Request) => any,
  handler: (req: Request) => Response | Promise<Response>,
) {
  Deno.serve(async (req: Request) => {
    if (invocationKind(req) !== 'SCHEDULED') return handler(req);
    const payload = await req.clone().json().catch(() => ({} as any));
    const routed = spec.routes
      ?.[String(payload?.host_action || payload?.hosted_worker || '')];
    const selected = routed || spec;
    const svc = clientFactory(req).asServiceRole;
    const claim = await claimSchedulerRun(svc, req, {
      worker_key: selected.worker_key,
      cadence_seconds: selected.cadence_seconds,
      lease_seconds: selected.lease_seconds,
    });
    const rejected = schedulerClaimDeniedResponse(claim);
    if (rejected) return rejected;
    const startedClaim = await markSchedulerEffectStarted(svc, claim);
    const startRejected = schedulerClaimDeniedResponse(startedClaim);
    if (startRejected) return startRejected;
    ACTIVE_REQUEST_CLAIMS.set(req, startedClaim);
    const heartbeatEvery = Math.max(
      30_000,
      Math.min(
        SCHEDULER_HEARTBEAT_MAX_SECONDS * 1000,
        Math.floor(
          Number(startedClaim.lease_seconds || SCHEDULER_DEFAULT_LEASE_SECONDS) *
            1000 / 3,
        ),
      ),
    );
    let heartbeatFailure: any = null;
    const heartbeatTimer = setInterval(() => {
      void heartbeatSchedulerRun(svc, startedClaim).then((result) => {
        if (!result?.ok) {
          heartbeatFailure = result ||
            { ok: false, reason: 'scheduler_heartbeat_unknown' };
        }
      }).catch(() => {
        heartbeatFailure = {
          ok: false,
          reason: 'scheduler_heartbeat_unavailable',
        };
      });
    }, heartbeatEvery);
    try {
      const response = await handler(req);
      const finalHeartbeat = await heartbeatSchedulerRun(svc, startedClaim).catch(
        () => ({ ok: false, reason: 'scheduler_final_heartbeat_unavailable' }),
      );
      if (!finalHeartbeat?.ok) heartbeatFailure = finalHeartbeat;
      const finished = await finishSchedulerRun(svc, startedClaim, {
        http_status: response.status,
        ...(heartbeatFailure ? { heartbeat_failure: heartbeatFailure.reason } : {}),
      }, schedulerHttpResponseSucceeded(response) && !heartbeatFailure);
      if (heartbeatFailure || !finished?.ok) {
        return Response.json({
          ok: false,
          error: 'scheduler_execution_evidence_ambiguous',
          duplicate_blocked: false,
          duplicate_proven: false,
          review_required: true,
          reason: heartbeatFailure?.reason || finished?.reason ||
            'scheduler_finalize_unknown',
          run_key: startedClaim.run_key,
        }, { status: 503 });
      }
      return response;
    } catch (error) {
      const finished = await finishSchedulerRun(svc, startedClaim, {
        error_code: 'scheduled_handler_failed',
      }, false);
      if (!finished?.ok) {
        schedulerAuthorityFailure(
          'scheduler_handler_failure_finalize',
          new Error(finished?.reason || 'scheduler_failure_finalize_unknown'),
        );
        return Response.json({
          ok: false,
          error: 'scheduler_execution_evidence_ambiguous',
          duplicate_blocked: false,
          duplicate_proven: false,
          review_required: true,
          reason: finished?.reason || 'scheduler_failure_finalize_unknown',
          handler_error: 'scheduled_handler_failed',
          run_key: startedClaim.run_key,
        }, { status: 503 });
      }
      throw error;
    } finally {
      clearInterval(heartbeatTimer);
      ACTIVE_REQUEST_CLAIMS.delete(req);
    }
  });
}

function invocationKind(req: Request) {
  if (
    String(req.headers.get('base44-scheduled-task') || '').toLowerCase() ===
      'true'
  ) return 'SCHEDULED';
  if (req.headers.get('base44-automation-id')) return 'SCHEDULED';
  if (req.headers.get('x-cambra-internal')) return 'INTERNAL';
  return 'MANUAL';
}

function updatedExactlyOne(result: any) {
  if (!result || typeof result !== 'object') return false;
  const explicitStatuses = ['success', 'ok']
    .filter((key) => Object.prototype.hasOwnProperty.call(result, key))
    .map((key) => result[key]);
  // An explicit provider failure is authoritative even when a counter claims
  // that one row changed. Treat mixed status/counter responses as unproven.
  if (explicitStatuses.some((value) => value !== true)) return false;
  const observed = ['updated', 'modified_count', 'matched_count']
    .filter((key) => result[key] !== undefined && result[key] !== null)
    .map((key) => Number(result[key]));
  // A provider response with contradictory counters is ambiguous, even when
  // one field says one row. Every counter actually returned must be a valid
  // integer and agree that exactly one durable row was fenced.
  return observed.length > 0 && observed.every((value) =>
    Number.isInteger(value) && value === 1
  );
}

function schedulerOwner(req: Request, workerKey: string) {
  return String(
    req.headers.get('base44-automation-id') ||
      req.headers.get('x-cambra-request-id') ||
      req.headers.get('x-request-id') || `${workerKey}:${crypto.randomUUID()}`,
  ).slice(0, 300);
}

function schedulerAuthorityFailure(operation: string, error: unknown) {
  const code = String(
    (error as { code?: unknown; name?: unknown })?.code ||
      (error as { name?: unknown })?.name || 'Error',
  ).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'Error';
  console.error(JSON.stringify({
    level: 'error',
    event: 'scheduler_authority_operation_failed',
    operation,
    error_code: code,
    message: String(
      (error as { message?: unknown })?.message || error || 'unknown',
    ).slice(0, 500),
  }));
}

async function authorityOperation<T>(
  operation: string,
  run: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; value: null }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    schedulerAuthorityFailure(operation, error);
    return { ok: false, value: null };
  }
}

async function schedulerControl(svc: any, workerKey: string, cadence: number) {
  const controlKey = `scheduler-control:${workerKey}`;
  const initialRead = await authorityOperation(
    'scheduler_control_read',
    () => svc.entities.SchedulerRun.filter(
      { record_kind: 'CONTROL', control_key: controlKey },
      'created_date',
      2,
    ),
  );
  let rows = initialRead.ok ? initialRead.value : null;
  if (!Array.isArray(rows)) {
    return {
      ok: false,
      reason: 'scheduler_control_unavailable',
      control: null,
    };
  }
  if (rows.length === 0) {
    const now = new Date().toISOString();
    const bootstrap = await authorityOperation(
      'scheduler_control_bootstrap',
      () => svc.entities.SchedulerRun.create({
      record_kind: 'CONTROL',
      control_key: controlKey,
      control_state: 'IDLE',
      control_revision: 0,
      control_token: '',
      control_owner: '',
      control_effects_started: false,
      run_key: `control:${workerKey}`,
      worker_key: workerKey,
      slot_started_at: now,
      cadence_seconds: cadence,
      automation_id: '',
      invocation_kind: 'INTERNAL',
      status: 'COMPLETED',
      material_effect_state: 'RELEASED',
      details_json: {
        control_version: SCHEDULER_CONTROL_VERSION,
        material_effect_contract_version: MATERIAL_EFFECT_CONTRACT_VERSION,
        bootstrap_contained: true,
      },
      started_at: now,
      heartbeat_at: now,
        completed_at: now,
      }),
    );
    if (!bootstrap.ok) {
      return {
        ok: false,
        reason: 'scheduler_control_bootstrap_unavailable',
        control: null,
      };
    }
    const bootstrapRead = await authorityOperation(
      'scheduler_control_bootstrap_verify',
      () => svc.entities.SchedulerRun.filter(
        { record_kind: 'CONTROL', control_key: controlKey },
        'created_date',
        2,
      ),
    );
    rows = bootstrapRead.ok ? bootstrapRead.value : null;
    if (!Array.isArray(rows)) {
      return {
        ok: false,
        reason: 'scheduler_control_unavailable',
        control: null,
      };
    }
  }
  if (rows.length !== 1) {
    return {
      ok: false,
      reason: rows.length === 0 ? 'scheduler_control_missing' : 'scheduler_control_duplicate',
      control: null,
      conflicting_ids: rows.map((row: any) => row.id),
    };
  }
  return { ok: true, reason: 'scheduler_control_exact', control: rows[0] };
}

async function recordBlockedAttempt(svc: any, input: any) {
  const now = new Date().toISOString();
  const duplicate = input.duplicate === true;
  const reviewRequired = input.review_required === true;
  const recorded = await authorityOperation(
    'scheduler_blocked_attempt_record',
    () => svc.entities.SchedulerRun.create({
    record_kind: 'ATTEMPT',
    control_key: input.control_key || '',
    logical_trigger_key: input.logical_trigger_key,
    operation_key: input.operation_key || input.logical_trigger_key,
    effect_key: input.effect_key || input.operation_key || input.logical_trigger_key,
    attempt_token: input.attempt_token || '',
    claim_acquired: false,
    run_key: input.run_key,
    worker_key: input.worker_key,
    slot_started_at: input.slot_started_at,
    cadence_seconds: input.cadence_seconds,
    automation_id: input.automation_id || '',
    invocation_kind: input.invocation_kind,
    status: duplicate ? 'DUPLICATE_BLOCKED' : reviewRequired ? 'REVIEW_REQUIRED' : 'FAILED',
    material_effect_state: reviewRequired
      ? 'REVIEW_REQUIRED'
      : duplicate
      ? 'RELEASED'
      : 'FAILED_PRE_EFFECT',
    duplicate_of: duplicate ? (input.duplicate_of || '') : '',
    details_json: {
      guard_version: SCHEDULER_GUARD_VERSION,
      control_version: SCHEDULER_CONTROL_VERSION,
      material_effect_contract_version: MATERIAL_EFFECT_CONTRACT_VERSION,
      reason: input.reason,
      duplicate_proven: duplicate,
      review_required: reviewRequired,
    },
    started_at: now,
    heartbeat_at: now,
      completed_at: now,
    }),
  );
  return recorded.ok ? recorded.value : null;
}

export async function claimSchedulerRun(
  svc: any,
  req: Request,
  input: {
    worker_key: string;
    cadence_seconds: number;
    lease_seconds?: number;
    operation_key?: string;
    effect_key?: string;
  },
) {
  const workerKey = String(input.worker_key || '').trim();
  const cadence = Math.max(
    300,
    Math.floor(Number(input.cadence_seconds || 300)),
  );
  const outerClaim = ACTIVE_REQUEST_CLAIMS.get(req);
  if (
    outerClaim?.allowed &&
    String(outerClaim.run?.worker_key || '') === workerKey
  ) return { ...outerClaim, nested_reuse: true };
  const kind = invocationKind(req);
  const payload = await req.clone().json().catch(() => ({} as any));
  const now = Date.now();
  const slotMs = cadence * 1000;
  // Scheduled, manual and internal triggers share the same cadence operation
  // unless the caller supplies a narrower durable operation key.
  const slotStart = Math.floor(now / slotMs) * slotMs;
  const scheduledKey = `${workerKey}:${new Date(slotStart).toISOString()}`;
  const explicitOperationKey = String(
    input.operation_key || req.headers.get('idempotency-key') ||
      req.headers.get('x-cambra-command-key') || payload?.operation_key ||
      payload?.idempotency_key || '',
  ).trim().slice(0, 300);
  const explicitEffectKey = String(
    input.effect_key || req.headers.get('x-cambra-effect-key') ||
      payload?.effect_key || explicitOperationKey,
  ).trim().slice(0, 300);
  const operationKey = explicitOperationKey
    ? `${workerKey}:operation:${explicitOperationKey}`
    : scheduledKey;
  const effectKey = explicitEffectKey
    ? `${workerKey}:effect:${explicitEffectKey}`
    : `${workerKey}:effect:${new Date(slotStart).toISOString()}`;
  const logicalTriggerKey = operationKey;
  const automationId = String(req.headers.get('base44-automation-id') || '');
  const authority = await schedulerControl(svc, workerKey, cadence);
  const provisionalRunKey = `${operationKey}:pending`;
  if (!authority.ok) {
    await recordBlockedAttempt(svc, {
      control_key: `scheduler-control:${workerKey}`,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      run_key: provisionalRunKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      reason: authority.reason,
    });
    return {
      allowed: false,
      duplicate: false,
      reason: authority.reason,
      run_key: provisionalRunKey,
      invocation_kind: kind,
      conflicting_ids: authority.conflicting_ids || [],
    };
  }
  let control = authority.control;
  const state = String(control.control_state || 'IDLE');
  const expiry = Date.parse(String(control.control_expires_at || ''));
  if (
    ['CLAIMED', 'RUNNING'].includes(state) && Number.isFinite(expiry) &&
    expiry > now && Boolean(String(control.active_attempt_id || ''))
  ) {
    const sameActiveIdentity =
      String(control.active_operation_key || '') === operationKey &&
      String(control.active_effect_key || '') === effectKey;
    const reason = sameActiveIdentity
      ? 'worker_single_flight_active'
      : 'worker_single_flight_conflict';
    await recordBlockedAttempt(svc, {
      control_key: control.control_key,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      run_key: provisionalRunKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      reason,
      duplicate: sameActiveIdentity,
      duplicate_of: control.active_attempt_id,
    });
    return {
      allowed: false,
      duplicate: sameActiveIdentity,
      duplicate_proven: sameActiveIdentity,
      reason,
      duplicate_of: control.active_attempt_id,
      active_operation_key: control.active_operation_key || null,
      active_effect_key: control.active_effect_key || null,
      run_key: provisionalRunKey,
      invocation_kind: kind,
    };
  }
  // CONTROL remembers only the most recent terminal operation. ATTEMPT is the
  // durable history, so exact keyed replays must be resolved there before a
  // newer operation can overwrite the CONTROL projection (A -> B -> A).
  const historicalRead = await authorityOperation(
    'scheduler_operation_history_read',
    () => svc.entities.SchedulerRun.filter({
      record_kind: 'ATTEMPT',
      worker_key: workerKey,
      operation_key: operationKey,
      claim_acquired: true,
    }, '-created_date', 2),
  );
  const historicalRows = historicalRead.ok ? historicalRead.value : null;
  if (!Array.isArray(historicalRows)) {
    await recordBlockedAttempt(svc, {
      control_key: authority.control.control_key,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      run_key: provisionalRunKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      reason: 'scheduler_operation_history_unavailable',
      review_required: true,
    });
    return {
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: 'scheduler_operation_history_unavailable',
      run_key: provisionalRunKey,
      invocation_kind: kind,
    };
  }
  if (historicalRows.length > 1) {
    await recordBlockedAttempt(svc, {
      control_key: authority.control.control_key,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      run_key: provisionalRunKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      reason: 'scheduler_operation_history_ambiguous',
      review_required: true,
      duplicate_of: historicalRows[0]?.id || '',
    });
    return {
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: 'scheduler_operation_history_ambiguous',
      conflicting_ids: historicalRows.map((row: any) => row.id),
      run_key: provisionalRunKey,
      invocation_kind: kind,
    };
  }
  if (historicalRows.length === 1) {
    const historical = historicalRows[0];
    if (String(historical.effect_key || '') !== effectKey) {
      await recordBlockedAttempt(svc, {
        control_key: authority.control.control_key,
        logical_trigger_key: logicalTriggerKey,
        operation_key: operationKey,
        effect_key: effectKey,
        run_key: provisionalRunKey,
        worker_key: workerKey,
        slot_started_at: new Date(slotStart).toISOString(),
        cadence_seconds: cadence,
        automation_id: automationId,
        invocation_kind: kind,
        reason: 'scheduler_operation_effect_binding_conflict',
        review_required: true,
        duplicate_of: historical.id,
      });
      return {
        allowed: false,
        duplicate: false,
        review_required: true,
        reason: 'scheduler_operation_effect_binding_conflict',
        duplicate_of: historical.id,
        historical_operation_key: historical.operation_key,
        historical_effect_key: historical.effect_key,
        run_key: provisionalRunKey,
        invocation_kind: kind,
      };
    }
    const projected = schedulerMaterialEffectState(historical);
    if (projected === 'EXECUTED') {
      await recordBlockedAttempt(svc, {
        control_key: authority.control.control_key,
        logical_trigger_key: logicalTriggerKey,
        operation_key: operationKey,
        effect_key: effectKey,
        run_key: provisionalRunKey,
        worker_key: workerKey,
        slot_started_at: new Date(slotStart).toISOString(),
        cadence_seconds: cadence,
        automation_id: automationId,
        invocation_kind: kind,
        reason: 'same_logical_operation',
        duplicate: true,
        duplicate_of: historical.id,
      });
      return {
        allowed: false,
        duplicate: true,
        duplicate_proven: true,
        reason: 'same_logical_operation',
        duplicate_of: historical.id,
        run_key: provisionalRunKey,
        invocation_kind: kind,
      };
    }
    if (
      ['RELEASED', 'FAILED_PRE_EFFECT', 'EXPIRED_PRE_EFFECT'].includes(projected)
    ) {
      // No material effect occurred. Continue into the same CONTROL fence so
      // a retry can acquire a new durable ATTEMPT for this operation.
    } else {
      // An in-flight, failed-post-effect or contradictory historical row is
      // ambiguous. It must not be treated as a new claim.
      await recordBlockedAttempt(svc, {
        control_key: authority.control.control_key,
        logical_trigger_key: logicalTriggerKey,
        operation_key: operationKey,
        effect_key: effectKey,
        run_key: provisionalRunKey,
        worker_key: workerKey,
        slot_started_at: new Date(slotStart).toISOString(),
        cadence_seconds: cadence,
        automation_id: automationId,
        invocation_kind: kind,
        reason: 'scheduler_operation_history_requires_review',
        review_required: true,
        duplicate_of: historical.id,
      });
      return {
        allowed: false,
        duplicate: false,
        review_required: true,
        reason: 'scheduler_operation_history_requires_review',
        duplicate_of: historical.id,
        historical_material_state: projected,
        run_key: provisionalRunKey,
        invocation_kind: kind,
      };
    }
  }
  const effectHistoryRead = await authorityOperation(
    'scheduler_effect_history_read',
    () => svc.entities.SchedulerRun.filter({
      record_kind: 'ATTEMPT',
      worker_key: workerKey,
      effect_key: effectKey,
      claim_acquired: true,
    }, '-created_date', 2),
  );
  const effectHistoryRows = effectHistoryRead.ok ? effectHistoryRead.value : null;
  if (!Array.isArray(effectHistoryRows) || effectHistoryRows.length > 1) {
    await recordBlockedAttempt(svc, {
      control_key: authority.control.control_key,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      run_key: provisionalRunKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      reason: !Array.isArray(effectHistoryRows)
        ? 'scheduler_effect_history_unavailable'
        : 'scheduler_effect_history_ambiguous',
      review_required: true,
      duplicate_of: effectHistoryRows?.[0]?.id || '',
    });
    return {
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: !Array.isArray(effectHistoryRows)
        ? 'scheduler_effect_history_unavailable'
        : 'scheduler_effect_history_ambiguous',
      conflicting_ids: Array.isArray(effectHistoryRows)
        ? effectHistoryRows.map((row: any) => row.id)
        : [],
      run_key: provisionalRunKey,
      invocation_kind: kind,
    };
  }
  if (
    effectHistoryRows.length === 1 &&
    String(effectHistoryRows[0].operation_key || '') !== operationKey
  ) {
    const historical = effectHistoryRows[0];
    await recordBlockedAttempt(svc, {
      control_key: authority.control.control_key,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      run_key: provisionalRunKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      reason: 'scheduler_operation_effect_binding_conflict',
      review_required: true,
      duplicate_of: historical.id,
    });
    return {
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: 'scheduler_operation_effect_binding_conflict',
      duplicate_of: historical.id,
      historical_operation_key: historical.operation_key,
      historical_effect_key: historical.effect_key,
      historical_material_state: schedulerMaterialEffectState(historical),
      run_key: provisionalRunKey,
      invocation_kind: kind,
    };
  }
  if (
    state === 'CLAIMED' && Number.isFinite(expiry) && expiry > now &&
    !String(control.active_attempt_id || '')
  ) {
    // A winner has crossed the CONTROL CAS and is linking its ATTEMPT. Do not
    // quarantine that valid narrow window, and do not acknowledge it as a
    // proven duplicate before the attempt linkage exists.
    await recordBlockedAttempt(svc, {
      control_key: control.control_key,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      run_key: provisionalRunKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      reason: 'scheduler_claim_link_pending',
    });
    return {
      allowed: false,
      duplicate: false,
      review_required: false,
      reason: 'scheduler_claim_link_pending',
      run_key: provisionalRunKey,
      invocation_kind: kind,
    };
  }
  const expiredPreEffect = state === 'CLAIMED' &&
    control.control_effects_started !== true && Number.isFinite(expiry) &&
    expiry <= now && Boolean(String(control.active_attempt_id || ''));
  if (
    state === 'REVIEW_REQUIRED' ||
    state === 'RUNNING' ||
    (state === 'CLAIMED' && !expiredPreEffect)
  ) {
    if (state !== 'REVIEW_REQUIRED') {
      const quarantined = await authorityOperation(
        'scheduler_previous_effect_quarantine',
        () => svc.entities.SchedulerRun.updateMany({
          id: control.id,
          record_kind: 'CONTROL',
          control_key: control.control_key,
          control_state: state,
          control_revision: Number(control.control_revision || 0),
          control_token: String(control.control_token || ''),
        }, {
          $set: {
            control_state: 'REVIEW_REQUIRED',
            control_revision: Number(control.control_revision || 0) + 1,
            details_json: {
              ...(control.details_json || {}),
              reason: 'expired_after_effect_start_requires_reconciliation',
              review_required_at: new Date(now).toISOString(),
            },
          },
        }),
      );
      if (!quarantined.ok || !updatedExactlyOne(quarantined.value)) {
        return {
          allowed: false,
          duplicate: false,
          review_required: true,
          reason: 'scheduler_previous_effect_quarantine_failed',
          run_key: provisionalRunKey,
          invocation_kind: kind,
        };
      }
    }
    await recordBlockedAttempt(svc, {
      control_key: control.control_key,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      run_key: provisionalRunKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      reason: 'scheduler_previous_effect_ambiguous',
      review_required: true,
      duplicate_of: control.active_attempt_id || '',
    });
    return {
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: 'scheduler_previous_effect_ambiguous',
      run_key: provisionalRunKey,
      invocation_kind: kind,
    };
  }
  const token = `scheduler:${crypto.randomUUID()}`,
    owner = schedulerOwner(req, workerKey),
    leaseSeconds = Math.max(
      300,
      Math.floor(
        Number(input.lease_seconds || SCHEDULER_DEFAULT_LEASE_SECONDS),
      ),
    ),
    revision = Number(control.control_revision || 0);
  const supersededAttemptId = String(control.active_attempt_id || '');
  const claimedOperation = await authorityOperation(
    'scheduler_control_claim',
    () => svc.entities.SchedulerRun.updateMany({
    id: control.id,
    record_kind: 'CONTROL',
    control_key: control.control_key,
    control_state: state,
    control_revision: revision,
    control_token: String(control.control_token || ''),
  }, {
    $set: {
      control_state: 'CLAIMED',
      control_revision: revision + 1,
      control_token: token,
      control_owner: owner,
      control_claimed_at: new Date(now).toISOString(),
      control_expires_at: new Date(now + leaseSeconds * 1000).toISOString(),
      control_effects_started: false,
      active_attempt_id: '',
      active_run_key: provisionalRunKey,
      active_operation_key: operationKey,
      active_effect_key: effectKey,
      heartbeat_at: new Date(now).toISOString(),
      },
    }),
  );
  const claimed = claimedOperation.ok ? claimedOperation.value : null;
  if (!updatedExactlyOne(claimed)) {
    await recordBlockedAttempt(svc, {
      control_key: control.control_key,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      run_key: provisionalRunKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      reason: 'scheduler_claim_conflict',
    });
    return {
      allowed: false,
      duplicate: false,
      reason: 'scheduler_claim_conflict',
      run_key: provisionalRunKey,
      invocation_kind: kind,
    };
  }
  if (state === 'CLAIMED' && supersededAttemptId) {
    const superseded = await authorityOperation(
      'scheduler_superseded_attempt_record',
      () => svc.entities.SchedulerRun.updateMany({
      id: supersededAttemptId,
      record_kind: 'ATTEMPT',
      status: 'CLAIMED',
      effects_started: false,
    }, {
      $set: {
        status: 'EXPIRED_PRE_EFFECT',
        material_effect_state: 'EXPIRED_PRE_EFFECT',
        completed_at: new Date(now).toISOString(),
        details_json: {
          reason: 'lease_expired_before_effect_safe_takeover',
          superseded_control_revision: revision + 1,
        },
        },
      }),
    );
    if (!superseded.ok || !updatedExactlyOne(superseded.value)) {
      const quarantined = await authorityOperation(
        'scheduler_superseded_attempt_quarantine',
        () => svc.entities.SchedulerRun.updateMany({
          id: control.id,
          record_kind: 'CONTROL',
          control_state: 'CLAIMED',
          control_revision: revision + 1,
          control_token: token,
          control_owner: owner,
        }, {
          $set: {
            control_state: 'REVIEW_REQUIRED',
            control_revision: revision + 2,
            active_attempt_id: supersededAttemptId,
            control_effects_started: false,
            details_json: {
              ...(control.details_json || {}),
              reason: 'scheduler_superseded_attempt_not_persisted',
              review_required_at: new Date(now).toISOString(),
            },
          },
        }),
      );
      return {
        allowed: false,
        duplicate: false,
        review_required: true,
        reason: 'scheduler_superseded_attempt_not_persisted',
        quarantine_persisted: quarantined.ok &&
          updatedExactlyOne(quarantined.value),
        run_key: provisionalRunKey,
        invocation_kind: kind,
      };
    }
  }
  const attemptToken = `scheduler-attempt:${crypto.randomUUID()}`,
    runKey = kind === 'SCHEDULED' ? scheduledKey : `${logicalTriggerKey}:${revision + 1}`;
  let row: any = null;
  try {
    row = await svc.entities.SchedulerRun.create({
      record_kind: 'ATTEMPT',
      control_key: control.control_key,
      logical_trigger_key: logicalTriggerKey,
      operation_key: operationKey,
      effect_key: effectKey,
      attempt_token: attemptToken,
      claim_acquired: true,
      attempt_fence_revision: revision + 1,
      lease_expires_at: new Date(now + leaseSeconds * 1000).toISOString(),
      effects_started: false,
      run_key: runKey,
      worker_key: workerKey,
      slot_started_at: new Date(slotStart).toISOString(),
      cadence_seconds: cadence,
      automation_id: automationId,
      invocation_kind: kind,
      status: 'CLAIMED',
      material_effect_state: 'CLAIMED',
      details_json: {
        guard_version: SCHEDULER_GUARD_VERSION,
        control_version: SCHEDULER_CONTROL_VERSION,
        material_effect_contract_version: MATERIAL_EFFECT_CONTRACT_VERSION,
        control_revision: revision + 1,
      },
      started_at: new Date(now).toISOString(),
      heartbeat_at: new Date(now).toISOString(),
    });
  } catch (error) {
    const rollback = await authorityOperation(
      'scheduler_claim_rollback_after_attempt_create_failure',
      () => svc.entities.SchedulerRun.updateMany({
      id: control.id,
      control_state: 'CLAIMED',
      control_revision: revision + 1,
      control_token: token,
    }, {
      $set: {
        control_state: 'IDLE',
        control_revision: revision + 2,
        control_token: '',
        control_owner: '',
        control_expires_at: '',
        control_effects_started: false,
        active_attempt_id: '',
        active_run_key: '',
        active_operation_key: '',
        active_effect_key: '',
        },
      }),
    );
    if (!rollback.ok || !updatedExactlyOne(rollback.value)) {
      const rollbackFailure = new Error(
        'scheduler_claim_rollback_ambiguous_after_attempt_create_failure',
      );
      schedulerAuthorityFailure(
        'scheduler_claim_rollback_ambiguous',
        rollbackFailure,
      );
      throw rollbackFailure;
    }
    throw error;
  }
  const linkedOperation = await authorityOperation(
    'scheduler_attempt_link',
    () => svc.entities.SchedulerRun.updateMany({
      id: control.id,
      record_kind: 'CONTROL',
      control_state: 'CLAIMED',
      control_revision: revision + 1,
      control_token: token,
      control_owner: owner,
      active_attempt_id: '',
    }, {
      $set: {
        active_attempt_id: row.id,
        active_run_key: runKey,
        heartbeat_at: new Date().toISOString(),
      },
    }),
  );
  const linked = linkedOperation.ok ? linkedOperation.value : null;
  if (!updatedExactlyOne(linked)) {
    const marked = await authorityOperation(
      'scheduler_attempt_link_loss_record',
      () => svc.entities.SchedulerRun.update(row.id, {
        status: 'REVIEW_REQUIRED',
        material_effect_state: 'REVIEW_REQUIRED',
        completed_at: new Date().toISOString(),
        details_json: {
          ...(row.details_json || {}),
          reason: 'scheduler_attempt_link_fence_lost',
        },
      }),
    );
    if (!marked.ok) {
      schedulerAuthorityFailure(
        'scheduler_attempt_link_loss_record_unavailable',
        new Error('scheduler_attempt_link_loss_record_unavailable'),
      );
    }
    return {
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: 'scheduler_attempt_link_fence_lost',
      run: row,
      run_key: runKey,
      invocation_kind: kind,
    };
  }
  return {
    allowed: true,
    run: row,
    run_key: runKey,
    logical_trigger_key: logicalTriggerKey,
    operation_key: operationKey,
    effect_key: effectKey,
    invocation_kind: kind,
    control_id: control.id,
    control_key: control.control_key,
    control_token: token,
    control_owner: owner,
    control_revision: revision + 1,
    lease_seconds: leaseSeconds,
    effect_started: false,
  };
}

/** Crosses the durable effect fence. No handler with material writes or an
 * external transport may run before this CAS succeeds. */
export async function markSchedulerEffectStarted(svc: any, claim: any) {
  if (!claim?.allowed || !claim?.control_id || !claim?.run?.id) {
    return {
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: 'scheduler_claim_missing_before_effect',
      run_key: claim?.run_key || null,
    };
  }
  if (claim.nested_reuse === true || claim.effect_started === true) {
    return { ...claim, effect_started: true };
  }
  const now = new Date().toISOString();
  const nextRevision = Number(claim.control_revision) + 1;
  const startedOperation = await authorityOperation(
    'scheduler_effect_fence_start',
    () => svc.entities.SchedulerRun.updateMany({
      id: claim.control_id,
      record_kind: 'CONTROL',
      control_state: 'CLAIMED',
      control_revision: Number(claim.control_revision),
      control_token: String(claim.control_token),
      control_owner: String(claim.control_owner),
      control_effects_started: false,
      active_attempt_id: claim.run.id,
    }, {
      $set: {
        control_state: 'RUNNING',
        control_revision: nextRevision,
        control_effects_started: true,
        heartbeat_at: now,
      },
    }),
  );
  if (!startedOperation.ok || !updatedExactlyOne(startedOperation.value)) {
    return {
      ...claim,
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: 'scheduler_effect_fence_lost',
    };
  }
  const attemptOperation = await authorityOperation(
    'scheduler_attempt_start',
    () => svc.entities.SchedulerRun.updateMany({
      id: claim.run.id,
      record_kind: 'ATTEMPT',
      status: 'CLAIMED',
      effects_started: false,
      attempt_token: String(claim.run.attempt_token || ''),
      attempt_fence_revision: Number(claim.control_revision),
    }, {
      $set: {
        status: 'RUNNING',
        material_effect_state: 'EFFECT_STARTED',
        effects_started: true,
        attempt_fence_revision: nextRevision,
        heartbeat_at: now,
      },
    }),
  );
  if (!attemptOperation.ok || !updatedExactlyOne(attemptOperation.value)) {
    const quarantinedControl = await authorityOperation(
      'scheduler_attempt_start_quarantine',
      () => svc.entities.SchedulerRun.updateMany({
        id: claim.control_id,
        record_kind: 'CONTROL',
        control_state: 'RUNNING',
        control_revision: nextRevision,
        control_token: String(claim.control_token),
        control_owner: String(claim.control_owner),
        active_attempt_id: claim.run.id,
      }, {
        $set: {
          control_state: 'REVIEW_REQUIRED',
          control_revision: nextRevision + 1,
          details_json: {
            reason: 'scheduler_attempt_start_persistence_failed',
            material_effect_contract_version: MATERIAL_EFFECT_CONTRACT_VERSION,
            review_required_at: now,
          },
        },
      }),
    );
    // The CONTROL row remains the authority, but mirror its ambiguity onto
    // the attempt when possible so no reader can mistake the stale CLAIMED
    // projection for an EXPIRED_PRE_EFFECT takeover candidate.
    const quarantinedAttempt = await authorityOperation(
      'scheduler_attempt_start_failure_record',
      () => svc.entities.SchedulerRun.updateMany({
        id: claim.run.id,
        record_kind: 'ATTEMPT',
        status: 'CLAIMED',
        effects_started: false,
        attempt_token: String(claim.run.attempt_token || ''),
        attempt_fence_revision: Number(claim.control_revision),
      }, {
        $set: {
          status: 'REVIEW_REQUIRED',
          material_effect_state: 'REVIEW_REQUIRED',
          completed_at: now,
          details_json: {
            ...(claim.run.details_json || {}),
            reason: 'scheduler_attempt_start_persistence_failed',
          },
        },
      }),
    );
    return {
      ...claim,
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: 'scheduler_attempt_start_persistence_failed',
      quarantine_persisted: quarantinedControl.ok &&
        updatedExactlyOne(quarantinedControl.value) && quarantinedAttempt.ok &&
        updatedExactlyOne(quarantinedAttempt.value),
    };
  }
  const running = {
    ...claim.run,
    status: 'RUNNING',
    material_effect_state: 'EFFECT_STARTED',
    effects_started: true,
    attempt_fence_revision: nextRevision,
    heartbeat_at: now,
  };
  return {
    ...claim,
    allowed: true,
    run: running,
    control_revision: nextRevision,
    effect_started: true,
  };
}

export async function heartbeatSchedulerRun(svc: any, claim: any) {
  if (!claim?.allowed || !claim?.control_id) {
    return { ok: false, reason: 'scheduler_claim_missing' };
  }
  if (claim.nested_reuse === true) {
    return { ok: true, reused_outer_claim: true };
  }
  const now = Date.now(),
    expiresAt = new Date(
      now +
        Math.max(
            300,
            Number(claim.lease_seconds || SCHEDULER_DEFAULT_LEASE_SECONDS),
          ) * 1000,
    ).toISOString();
  const changedOperation = await authorityOperation(
    'scheduler_control_heartbeat',
    () => svc.entities.SchedulerRun.updateMany({
    id: claim.control_id,
    record_kind: 'CONTROL',
    control_state: 'RUNNING',
    control_revision: Number(claim.control_revision),
    control_token: String(claim.control_token),
    control_owner: String(claim.control_owner),
  }, {
    $set: {
      heartbeat_at: new Date(now).toISOString(),
      control_expires_at: expiresAt,
      },
    }),
  );
  const changed = changedOperation.ok ? changedOperation.value : null;
  if (!updatedExactlyOne(changed)) {
    return { ok: false, reason: 'scheduler_heartbeat_fence_lost' };
  }
  const attemptChangedOperation = await authorityOperation(
    'scheduler_attempt_heartbeat',
    () => svc.entities.SchedulerRun.updateMany({
    id: claim.run.id,
    status: 'RUNNING',
    attempt_token: String(claim.run.attempt_token || ''),
    attempt_fence_revision: Number(claim.control_revision),
  }, {
    $set: {
      heartbeat_at: new Date(now).toISOString(),
      lease_expires_at: expiresAt,
      },
    }),
  );
  const attemptChanged = attemptChangedOperation.ok
    ? attemptChangedOperation.value
    : null;
  if (!updatedExactlyOne(attemptChanged)) {
    return { ok: false, reason: 'scheduler_attempt_heartbeat_failed' };
  }
  return { ok: true, expires_at: expiresAt };
}

export async function finishSchedulerRun(
  svc: any,
  claim: any,
  details: any = {},
  ok = true,
) {
  if (!claim?.run?.id || !claim.allowed) {
    return { ok: false, reason: 'scheduler_claim_missing' };
  }
  if (claim.nested_reuse === true) {
    return { ok: true, reused_outer_claim: true };
  }
  const now = new Date().toISOString();
  const effectStarted = claim.effect_started === true ||
    claim.run?.effects_started === true;
  const terminal = ok ? 'COMPLETED' : 'FAILED';
  const expectedControlState = effectStarted ? 'RUNNING' : 'CLAIMED';
  const expectedAttemptState = effectStarted ? 'RUNNING' : 'CLAIMED';
  const materialTerminal = effectStarted
    ? projectMaterialEffectState({
      native_state: terminal,
      terminal_success: ok,
      terminal_failure: !ok,
      effects_started: true,
    })
    : ok ? 'RELEASED' : 'FAILED_PRE_EFFECT';
  const postEffectFailure = effectStarted && !ok;
  const controlPatch: any = {
    control_state: postEffectFailure ? 'REVIEW_REQUIRED' : 'IDLE',
    control_revision: Number(claim.control_revision) + 1,
    control_token: postEffectFailure ? String(claim.control_token) : '',
    control_owner: postEffectFailure ? String(claim.control_owner) : '',
    control_expires_at: '',
    control_effects_started: postEffectFailure,
    active_attempt_id: postEffectFailure ? claim.run.id : '',
    active_run_key: postEffectFailure ? claim.run_key : '',
    active_operation_key: postEffectFailure ? claim.operation_key : '',
    active_effect_key: postEffectFailure ? claim.effect_key : '',
    heartbeat_at: now,
    last_terminal_status: terminal,
    last_terminal_logical_trigger_key: String(claim.logical_trigger_key || ''),
    last_terminal_operation_key: String(
      claim.operation_key || claim.logical_trigger_key || '',
    ),
    last_terminal_effect_key: String(claim.effect_key || ''),
    details_json: {
      guard_version: SCHEDULER_GUARD_VERSION,
      control_version: SCHEDULER_CONTROL_VERSION,
      material_effect_contract_version: MATERIAL_EFFECT_CONTRACT_VERSION,
      last_run_key: claim.run_key,
      last_terminal_at: now,
      ...(postEffectFailure
        ? { reason: 'post_effect_failure_requires_reconciliation' }
        : {}),
    },
  };
  if (claim.invocation_kind === 'SCHEDULED' && !claim.operation_key?.includes(':operation:')) {
    controlPatch.last_terminal_scheduled_key = claim.run_key;
  }
  // Persist the fenced attempt terminal before releasing CONTROL. If this
  // write fails, the current control remains held (and post-effect expiry
  // converges to REVIEW_REQUIRED) instead of exposing an IDLE authority with
  // ambiguous attempt evidence.
  const attemptFinishedOperation = await authorityOperation(
    'scheduler_attempt_finalize',
    () => svc.entities.SchedulerRun.updateMany({
    id: claim.run.id,
    status: expectedAttemptState,
    attempt_token: String(claim.run.attempt_token || ''),
    attempt_fence_revision: Number(claim.control_revision),
  }, {
    $set: {
      status: terminal,
      material_effect_state: materialTerminal,
      details_json: {
        ...(claim.run.details_json || {}),
        ...details,
      },
      heartbeat_at: now,
      completed_at: now,
      },
    }),
  );
  const attemptFinished = attemptFinishedOperation.ok
    ? attemptFinishedOperation.value
    : null;
  if (!updatedExactlyOne(attemptFinished)) {
    return {
      ok: false,
      reason: 'scheduler_finalize_fence_lost',
      attempt_persisted: false,
    };
  }
  const releasedOperation = await authorityOperation(
    'scheduler_control_finalize',
    () => svc.entities.SchedulerRun.updateMany({
      id: claim.control_id,
      record_kind: 'CONTROL',
      control_state: expectedControlState,
      control_revision: Number(claim.control_revision),
      control_token: String(claim.control_token),
      control_owner: String(claim.control_owner),
      active_attempt_id: claim.run.id,
    }, { $set: controlPatch }),
  );
  const released = releasedOperation.ok ? releasedOperation.value : null;
  if (!updatedExactlyOne(released)) {
    await authorityOperation(
      'scheduler_attempt_finalize_quarantine',
      () => svc.entities.SchedulerRun.updateMany({
        id: claim.run.id,
        status: terminal,
        attempt_token: String(claim.run.attempt_token || ''),
        attempt_fence_revision: Number(claim.control_revision),
      }, {
        $set: {
          status: 'REVIEW_REQUIRED',
          material_effect_state: 'REVIEW_REQUIRED',
          details_json: {
            ...(claim.run.details_json || {}),
            ...details,
            reason: 'scheduler_finalize_fence_lost',
          },
          heartbeat_at: now,
          completed_at: now,
        },
      }),
    );
    return {
      ok: false,
      reason: 'scheduler_finalize_fence_lost',
      attempt_persisted: true,
    };
  }
  return { ok: true, status: terminal };
}

/** Direct scheduler claimants must not discard a failed fence release or an
 * ambiguous terminal write. Throwing here overrides any optimistic response
 * from a caller's `finally` block, so Base44 retries/escalates the invocation
 * instead of acknowledging execution without durable terminal evidence. */
export async function finishSchedulerRunOrThrow(
  svc: any,
  claim: any,
  details: any = {},
  ok = true,
) {
  const finished = await finishSchedulerRun(svc, claim, details, ok);
  if (finished?.ok) return finished;
  const reason = String(finished?.reason || 'scheduler_finalize_unknown');
  const error = Object.assign(
    new Error(`scheduler_execution_evidence_ambiguous:${reason}`),
    {
      name: 'SchedulerExecutionEvidenceError',
      code: 'SCHEDULER_EXECUTION_EVIDENCE_AMBIGUOUS',
      status: 503,
      reason,
      review_required: true,
      run_key: claim?.run_key || null,
    },
  );
  schedulerAuthorityFailure('scheduler_finalize_required', error);
  throw error;
}

export const GO_CRITICAL_SCHEDULERS = Object.freeze([
  {
    worker_key: 'instantlyProviderEventRetryWorker',
    cadence_seconds: 300,
    responsibility: 'Instantly inbound event recovery and DLQ escalation',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_PROVIDER_EVENT_KEY',
    retry_backoff: '1m/5m/15m/60m/240m',
    dlq_escalation: 'OutboundProviderEvent + AutonomyIncident',
    side_effects: 'authenticated provider-event replay',
    tenant_scope: 'platform commercial',
    authority: 'internal secret + service role',
  },
  {
    worker_key: 'instantlyReconciliationWorker',
    cadence_seconds: 900,
    responsibility: 'bounded Instantly state and missed-event reconciliation',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_PROVIDER_EVENT_KEY',
    retry_backoff: 'next scheduled run',
    dlq_escalation: 'CommercialProviderState + AutonomyIncident',
    side_effects: 'provider health/profile/event reconciliation',
    tenant_scope: 'platform commercial',
    authority: 'internal secret + service role + cost budget',
  },
  {
    worker_key: 'processWebhookDeadLetters',
    cadence_seconds: 300,
    responsibility: 'replay webhook dead letters',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_HANDLER_GUARDS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'WebhookDeadLetter + AutonomyIncident',
    side_effects: 'webhook replay and ledger updates',
    tenant_scope: 'multi-tenant entity scoped',
    authority: 'internal secret + service role',
  },
  {
    worker_key: 'eclLifecycleScheduler',
    cadence_seconds: 900,
    responsibility: 'ECL lifecycle transitions',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_STATE_GUARDS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AutonomyIncident',
    side_effects: 'ECL state transitions',
    tenant_scope: 'platform',
    authority: 'internal secret + service role',
  },
  {
    worker_key: 'reconcileRecoverBilling',
    cadence_seconds: 900,
    responsibility: 'Recover billing reconciliation',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_LEDGER_GUARDS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AutonomyIncident',
    side_effects: 'billing reconciliation writes',
    tenant_scope: 'multi-tenant entity scoped',
    authority: 'internal secret + service role',
  },
  {
    worker_key: 'autonomousPartnerWorker',
    cadence_seconds: 3600,
    responsibility: 'partner acquisition policy loop',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_THREAD_GUARDS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AgentTask + AutonomyIncident',
    side_effects: 'outreach drafts and governed sends',
    tenant_scope: 'platform acquisition',
    authority: 'internal secret + policy + service role',
  },
  {
    worker_key: 'alwaysOnLeadDiscoveryWorker',
    cadence_seconds: 3600,
    responsibility: 'lead reservoir discovery',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_LEAD_DEDUPE',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AgentTask + AutonomyIncident',
    side_effects: 'lead and reservoir writes',
    tenant_scope: 'platform acquisition',
    authority: 'internal secret + service role',
  },
  {
    worker_key: 'commercialFollowUpWorker',
    cadence_seconds: 3600,
    responsibility: 'commercial follow-up queue',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_MESSAGE_KEYS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'thread REVIEW_REQUIRED + AutonomyIncident',
    side_effects: 'governed external email',
    tenant_scope: 'multi-tenant thread scoped',
    authority: 'internal secret + policy + sending profile',
  },
  {
    worker_key: 'postMeetingWorker',
    cadence_seconds: 3600,
    responsibility: 'post-meeting follow-up',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_THREAD_STATE',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AgentTask + AutonomyIncident',
    side_effects: 'thread/task updates and governed sends',
    tenant_scope: 'multi-tenant thread scoped',
    authority: 'internal secret + policy',
  },
  {
    worker_key: 'outboundVolumeWorker',
    cadence_seconds: 3600,
    responsibility: 'canary volume outbound',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_MESSAGE_KEYS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'thread pause + AutonomyIncident',
    side_effects: 'governed external email',
    tenant_scope: 'platform acquisition',
    authority: 'internal secret + policy + sending profile',
  },
  {
    worker_key: 'outboundDeliverabilityManager',
    cadence_seconds: 3600,
    responsibility: 'deliverability and suppression controls',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_EVENT_KEYS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AutonomyIncident',
    side_effects: 'profile/suppression/control updates',
    tenant_scope: 'platform',
    authority: 'internal secret + service role',
  },
  {
    worker_key: 'costGovernanceWorker',
    cadence_seconds: 3600,
    responsibility: 'cost budget anomaly enforcement',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_BUDGET_STATE',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AutonomyIncident + emergency stop',
    side_effects: 'budget controls and kill switch',
    tenant_scope: 'platform',
    authority: 'internal secret + service role',
  },
  {
    worker_key: 'getEuropeMarketsCommandCenter',
    cadence_seconds: 21600,
    responsibility: 'European market and growth snapshots',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_SNAPSHOT_KEYS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AutonomyIncident',
    side_effects: 'market/growth snapshot writes',
    tenant_scope: 'platform',
    authority: 'internal secret + service role',
  },
  {
    worker_key: 'disasterRecoveryBackup',
    cadence_seconds: 86400,
    responsibility: 'encrypted full/incremental production backup to independent SharePoint storage',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'SCHEDULER_SLOT_AND_IMMUTABLE_BACKUP_ID',
    retry_backoff: 'next scheduled run plus founder incident',
    dlq_escalation: 'AutonomyIncident + OperationalLog',
    side_effects:
      'read production entities; upload gzip + AES-256-GCM ciphertext, manifests and checkpoints to SharePoint',
    tenant_scope: 'platform backup boundary',
    authority: 'internal secret + service role + Entra Sites.Selected site write grant',
  },
  {
    worker_key: 'productionReadinessWorker',
    cadence_seconds: 86400,
    responsibility: 'production readiness snapshot',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_SNAPSHOT_KEYS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AutonomyIncident',
    side_effects: 'readiness snapshot writes',
    tenant_scope: 'platform',
    authority: 'internal secret + service role',
  },
  {
    worker_key: 'operatingHealthWorker',
    cadence_seconds: 86400,
    responsibility: 'operating health snapshot',
    owner_system: 'Base44',
    trigger: 'scheduled',
    timeout_seconds: 'UNKNOWN',
    concurrency: 'AT_LEAST_ONCE_SLOT_GUARDED',
    idempotency: 'RUN_KEY_AND_SNAPSHOT_KEYS',
    retry_backoff: 'HANDLER_SPECIFIC',
    dlq_escalation: 'AutonomyIncident',
    side_effects: 'operating health writes',
    tenant_scope: 'platform',
    authority: 'internal secret + service role',
  },
]);

export function evaluateSchedulerEvidence(
  runs: any[] = [],
  nowMs = Date.now(),
) {
  const rows = GO_CRITICAL_SCHEDULERS.map((required) => {
    const workerRuns = runs.filter((run: any) =>
      run.worker_key === required.worker_key &&
      run.invocation_kind === 'SCHEDULED'
    );
    const ordered = [...workerRuns].sort((a: any, b: any) =>
      Date.parse(b.started_at || '') - Date.parse(a.started_at || '')
    );
    const latestRun = ordered[0] || null;
    const latest = ordered.find((run: any) => run.status === 'COMPLETED') ||
      null;
    const ageSeconds = latest ? Math.max(0, (nowMs - Date.parse(latest.started_at || '')) / 1000) : null;
    const duplicates = workerRuns.filter((run: any) =>
      run.status === 'DUPLICATE_BLOCKED' &&
      nowMs - Date.parse(run.started_at || '') <=
        required.cadence_seconds * 3000
    ).length;
    const executedByKey = new Map<string, number>();
    for (
      const run of workerRuns.filter((row: any) => ['RUNNING', 'COMPLETED'].includes(String(row.status)))
    ) {
      executedByKey.set(
        String(run.run_key),
        (executedByKey.get(String(run.run_key)) || 0) + 1,
      );
    }
    const duplicateExecutions = [...executedByKey.values()].filter((count) => count > 1).length;
    let status: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'FAILED' | 'UNKNOWN' = 'UNKNOWN';
    if (latestRun?.status === 'FAILED') status = 'FAILED';
    else if (
      latest && Number.isFinite(ageSeconds) &&
      Number(ageSeconds) > required.cadence_seconds * 2.5
    ) status = 'STALE';
    else if (latest && duplicateExecutions === 0) status = 'HEALTHY';
    else if (
      latestRun &&
      ['CLAIMED', 'RUNNING', 'DUPLICATE_BLOCKED'].includes(
        String(latestRun.status),
      )
    ) status = 'DEGRADED';
    const active = status === 'HEALTHY';
    return {
      ...required,
      latest,
      latest_run: latestRun,
      age_seconds: ageSeconds,
      status,
      active,
      duplicate_attempts_blocked: duplicates,
      duplicate_executions: duplicateExecutions,
    };
  });
  return {
    active: rows.every((row) => row.active),
    no_duplicate_execution: rows.every((row) => row.duplicate_executions === 0),
    rows,
    missing_or_stale: rows.filter((row) => !row.active).map((row) => row.worker_key),
    duplicate_workers: rows.filter((row) => row.duplicate_executions > 0).map((
      row,
    ) => row.worker_key),
    blocked_duplicate_attempts: rows.reduce(
      (sum, row) => sum + row.duplicate_attempts_blocked,
      0,
    ),
    version: SCHEDULER_GUARD_VERSION,
  };
}
