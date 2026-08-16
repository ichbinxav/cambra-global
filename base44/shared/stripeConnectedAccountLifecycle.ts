import { requireCriticalOperation } from './criticalExecution.ts';
import { revokeIntegrationCredential } from './integrationCredentials.ts';

export const STRIPE_CONNECTED_ACCOUNT_LIFECYCLE_VERSION =
  'stripe-connected-account-lifecycle-cas-v1.0.0';
export const STRIPE_CONNECTED_ACCOUNT_EVENT_LEASE_MS = 10 * 60_000;

const STRIPE_PROVIDERS = new Set(['stripe', 'stripe_self', 'stripe_self_test']);

export class StripeConnectedAccountLifecycleError extends Error {
  code: string;
  status: number;
  review_required: boolean;
  receipt: any;
  override cause: unknown;

  constructor(
    code: string,
    options: {
      status?: number;
      review_required?: boolean;
      receipt?: any;
      cause?: unknown;
    } = {},
  ) {
    super(code.toLowerCase());
    this.name = 'StripeConnectedAccountLifecycleError';
    this.code = code;
    this.status = options.status || 503;
    this.review_required = options.review_required !== false;
    this.receipt = options.receipt || null;
    this.cause = options.cause;
  }
}

export function isStripeConnectedAccountLifecycleError(error: unknown):
  error is StripeConnectedAccountLifecycleError {
  return error instanceof StripeConnectedAccountLifecycleError;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function updatedExactlyOne(result: any) {
  if (!result || typeof result !== 'object') return false;
  const counts = [result.updated, result.modified_count, result.matched_count]
    .filter((value) => value !== undefined && value !== null)
    .map(Number);
  return counts.length > 0 && counts.every((value) => value === 1);
}

function mutationAmbiguous(result: any) {
  if (!result || typeof result !== 'object') return true;
  const counts = [result.updated, result.modified_count, result.matched_count]
    .filter((value) => value !== undefined && value !== null)
    .map(Number);
  return !counts.length || counts.some((value) => !Number.isInteger(value) || value < 0) ||
    new Set(counts).size !== 1 || counts[0] > 1;
}

async function mutateIntegration(
  svc: any,
  operation: string,
  filter: Record<string, unknown>,
  patch: Record<string, unknown>,
) {
  let result: any;
  try {
    result = await svc.entities.Integration.updateMany(filter, { $set: patch });
  } catch (cause) {
    throw new StripeConnectedAccountLifecycleError(
      `STRIPE_CONNECT_${operation.toUpperCase()}_AUTHORITY_UNAVAILABLE`,
      { cause },
    );
  }
  if (mutationAmbiguous(result)) {
    throw new StripeConnectedAccountLifecycleError(
      `STRIPE_CONNECT_${operation.toUpperCase()}_AUTHORITY_AMBIGUOUS`,
    );
  }
  return updatedExactlyOne(result);
}

function eventRevision(integration: any) {
  const revision = Number(integration?.provider_event_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_EVENT_REVISION_UNAVAILABLE',
    );
  }
  return revision;
}

function eventState(integration: any) {
  return text(integration?.provider_event_claim_state).toUpperCase() || 'IDLE';
}

function claimFilter(integration: any) {
  return {
    id: integration.id,
    provider_account_id: text(integration.provider_account_id),
    provider_event_revision: eventRevision(integration),
    provider_event_claim_state: eventState(integration),
    provider_event_claim_key: text(integration.provider_event_claim_key),
    provider_event_claim_token: text(integration.provider_event_claim_token),
  };
}

async function initializeHistoricalEventAuthority(svc: any, integration: any) {
  if (
    integration.provider_event_revision !== undefined &&
    integration.provider_event_revision !== null
  ) return integration;
  const projectedLegacyState = text(integration.provider_event_claim_state).toUpperCase();
  if (
    text(integration.provider_event_claim_key) ||
    text(integration.provider_event_claim_token) ||
    (projectedLegacyState && projectedLegacyState !== 'IDLE')
  ) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_LEGACY_EVENT_AUTHORITY_AMBIGUOUS',
    );
  }
  const initialized = await mutateIntegration(
    svc,
    'event_authority_initialize',
    {
      id: integration.id,
      provider_account_id: text(integration.provider_account_id),
      provider_event_revision: integration.provider_event_revision ?? null,
      provider_event_claim_state: integration.provider_event_claim_state ?? null,
      provider_event_claim_key: integration.provider_event_claim_key ?? null,
      provider_event_claim_token: integration.provider_event_claim_token ?? null,
    },
    {
      provider_event_revision: 0,
      provider_event_claim_state: 'IDLE',
      provider_event_claim_key: '',
      provider_event_claim_token: '',
      provider_event_claim_owner: '',
      provider_event_claim_expires_at: '',
      provider_event_effects_started: false,
    },
  );
  const observed = await requireCriticalOperation(
    'stripe_connect_event_authority_initialize_readback',
    () => svc.entities.Integration.get(integration.id),
  );
  if (!initialized && observed?.provider_event_revision === undefined) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_EVENT_AUTHORITY_INITIALIZE_CONFLICT',
    );
  }
  return observed;
}

export async function resolveExactStripeIntegrationForAccount(
  svc: any,
  providerAccountId: string,
) {
  const accountId = text(providerAccountId);
  if (!accountId) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_ACCOUNT_ID_MISSING',
      { status: 503 },
    );
  }
  const rows = await requireCriticalOperation(
    'stripe_connect_account_integration_lookup',
    () => svc.entities.Integration.filter(
      { provider_account_id: accountId },
      '-created_date',
      10,
    ),
  );
  if (!Array.isArray(rows) || rows.length >= 10) {
    throw new StripeConnectedAccountLifecycleError(
      Array.isArray(rows)
        ? 'STRIPE_CONNECT_ACCOUNT_AUTHORITY_COVERAGE_UNPROVEN'
        : 'STRIPE_CONNECT_ACCOUNT_AUTHORITY_UNAVAILABLE',
    );
  }
  const exact = rows.filter((row: any) => (
    text(row?.provider_account_id) === accountId &&
    STRIPE_PROVIDERS.has(text(row?.provider))
  ));
  if (exact.length !== 1) {
    throw new StripeConnectedAccountLifecycleError(
      exact.length === 0
        ? 'STRIPE_CONNECT_ACCOUNT_AUTHORITY_MISSING'
        : 'STRIPE_CONNECT_ACCOUNT_AUTHORITY_AMBIGUOUS',
      { receipt: { account_id: accountId, conflicting_ids: exact.map((row: any) => row.id) } },
    );
  }
  return exact[0];
}

export async function acquireStripeConnectedAccountEventClaim(
  svc: any,
  seedIntegration: any,
  input: {
    effect_key: string;
    owner: string;
    now_ms?: number;
    lease_ms?: number;
  },
) {
  const effectKey = text(input.effect_key);
  if (!effectKey) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_EVENT_EFFECT_KEY_MISSING',
      { status: 400 },
    );
  }
  const nowMs = input.now_ms ?? Date.now();
  let integration = await initializeHistoricalEventAuthority(svc, seedIntegration);
  const state = eventState(integration);
  const currentKey = text(integration.provider_event_claim_key);
  const leaseUntil = Date.parse(text(integration.provider_event_claim_expires_at));
  const leaseFresh = Number.isFinite(leaseUntil) && leaseUntil > nowMs;

  if (state === 'COMPLETED' && currentKey === effectKey) {
    return { acquired: false, duplicate: true, in_progress: false, integration };
  }
  if (['CLAIMED', 'APPLYING'].includes(state) && leaseFresh) {
    return { acquired: false, duplicate: false, in_progress: true, integration };
  }
  if (
    state === 'APPLYING' ||
    integration.provider_event_effects_started === true
  ) {
    if (currentKey !== effectKey || state !== 'REVIEW_REQUIRED') {
      const changed = await mutateIntegration(
        svc,
        'expired_effect_quarantine',
        claimFilter(integration),
        {
          provider_event_claim_state: 'REVIEW_REQUIRED',
          provider_event_revision: eventRevision(integration) + 1,
          provider_event_claim_expires_at: '',
          provider_event_last_error: 'expired_or_interrupted_effect_requires_reconciliation',
        },
      );
      const observed = await requireCriticalOperation(
        'stripe_connect_expired_effect_quarantine_readback',
        () => svc.entities.Integration.get(integration.id),
      );
      if (!changed || text(observed?.provider_event_claim_state) !== 'REVIEW_REQUIRED') {
        throw new StripeConnectedAccountLifecycleError(
          'STRIPE_CONNECT_EXPIRED_EFFECT_QUARANTINE_CONFLICT',
        );
      }
      integration = observed;
    }
  }
  // REVIEW_REQUIRED is terminal for automatic processing, including replay of
  // the same Stripe event. A human reconciliation path must explicitly clear
  // it; the webhook can never turn a post-effect ambiguity into a blind retry.
  if (eventState(integration) === 'REVIEW_REQUIRED') {
    return { acquired: false, duplicate: false, in_progress: false, review_required: true, integration };
  }

  const token = `stripe-connect-event:${crypto.randomUUID()}`;
  const revision = eventRevision(integration) + 1;
  const claimedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(
    nowMs + Math.max(60_000, input.lease_ms || STRIPE_CONNECTED_ACCOUNT_EVENT_LEASE_MS),
  ).toISOString();
  const changed = await mutateIntegration(
    svc,
    'event_claim',
    claimFilter(integration),
    {
      provider_event_claim_state: 'CLAIMED',
      provider_event_revision: revision,
      provider_event_claim_key: effectKey,
      provider_event_claim_token: token,
      provider_event_claim_owner: text(input.owner) || 'stripe_webhook',
      provider_event_claimed_at: claimedAt,
      provider_event_claim_expires_at: expiresAt,
      provider_event_effects_started: false,
      provider_event_last_error: '',
    },
  );
  if (!changed) {
    return {
      acquired: false,
      duplicate: false,
      in_progress: true,
      integration: await requireCriticalOperation(
        'stripe_connect_event_claim_conflict_readback',
        () => svc.entities.Integration.get(integration.id),
      ),
    };
  }
  return {
    acquired: true,
    duplicate: false,
    in_progress: false,
    integration: { ...integration, provider_event_revision: revision },
    claim: {
      integration_id: integration.id,
      brand_id: integration.brand_id,
      provider_account_id: integration.provider_account_id,
      effect_key: effectKey,
      token,
      owner: text(input.owner) || 'stripe_webhook',
      revision,
    },
  };
}

function ownedClaimFilter(claim: any, state: string) {
  return {
    id: claim.integration_id,
    provider_account_id: claim.provider_account_id,
    provider_event_claim_state: state,
    provider_event_revision: Number(claim.revision),
    provider_event_claim_key: claim.effect_key,
    provider_event_claim_token: claim.token,
    provider_event_claim_owner: claim.owner,
  };
}

export async function markStripeConnectedAccountEventEffectsStarted(
  svc: any,
  claim: any,
) {
  const nextRevision = Number(claim.revision) + 1;
  const changed = await mutateIntegration(
    svc,
    'event_effect_start',
    ownedClaimFilter(claim, 'CLAIMED'),
    {
      provider_event_claim_state: 'APPLYING',
      provider_event_revision: nextRevision,
      provider_event_effects_started: true,
      provider_event_effect_started_at: new Date().toISOString(),
    },
  );
  if (!changed) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_EVENT_EFFECT_START_CLAIM_LOST',
    );
  }
  return { ...claim, revision: nextRevision, effects_started: true };
}

export async function completeStripeConnectedAccountEventClaim(
  svc: any,
  claim: any,
  receipt: any,
) {
  const nextRevision = Number(claim.revision) + 1;
  const changed = await mutateIntegration(
    svc,
    'event_complete',
    ownedClaimFilter(claim, 'APPLYING'),
    {
      provider_event_claim_state: 'COMPLETED',
      provider_event_revision: nextRevision,
      provider_event_claim_expires_at: '',
      provider_event_effects_started: false,
      provider_event_last_processed_id: text(receipt?.event_id),
      provider_event_last_processed_type: text(receipt?.event_type),
      provider_event_last_processed_at: new Date().toISOString(),
      provider_event_receipt_json: receipt || {},
      provider_event_last_error: '',
    },
  );
  if (!changed) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_EVENT_COMPLETE_CLAIM_LOST',
      { receipt },
    );
  }
  return { ...claim, revision: nextRevision };
}

export async function quarantineStripeConnectedAccountEventClaim(
  svc: any,
  claim: any,
  errorCode: string,
  receipt: any,
) {
  const nextRevision = Number(claim.revision) + 1;
  try {
    const changed = await mutateIntegration(
      svc,
      'event_quarantine',
      ownedClaimFilter(claim, claim.effects_started === true ? 'APPLYING' : 'CLAIMED'),
      {
        provider_event_claim_state: 'REVIEW_REQUIRED',
        provider_event_revision: nextRevision,
        provider_event_claim_expires_at: '',
        provider_event_last_error: text(errorCode).slice(0, 300),
        provider_event_receipt_json: receipt || {},
      },
    );
    return { ok: changed, revision: nextRevision };
  } catch (cause) {
    return { ok: false, revision: Number(claim.revision), cause };
  }
}

export async function ensureStripeConnectEventLedger(
  svc: any,
  input: {
    effect_key: string;
    event_id: string;
    event_type: string;
    account_id: string;
    brand_id: string;
    integration_id: string;
    livemode: boolean;
  },
) {
  const rows = await requireCriticalOperation(
    'stripe_connect_event_ledger_lookup',
    () => svc.entities.Event.filter({ idempotency_key: input.effect_key }, 'created_date', 3),
  );
  if (!Array.isArray(rows) || rows.length > 1) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_EVENT_LEDGER_AMBIGUOUS',
      { receipt: { effect_key: input.effect_key, row_ids: Array.isArray(rows) ? rows.map((row: any) => row.id) : [] } },
    );
  }
  if (rows.length === 1) return rows[0];
  const now = new Date().toISOString();
  const created = await requireCriticalOperation(
    'stripe_connect_event_ledger_create',
    () => svc.entities.Event.create({
      brand_id: input.brand_id,
      tenant_id: input.brand_id,
      tenant_scope: 'TENANT',
      event_type: input.event_type,
      source: 'stripe_connect_webhook',
      entity_type: 'Integration',
      entity_id: input.integration_id,
      idempotency_key: input.effect_key,
      occurred_at: now,
      observed_at: now,
      payload_json: {
        stripe_event_id: input.event_id,
        connected_account_id: input.account_id,
        livemode: input.livemode,
        lifecycle_version: STRIPE_CONNECTED_ACCOUNT_LIFECYCLE_VERSION,
      },
      execution_json: { status: 'CLAIMED', effect_key: input.effect_key },
      status: 'pending',
    }),
  );
  const readback = await requireCriticalOperation(
    'stripe_connect_event_ledger_create_readback',
    () => svc.entities.Event.filter({ idempotency_key: input.effect_key }, 'created_date', 3),
  );
  if (!Array.isArray(readback) || readback.length !== 1 || (created?.id && readback[0]?.id !== created.id)) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_EVENT_LEDGER_CREATE_AMBIGUOUS',
      { receipt: { effect_key: input.effect_key, row_ids: Array.isArray(readback) ? readback.map((row: any) => row.id) : [] } },
    );
  }
  return readback[0];
}

export async function settleStripeConnectEventLedger(
  svc: any,
  ledger: any,
  input: { status: 'processed' | 'failed'; receipt: any; error_code?: string },
) {
  await requireCriticalOperation(
    'stripe_connect_event_ledger_settle',
    () => svc.entities.Event.update(ledger.id, {
      status: input.status,
      execution_json: {
        status: input.status === 'processed' ? 'EXECUTED' : 'REVIEW_REQUIRED',
        effect_key: ledger.idempotency_key,
        receipt: input.receipt || {},
        error_code: text(input.error_code),
      },
      ...(input.status === 'processed'
        ? { processed_at: new Date().toISOString(), error: '' }
        : { error: text(input.error_code).slice(0, 300) }),
    }),
  );
  const readback = await requireCriticalOperation(
    'stripe_connect_event_ledger_settle_readback',
    () => svc.entities.Event.get(ledger.id),
  );
  if (text(readback?.status) !== input.status) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_EVENT_LEDGER_SETTLE_UNVERIFIED',
      { receipt: input.receipt },
    );
  }
  return readback;
}

export async function recordStripeConnectIncident(
  svc: any,
  input: {
    dedupe_key: string;
    account_id: string;
    event_id: string;
    event_type: string;
    error_code: string;
    integration_id?: string;
    brand_id?: string;
    receipt?: any;
  },
) {
  const rows = await requireCriticalOperation(
    'stripe_connect_incident_lookup',
    () => svc.entities.AutonomyIncident.filter({ dedupe_key: input.dedupe_key }, '-created_date', 2),
  );
  if (!Array.isArray(rows) || rows.length > 1) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_INCIDENT_AUTHORITY_AMBIGUOUS',
      { receipt: input.receipt },
    );
  }
  if (rows.length === 1) return rows[0];
  const now = new Date().toISOString();
  return requireCriticalOperation(
    'stripe_connect_incident_create',
    () => svc.entities.AutonomyIncident.create({
      dedupe_key: input.dedupe_key,
      domain: 'webhook_delivery',
      severity: 'critical',
      status: 'open',
      subject_type: input.integration_id ? 'Integration' : (input.brand_id ? 'Brand' : 'StripeConnectedAccount'),
      subject_id: input.integration_id || input.brand_id || input.account_id || 'stripe_connect_unknown',
      summary: 'Stripe connected-account lifecycle requires reconciliation',
      details_json: {
        stripe_event_id: input.event_id,
        stripe_event_type: input.event_type,
        connected_account_id: input.account_id,
        integration_id: input.integration_id || null,
        brand_id: input.brand_id || null,
        error_code: input.error_code,
        receipt: input.receipt || null,
      },
      first_seen_at: now,
      last_seen_at: now,
      workflow_state: 'human_review',
      owner_type: 'engineering',
      automation_eligibility: 'human_required',
      financial_impact_minor: 0,
      customer_impact: 'high',
      legal_risk: 'medium',
    }),
  );
}

async function updateAndVerify(
  operation: string,
  update: () => Promise<any>,
  verify: () => Promise<boolean>,
) {
  await requireCriticalOperation(operation, update);
  const valid = await requireCriticalOperation(`${operation}_readback`, verify);
  if (!valid) {
    throw new StripeConnectedAccountLifecycleError(
      `STRIPE_CONNECT_${operation.toUpperCase()}_UNVERIFIED`,
    );
  }
}

/**
 * Compatibility transition for historical brands that have no Integration
 * authority row yet. It deliberately remains separate from the connected-
 * account webhook path: a webhook must always resolve one exact Integration,
 * while an authenticated brand owner may still retire legacy local records.
 *
 * Every mutation is read back. If any step becomes partial or unobservable,
 * the typed error carries the exact completed-step receipt so the caller can
 * persist a canonical AutonomyIncident and must not report success.
 */
export async function disconnectLegacyStripeConnectionOnly(
  svc: any,
  input: {
    brand_id: string;
    reason: string;
    actor_email?: string;
  },
) {
  const brandId = text(input.brand_id);
  if (!brandId) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_LEGACY_DISCONNECT_BINDING_INVALID',
      { status: 400 },
    );
  }
  const now = new Date().toISOString();
  const receipt: any = {
    transition: 'STRIPE_LEGACY_CONNECTION_DISCONNECTED',
    lifecycle_version: STRIPE_CONNECTED_ACCOUNT_LIFECYCLE_VERSION,
    event_id: null,
    event_type: 'manual_disconnect',
    account_id: null,
    integration_id: null,
    brand_id: brandId,
    reason: text(input.reason),
    source: 'manual_legacy_compatibility',
    steps: {},
  };
  try {
    const legacy = await requireCriticalOperation(
      'stripe_legacy_only_connection_lookup',
      () => svc.entities.StripeConnection.filter(
        { brand_id: brandId, connection_status: 'connected' },
        '-created_date',
        100,
      ),
    );
    if (!Array.isArray(legacy) || legacy.length >= 100) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_LEGACY_ONLY_CONNECTION_COVERAGE_UNPROVEN',
        { receipt },
      );
    }
    receipt.steps.legacy_connections = { status: 'APPLYING', ids: [] as string[] };
    for (const row of legacy) {
      await updateAndVerify(
        'stripe_legacy_only_connection_disconnect',
        () => svc.entities.StripeConnection.update(row.id, { connection_status: 'disconnected' }),
        async () => {
          const observed = await svc.entities.StripeConnection.get(row.id);
          return text(observed?.brand_id) === brandId &&
            text(observed?.connection_status) === 'disconnected';
        },
      );
      receipt.steps.legacy_connections.ids.push(text(row.id));
    }
    receipt.steps.legacy_connections.status = 'DISCONNECTED';

    const consents = await requireCriticalOperation(
      'stripe_legacy_only_consent_lookup',
      () => svc.entities.ConsentRecord.filter(
        { brand_id: brandId, provider: 'stripe', status: 'active' },
        '-created_date',
        100,
      ),
    );
    if (!Array.isArray(consents) || consents.length >= 100) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_LEGACY_ONLY_CONSENT_COVERAGE_UNPROVEN',
        { receipt },
      );
    }
    receipt.steps.consents = { status: 'APPLYING', ids: [] as string[] };
    for (const row of consents) {
      await updateAndVerify(
        'stripe_legacy_only_consent_revoke',
        () => svc.entities.ConsentRecord.update(row.id, { status: 'revoked', revoked_at: now }),
        async () => {
          const observed = await svc.entities.ConsentRecord.get(row.id);
          return text(observed?.brand_id) === brandId && text(observed?.status) === 'revoked';
        },
      );
      receipt.steps.consents.ids.push(text(row.id));
    }
    receipt.steps.consents.status = 'REVOKED';

    const recoveries = await requireCriticalOperation(
      'stripe_legacy_only_recover_verification_lookup',
      () => svc.entities.DealActivation.filter(
        { brand_id: brandId, economic_right_status: 'active' },
        '-created_date',
        100,
      ),
    );
    if (!Array.isArray(recoveries) || recoveries.length >= 100) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_LEGACY_ONLY_RECOVER_COVERAGE_UNPROVEN',
        { receipt },
      );
    }
    receipt.steps.recover_verification = { status: 'APPLYING', ids: [] as string[] };
    for (const row of recoveries) {
      if (text(row.verification_access_status) !== 'missing') {
        await updateAndVerify(
          'stripe_legacy_only_recover_verification_missing',
          () => svc.entities.DealActivation.update(row.id, { verification_access_status: 'missing' }),
          async () => {
            const observed = await svc.entities.DealActivation.get(row.id);
            return text(observed?.brand_id) === brandId &&
              text(observed?.verification_access_status) === 'missing';
          },
        );
      }
      receipt.steps.recover_verification.ids.push(text(row.id));
    }
    receipt.steps.recover_verification.status = 'MISSING';

    const createdLog = await requireCriticalOperation(
      'stripe_legacy_only_operational_log_write',
      () => svc.entities.OperationalLog.create({
        brand_id: brandId,
        event_type: 'stripe_connected_account_disconnected',
        message: 'recovery_verification_source_disconnected',
        data_json: {
          reason: text(input.reason),
          receipts: receipt.steps,
          billing_effect: 'verification_required_no_estimated_billing',
          compatibility_path: 'legacy_stripe_connection_only',
        },
        actor_email: text(input.actor_email),
        created_at: now,
      }),
    );
    const logId = text(createdLog?.id);
    receipt.steps.operational_log = {
      status: logId ? 'CREATED_UNVERIFIED' : 'CREATE_AMBIGUOUS',
      id: logId || null,
    };
    if (!logId) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_LEGACY_ONLY_OPERATIONAL_LOG_CREATE_AMBIGUOUS',
        { receipt },
      );
    }
    const observedLog = await requireCriticalOperation(
      'stripe_legacy_only_operational_log_readback',
      () => svc.entities.OperationalLog.get(logId),
    );
    if (
      text(observedLog?.brand_id) !== brandId ||
      text(observedLog?.event_type) !== 'stripe_connected_account_disconnected' ||
      text(observedLog?.data_json?.compatibility_path) !== 'legacy_stripe_connection_only'
    ) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_LEGACY_ONLY_OPERATIONAL_LOG_UNVERIFIED',
        { receipt },
      );
    }
    receipt.steps.operational_log.status = 'RECORDED';
    receipt.completed_at = new Date().toISOString();
    return receipt;
  } catch (cause) {
    receipt.failed_at = new Date().toISOString();
    receipt.error_code = text((cause as any)?.code) ||
      'STRIPE_CONNECT_LEGACY_DISCONNECT_PARTIAL';
    receipt.error_operation = text((cause as any)?.operation) || null;
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_LEGACY_DISCONNECT_RECONCILIATION_REQUIRED',
      { receipt, cause },
    );
  }
}

/**
 * Canonical Stripe disconnect transition used by both authenticated manual
 * disconnect and account.application.deauthorized. Every local mutation is
 * replay-safe; a partial transition returns its receipts for reconciliation.
 */
export async function disconnectStripeConnectedAccount(
  svc: any,
  input: {
    integration: any;
    provider_account_id?: string;
    reason: string;
    source: 'manual' | 'stripe_webhook';
    event_id?: string;
    event_type?: string;
    actor_email?: string;
  },
) {
  const integration = input.integration;
  const brandId = text(integration?.brand_id);
  const integrationId = text(integration?.id);
  const accountId = text(input.provider_account_id || integration?.provider_account_id);
  if (!brandId || !integrationId || !STRIPE_PROVIDERS.has(text(integration?.provider))) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_DISCONNECT_BINDING_INVALID',
      { status: 400 },
    );
  }
  if (accountId && text(integration.provider_account_id) !== accountId) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_DISCONNECT_ACCOUNT_MISMATCH',
      { status: 503 },
    );
  }
  const now = new Date().toISOString();
  const receipt: any = {
    transition: 'STRIPE_CONNECTED_ACCOUNT_DISCONNECTED',
    lifecycle_version: STRIPE_CONNECTED_ACCOUNT_LIFECYCLE_VERSION,
    event_id: text(input.event_id) || null,
    event_type: text(input.event_type) || null,
    account_id: accountId || null,
    integration_id: integrationId,
    brand_id: brandId,
    reason: text(input.reason),
    source: input.source,
    steps: {},
  };
  try {
    const credential = await revokeIntegrationCredential(svc, {
      integration_id: integrationId,
      brand_id: brandId,
    });
    receipt.steps.credential = {
      status: 'REVOKED',
      credential_version: credential.credential_version,
    };

    await updateAndVerify(
      'stripe_integration_disconnect',
      () => svc.entities.Integration.update(integrationId, {
        status: 'disconnected',
        last_sync_status: 'failed',
        last_error: text(input.reason).slice(0, 300),
        provider_capability_risk_status: 'DEAUTHORIZED',
        provider_charges_enabled: false,
        provider_payouts_enabled: false,
        provider_capability_observed_at: now,
        provider_capability_event_id: text(input.event_id),
      }),
      async () => {
        const row = await svc.entities.Integration.get(integrationId);
        return text(row?.brand_id) === brandId &&
          text(row?.provider_account_id) === accountId &&
          text(row?.status) === 'disconnected' &&
          text(row?.provider_capability_risk_status) === 'DEAUTHORIZED';
      },
    );
    receipt.steps.integration = { status: 'DISCONNECTED', id: integrationId };

    const legacy = await requireCriticalOperation(
      'stripe_legacy_connection_lookup',
      () => svc.entities.StripeConnection.filter({ brand_id: brandId }, '-created_date', 100),
    );
    if (!Array.isArray(legacy) || legacy.length >= 100) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_LEGACY_CONNECTION_COVERAGE_UNPROVEN',
        { receipt },
      );
    }
    const ambiguousLegacy = input.source === 'stripe_webhook'
      ? legacy.filter((row: any) => !text(row.stripe_account_id) && text(row.connection_status) !== 'disconnected')
      : [];
    if (ambiguousLegacy.length) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_LEGACY_ACCOUNT_BINDING_AMBIGUOUS',
        { receipt: { ...receipt, ambiguous_legacy_ids: ambiguousLegacy.map((row: any) => row.id) } },
      );
    }
    const legacyTargets = input.source === 'stripe_webhook'
      ? legacy.filter((row: any) => text(row.stripe_account_id) === accountId)
      : legacy;
    const legacyIds: string[] = [];
    for (const row of legacyTargets) {
      if (text(row.connection_status) !== 'disconnected') {
        await updateAndVerify(
          'stripe_legacy_connection_disconnect',
          () => svc.entities.StripeConnection.update(row.id, { connection_status: 'disconnected' }),
          async () => text((await svc.entities.StripeConnection.get(row.id))?.connection_status) === 'disconnected',
        );
      }
      legacyIds.push(text(row.id));
    }
    receipt.steps.legacy_connections = {
      status: 'DISCONNECTED',
      ids: legacyIds,
      unrelated_preserved: legacy.length - legacyTargets.length,
    };

    const consents = await requireCriticalOperation(
      'stripe_consent_lookup',
      () => svc.entities.ConsentRecord.filter({ brand_id: brandId, provider: 'stripe' }, '-created_date', 100),
    );
    if (!Array.isArray(consents) || consents.length >= 100) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_CONSENT_COVERAGE_UNPROVEN',
        { receipt },
      );
    }
    const ambiguousConsents = input.source === 'stripe_webhook'
      ? consents.filter((row: any) => (
        text(row.status) === 'active' && !text(row.metadata?.stripe_account_id)
      ))
      : [];
    if (ambiguousConsents.length) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_CONSENT_ACCOUNT_BINDING_AMBIGUOUS',
        { receipt: { ...receipt, ambiguous_consent_ids: ambiguousConsents.map((row: any) => row.id) } },
      );
    }
    const consentTargets = input.source === 'stripe_webhook'
      ? consents.filter((row: any) => text(row.metadata?.stripe_account_id) === accountId)
      : consents;
    const consentIds: string[] = [];
    for (const row of consentTargets) {
      if (text(row.status) !== 'revoked') {
        await updateAndVerify(
          'stripe_consent_revoke',
          () => svc.entities.ConsentRecord.update(row.id, { status: 'revoked', revoked_at: now }),
          async () => text((await svc.entities.ConsentRecord.get(row.id))?.status) === 'revoked',
        );
      }
      consentIds.push(text(row.id));
    }
    receipt.steps.consents = {
      status: 'REVOKED',
      ids: consentIds,
      unrelated_preserved: consents.length - consentTargets.length,
    };

    const recoveries = await requireCriticalOperation(
      'stripe_recover_verification_lookup',
      () => svc.entities.DealActivation.filter(
        { brand_id: brandId, economic_right_status: 'active' },
        '-created_date',
        100,
      ),
    );
    if (!Array.isArray(recoveries) || recoveries.length >= 100) {
      throw new StripeConnectedAccountLifecycleError(
        'STRIPE_CONNECT_RECOVER_COVERAGE_UNPROVEN',
        { receipt },
      );
    }
    const recoveryIds: string[] = [];
    for (const row of recoveries) {
      if (text(row.verification_access_status) !== 'missing') {
        await updateAndVerify(
          'stripe_recover_verification_missing',
          () => svc.entities.DealActivation.update(row.id, { verification_access_status: 'missing' }),
          async () => text((await svc.entities.DealActivation.get(row.id))?.verification_access_status) === 'missing',
        );
      }
      recoveryIds.push(text(row.id));
    }
    receipt.steps.recover_verification = { status: 'MISSING', ids: recoveryIds };

    const log = await requireCriticalOperation(
      'stripe_disconnect_operational_log_write',
      () => svc.entities.OperationalLog.create({
        brand_id: brandId,
        provider_id: accountId,
        event_type: 'stripe_connected_account_disconnected',
        message: 'recovery_verification_source_disconnected',
        data_json: {
          stripe_event_id: text(input.event_id) || null,
          stripe_event_type: text(input.event_type) || null,
          connected_account_id: accountId || null,
          reason: text(input.reason),
          receipts: receipt.steps,
          billing_effect: 'verification_required_no_estimated_billing',
        },
        actor_email: text(input.actor_email) || 'stripe_webhook',
        created_at: now,
      }),
    );
    receipt.steps.operational_log = { status: 'RECORDED', id: text(log?.id) || null };
    receipt.completed_at = new Date().toISOString();
    return receipt;
  } catch (cause) {
    const errorCode = text((cause as any)?.code) || 'STRIPE_CONNECT_DISCONNECT_PARTIAL';
    receipt.failed_at = new Date().toISOString();
    receipt.error_code = errorCode;
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_DISCONNECT_RECONCILIATION_REQUIRED',
      { receipt, cause },
    );
  }
}

export async function recordStripeAccountCapabilityDrop(
  svc: any,
  input: {
    integration: any;
    account: any;
    event_id: string;
    event_type: string;
    account_id: string;
  },
) {
  const integration = input.integration;
  const observedChargesEnabled = input.account?.charges_enabled === true;
  const observedPayoutsEnabled = input.account?.payouts_enabled === true;
  if (
    text(integration?.provider_capability_risk_status) === 'DEAUTHORIZED' ||
    text(integration?.status) === 'disconnected'
  ) {
    return {
      changed: false,
      reason: 'deauthorized_terminal_observation_only',
      terminal_authority: 'DEAUTHORIZED',
      event_id: input.event_id,
      event_type: input.event_type,
      account_id: input.account_id,
      integration_id: integration.id,
      brand_id: integration.brand_id,
      observed_charges_enabled: observedChargesEnabled,
      observed_payouts_enabled: observedPayoutsEnabled,
    };
  }
  if (observedChargesEnabled && observedPayoutsEnabled) {
    return {
      changed: false,
      reason: 'capabilities_not_degraded_no_automatic_reactivation',
      event_id: input.event_id,
      event_type: input.event_type,
      account_id: input.account_id,
      integration_id: integration.id,
      brand_id: integration.brand_id,
    };
  }
  // Loss observations are sticky. An out-of-order event where one capability
  // is true must not silently restore a capability that an earlier event
  // already proved false; only an explicit governed reconnect/review may do so.
  const chargesEnabled = integration?.provider_charges_enabled === false
    ? false
    : observedChargesEnabled;
  const payoutsEnabled = integration?.provider_payouts_enabled === false
    ? false
    : observedPayoutsEnabled;
  const now = new Date().toISOString();
  const receipt = {
    transition: 'STRIPE_CONNECTED_ACCOUNT_CAPABILITY_DEGRADED',
    lifecycle_version: STRIPE_CONNECTED_ACCOUNT_LIFECYCLE_VERSION,
    event_id: input.event_id,
    event_type: input.event_type,
    account_id: input.account_id,
    integration_id: integration.id,
    brand_id: integration.brand_id,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    observed_charges_enabled: observedChargesEnabled,
    observed_payouts_enabled: observedPayoutsEnabled,
    changed: true,
  };
  try {
    await updateAndVerify(
      'stripe_capability_drop',
      () => svc.entities.Integration.update(integration.id, {
        provider_capability_risk_status: 'DEGRADED',
        provider_charges_enabled: chargesEnabled,
        provider_payouts_enabled: payoutsEnabled,
        provider_capability_observed_at: now,
        provider_capability_event_id: input.event_id,
        last_error: `stripe_capability_degraded:charges=${chargesEnabled}:payouts=${payoutsEnabled}`,
      }),
      async () => {
        const row = await svc.entities.Integration.get(integration.id);
        return text(row?.provider_capability_risk_status) === 'DEGRADED' &&
          row?.provider_charges_enabled === chargesEnabled &&
          row?.provider_payouts_enabled === payoutsEnabled &&
          text(row?.provider_capability_event_id) === input.event_id;
      },
    );
    const log = await requireCriticalOperation(
      'stripe_capability_operational_log_write',
      () => svc.entities.OperationalLog.create({
        brand_id: integration.brand_id,
        provider_id: input.account_id,
        event_type: 'stripe_connected_account_capability_degraded',
        message: 'stripe_connected_account_capability_degraded',
        data_json: receipt,
        actor_email: 'stripe_webhook',
        created_at: now,
      }),
    );
    return { ...receipt, operational_log_id: text(log?.id) || null };
  } catch (cause) {
    throw new StripeConnectedAccountLifecycleError(
      'STRIPE_CONNECT_CAPABILITY_RECONCILIATION_REQUIRED',
      { receipt, cause },
    );
  }
}
