import { sendCostGovernedEmail } from './costGovernance.ts';
import {
  captureEmergencyEpoch,
  type EmergencyEpochClaim,
} from './operationalControl.ts';
import {
  claimSchedulerRun,
  finishSchedulerRun,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
} from './schedulerRun.ts';
import { readRuntimeRows, requireRuntimeSource } from './runtimeSourceRead.ts';
import { readSingletonAuthority } from './singletonAuthority.ts';

export const INCIDENT_ALERTING_VERSION = 'incident-alerting-v2.0.0';
export const INCIDENT_ALERT_RETRY_MINUTES = 15;
export const INCIDENT_ALERT_MAX_ATTEMPTS = 5;
export const INCIDENT_ALERT_WINDOW_SECONDS = 15 * 60;
export const INCIDENT_ALERT_BATCH_WORKER_KEY = 'incidentAlertingAggregate';
const INCIDENT_ALERT_SOURCE_LIMIT = 5000;
const INCIDENT_ALERT_BODY_LIMIT = 100;

type IncidentAlertSeverity = 'HIGH' | 'CRITICAL';
type IncidentAlertDependencies = {
  now?: Date;
  recipient?: string;
  send?: (svc: any, input: any, payload: any) => Promise<any>;
};

const ACCEPTED_STATES = new Set(['ACCEPTED', 'OBSERVED', 'DELIVERED']);
const AMBIGUOUS_STATES = new Set([
  'CLAIMED',
  'PENDING',
  'EFFECTING',
  'RETRY_PENDING',
  'REVIEW_REQUIRED',
  'FAILED',
]);

function compact(value: any, limit = 200) {
  return String(value?.code || value?.message || value || 'unknown')
    .replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
}

function html(value: any) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

export function incidentAlertSeverity(incident: any): IncidentAlertSeverity | null {
  if (String(incident?.severity || '').toLowerCase() === 'critical') {
    return 'CRITICAL';
  }
  if (
    ['high', 'critical'].includes(
      String(incident?.customer_impact || '').toLowerCase(),
    )
  ) return 'HIGH';
  if (
    ['high', 'critical'].includes(
      String(incident?.legal_risk || '').toLowerCase(),
    )
  ) return 'HIGH';
  if (Number(incident?.financial_impact_minor || 0) > 0) return 'HIGH';
  return null;
}

/** Legacy per-incident key retained for old transport-ledger projections. */
export function incidentAlertKey(incident: any, severity: string) {
  return `incident:${String(incident?.id || incident?.dedupe_key || 'unknown')}:${severity}`;
}

export function incidentAlertWindowKey(at = new Date()) {
  const windowMs = INCIDENT_ALERT_WINDOW_SECONDS * 1000;
  return new Date(Math.floor(at.getTime() / windowMs) * windowMs).toISOString();
}

export function recipientFingerprint(email: string) {
  const normalized = String(email || '').trim().toLowerCase();
  const at = normalized.indexOf('@');
  return at > 0
    ? `${normalized.slice(0, 1)}***${normalized.slice(at)}`
    : 'configured-recipient';
}

export function configuredIncidentAlertRecipient() {
  return String(
    Deno.env.get('FOUNDER_ALERT_EMAIL') ||
      Deno.env.get('FOUNDER_EMAIL') ||
      Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || '',
  ).trim();
}

export function incidentAlertProvenPreEffect(existing: any) {
  const status = String(existing?.status || '');
  if (!['FAILED', 'RETRY_PENDING'].includes(status)) return false;
  const receipt = existing?.provider_receipt_json || {};
  return !existing?.effect_started_at &&
    !existing?.provider_message_id &&
    !existing?.accepted_at &&
    !existing?.delivered_at &&
    receipt?.provider_reference_present !== true &&
    receipt?.delivery_observed !== true &&
    Number(existing?.provider_effects || 0) === 0;
}

export function alertRetryDecision(existing: any, at = Date.now()) {
  if (ACCEPTED_STATES.has(String(existing?.status || ''))) {
    return { allowed: false, reason: 'already_accepted_or_observed' };
  }
  if (
    AMBIGUOUS_STATES.has(String(existing?.status || '')) &&
    !incidentAlertProvenPreEffect(existing)
  ) {
    return { allowed: false, reason: 'prior_effect_requires_review' };
  }
  if (Number(existing?.attempt_count || 0) >= INCIDENT_ALERT_MAX_ATTEMPTS) {
    return { allowed: false, reason: 'max_attempts_reached' };
  }
  const next = Date.parse(String(existing?.next_retry_at || ''));
  if (Number.isFinite(next) && next > at) {
    return { allowed: false, reason: 'retry_cooldown' };
  }
  return { allowed: true, reason: 'attempt_allowed' };
}

/** Explicitly excludes alerting-originated incidents from alerting itself. */
export function isIncidentAlertingSelfIncident(incident: any) {
  const key = String(incident?.dedupe_key || '').toLowerCase();
  const domain = String(incident?.domain || '').toLowerCase();
  const details = incident?.details_json || {};
  return domain === 'incident_alerting' || domain === 'alerting' ||
    key.startsWith('incident-alerting:') || key.startsWith('incident_alert:') ||
    details.alerting_origin === true ||
    String(details.source || details.source_system || '').toLowerCase() ===
      'incident_alerting';
}

function deliveryLinks(delivery: any) {
  if (Array.isArray(delivery?.incident_links_json)) {
    return delivery.incident_links_json.map((link: any) => ({
      incident_id: String(link?.incident_id || ''),
      severity: String(link?.severity || delivery?.severity || ''),
    })).filter((link: any) => link.incident_id);
  }
  const ids = Array.isArray(delivery?.incident_ids)
    ? delivery.incident_ids
    : delivery?.incident_id ? [delivery.incident_id] : [];
  return ids.map((id: any) => ({
    incident_id: String(id || ''),
    severity: String(delivery?.severity || ''),
  })).filter((link: any) => link.incident_id);
}

function severityCovers(observed: string, current: IncidentAlertSeverity) {
  return observed === 'CRITICAL' || observed === current;
}

export function selectIncidentAlertBatchCandidates(
  incidents: any[],
  deliveries: any[],
) {
  const acknowledged = new Set<string>();
  const ambiguous = new Set<string>();
  for (const delivery of deliveries) {
    const status = String(delivery?.status || '');
    for (const link of deliveryLinks(delivery)) {
      if (ACCEPTED_STATES.has(status)) {
        const current = incidentAlertSeverity(
          incidents.find((incident) => String(incident?.id || '') === link.incident_id),
        );
        if (current && severityCovers(link.severity, current)) {
          acknowledged.add(link.incident_id);
        }
      } else if (
        AMBIGUOUS_STATES.has(status) &&
        !incidentAlertProvenPreEffect(delivery)
      ) {
        ambiguous.add(link.incident_id);
      }
    }
  }
  const candidates = incidents.filter((incident) => {
    const id = String(incident?.id || '');
    return Boolean(id && incidentAlertSeverity(incident)) &&
      !isIncidentAlertingSelfIncident(incident) &&
      !acknowledged.has(id) && !ambiguous.has(id);
  }).sort((left, right) => {
    const severityDelta = Number(incidentAlertSeverity(right) === 'CRITICAL') -
      Number(incidentAlertSeverity(left) === 'CRITICAL');
    if (severityDelta) return severityDelta;
    return Date.parse(String(right?.last_seen_at || '')) -
      Date.parse(String(left?.last_seen_at || ''));
  });
  return {
    candidates,
    acknowledged_incident_ids: [...acknowledged].sort(),
    ambiguous_incident_ids: [...ambiguous].sort(),
    self_excluded_incident_ids: incidents.filter(isIncidentAlertingSelfIncident)
      .map((incident) => String(incident?.id || '')).filter(Boolean).sort(),
  };
}

export function buildIncidentAlertBatchPayload(
  incidents: any[],
  severity: IncidentAlertSeverity,
  recipient: string,
) {
  const visible = incidents.slice(0, INCIDENT_ALERT_BODY_LIMIT);
  const hidden = Math.max(0, incidents.length - visible.length);
  const rows = visible.map((incident) => {
    const itemSeverity = incidentAlertSeverity(incident) || 'HIGH';
    return `<li><strong>${html(itemSeverity)}</strong> · ${html(
      String(incident?.summary || 'Operational incident').slice(0, 300),
    )}<br><small>Domain: ${html(incident?.domain || 'unknown')} · Owner: ${
      html(incident?.owner_type || 'unassigned')
    } · Workflow: ${html(incident?.workflow_state || 'unknown')}</small></li>`;
  }).join('');
  const omitted = hidden
    ? `<p>${hidden} additional linked incident(s) are available in Founder Admin.</p>`
    : '';
  return {
    from_name: 'CAMBRA Operations',
    to: recipient,
    subject: `[${severity}] CAMBRA · ${incidents.length} operational incident${
      incidents.length === 1 ? '' : 's'
    }`,
    body: `<h2>CAMBRA ${severity} operational incident digest</h2><p>${
      incidents.length
    } eligible HIGH/CRITICAL incident(s) were aggregated into this single transport effect.</p><ul>${rows}</ul>${omitted}<p>Open Founder Admin to inspect canonical evidence, blockers and controls. This alert neither approves an action nor changes an incident.</p>`,
  };
}

function recentProviderEffect(deliveries: any[], now: Date) {
  const cutoff = now.getTime() - INCIDENT_ALERT_WINDOW_SECONDS * 1000;
  return deliveries.find((delivery) => {
    if (incidentAlertProvenPreEffect(delivery)) return false;
    const timestamp = Date.parse(String(
      delivery?.effect_started_at ||
        (['DELIVERED', 'RETRY_PENDING', 'FAILED'].includes(delivery?.status)
          ? delivery?.last_attempt_at
          : ''),
    ));
    return Number.isFinite(timestamp) && timestamp > cutoff;
  }) || null;
}

function preEffectBlockStatus(error: any) {
  const code = String(error?.code || '').trim().toUpperCase();
  if (['EMAIL_SENDER_UNAVAILABLE', 'ALERT_RECIPIENT_REQUIRED'].includes(code)) {
    return 'CONFIGURATION_REQUIRED';
  }
  // Only typed failures that prove the provider boundary was never entered may
  // remain retryable. A generic transport error after EFFECTING is ambiguous.
  if (new Set([
    'EMERGENCY_CONTROL_PAUSED',
    'EMERGENCY_CONTROL_EPOCH_INVALID',
    'EMERGENCY_CONTROL_EPOCH_CHANGED',
    'COST_BUDGET_BLOCKED',
    'COST_BUDGET_EXCEEDED',
    'COST_RESERVATION_CONCURRENCY_EXHAUSTED',
    'COST_EVENT_CLAIMED_CONCURRENTLY',
    'POSITIVE_COST_RESERVATION_REQUIRED',
  ]).has(code)) return 'BLOCKED';
  return 'REVIEW_REQUIRED';
}

async function persistDeliveryState(
  svc: any,
  delivery: any,
  claimToken: string,
  patch: any,
) {
  await svc.entities.IncidentAlertDelivery.update(delivery.id, patch);
  const verified = await svc.entities.IncidentAlertDelivery.get(delivery.id);
  if (
    !verified || String(verified.claim_token || '') !== claimToken ||
    (patch.status && String(verified.status || '') !== String(patch.status))
  ) {
    throw Object.assign(new Error('incident_alert_delivery_state_unverified'), {
      code: 'INCIDENT_ALERT_DELIVERY_STATE_UNVERIFIED',
    });
  }
  return verified;
}

async function markPersistenceAmbiguous(
  svc: any,
  delivery: any,
  claimToken: string,
  error: any,
) {
  const at = new Date().toISOString();
  try {
    const row = await persistDeliveryState(svc, delivery, claimToken, {
      status: 'REVIEW_REQUIRED',
      updated_at: at,
      next_retry_at: null,
      last_error_code: `POST_PROVIDER_PERSISTENCE:${compact(error)}`,
    });
    return { persisted: true, row };
  } catch (reviewError) {
    return {
      persisted: false,
      row: null,
      error: compact(reviewError),
    };
  }
}

async function executeClaimedIncidentAlertBatch(
  svc: any,
  schedulerClaim: any,
  dependencies: IncidentAlertDependencies,
) {
  const now = dependencies.now || new Date();
  const nowIso = now.toISOString();
  const incidentRead = await readRuntimeRows({
    source: 'incident_alert_open_authority',
    limit: INCIDENT_ALERT_SOURCE_LIMIT,
    read: () => svc.entities.AutonomyIncident.filter(
      { status: 'open' },
      '-last_seen_at',
      INCIDENT_ALERT_SOURCE_LIMIT,
    ),
  });
  const deliveryRead = await readRuntimeRows({
    source: 'incident_alert_delivery_history',
    limit: INCIDENT_ALERT_SOURCE_LIMIT,
    read: () => svc.entities.IncidentAlertDelivery.list(
      '-updated_at',
      INCIDENT_ALERT_SOURCE_LIMIT,
    ),
  });
  const incidents = requireRuntimeSource(incidentRead);
  const deliveries = requireRuntimeSource(deliveryRead);
  const selection = selectIncidentAlertBatchCandidates(incidents, deliveries);
  const selectionEvidence = {
    acknowledged_incident_ids: selection.acknowledged_incident_ids,
    ambiguous_incident_ids: selection.ambiguous_incident_ids,
    self_excluded_incident_ids: selection.self_excluded_incident_ids,
  };
  if (!selection.candidates.length) {
    return {
      attempted: false,
      status: selection.ambiguous_incident_ids.length
        ? 'REVIEW_REQUIRED'
        : 'NOT_PUSH_ELIGIBLE',
      eligible_count: 0,
      ...selectionEvidence,
    };
  }

  const recent = recentProviderEffect(deliveries, now);
  if (recent) {
    return {
      attempted: false,
      status: 'COOLDOWN',
      reason: 'one_provider_effect_per_rolling_15_minutes',
      eligible_count: selection.candidates.length,
      prior_delivery_id: recent.id || null,
      ...selectionEvidence,
    };
  }

  const windowKey = incidentAlertWindowKey(now);
  const batchKey = `incident-alert-batch:${windowKey}`;
  const existingRows = requireRuntimeSource(await readRuntimeRows({
    source: 'incident_alert_batch_authority',
    read: () => svc.entities.IncidentAlertDelivery.filter(
      { alert_key: batchKey },
      '-updated_at',
      2,
    ),
  }));
  if (existingRows.length > 1) {
    throw Object.assign(new Error('incident_alert_batch_authority_ambiguous'), {
      code: 'INCIDENT_ALERT_BATCH_AUTHORITY_AMBIGUOUS',
      status: 503,
    });
  }
  if (existingRows.length === 1) {
    const retry = alertRetryDecision(existingRows[0], now.getTime());
    return {
      attempted: false,
      status: existingRows[0].status,
      reason: retry.reason,
      eligible_count: selection.candidates.length,
      delivery_id: existingRows[0].id,
      ...selectionEvidence,
    };
  }

  const severity: IncidentAlertSeverity = selection.candidates.some(
      (incident) => incidentAlertSeverity(incident) === 'CRITICAL',
    )
    ? 'CRITICAL'
    : 'HIGH';
  const incidentLinks = selection.candidates.map((incident) => ({
    incident_id: String(incident.id),
    dedupe_key: String(incident.dedupe_key || ''),
    severity: incidentAlertSeverity(incident),
  }));
  const incidentIds = incidentLinks.map((link) => link.incident_id);
  const claimToken = `incident-alert:${crypto.randomUUID()}`;
  const recipient = dependencies.recipient === undefined
    ? configuredIncidentAlertRecipient()
    : String(dependencies.recipient || '').trim();
  const nextRetry = new Date(
    now.getTime() + INCIDENT_ALERT_RETRY_MINUTES * 60000,
  ).toISOString();
  const startedSchedulerClaim = await markSchedulerEffectStarted(
    svc,
    schedulerClaim,
  );
  const schedulerStartRejected = schedulerClaimDeniedResponse(
    startedSchedulerClaim,
  );
  if (schedulerStartRejected) {
    throw Object.assign(
      new Error(
        `incident_alert_scheduler_effect_start_blocked:${startedSchedulerClaim.reason}`,
      ),
      {
        code: 'INCIDENT_ALERT_SCHEDULER_EFFECT_START_BLOCKED',
        status: schedulerStartRejected.status,
        review_required: startedSchedulerClaim.review_required === true,
      },
    );
  }
  // Preserve object identity so the outer finalizer uses the advanced fence.
  Object.assign(schedulerClaim, startedSchedulerClaim);
  const delivery = await svc.entities.IncidentAlertDelivery.create({
    alert_key: batchKey,
    batch_key: batchKey,
    window_key: windowKey,
    effect_key: batchKey,
    claim_token: claimToken,
    scheduler_run_key: String(schedulerClaim?.run_key || ''),
    incident_id: incidentIds[0],
    incident_ids: incidentIds,
    incident_links_json: incidentLinks,
    severity,
    channel: 'EMAIL',
    recipient_fingerprint: recipient
      ? recipientFingerprint(recipient)
      : 'not-configured',
    status: 'CLAIMED',
    attempt_count: 1,
    last_attempt_at: nowIso,
    next_retry_at: nextRetry,
    last_error_code: '',
    created_at: nowIso,
    updated_at: nowIso,
  });
  const verifiedRows = requireRuntimeSource(await readRuntimeRows({
    source: 'incident_alert_batch_claim_verification',
    read: () => svc.entities.IncidentAlertDelivery.filter(
      { alert_key: batchKey },
      '-updated_at',
      2,
    ),
  }));
  if (
    verifiedRows.length !== 1 || String(verifiedRows[0]?.id || '') !==
      String(delivery.id || '') ||
    String(verifiedRows[0]?.claim_token || '') !== claimToken
  ) {
    throw Object.assign(new Error('incident_alert_batch_claim_unverified'), {
      code: 'INCIDENT_ALERT_BATCH_CLAIM_UNVERIFIED',
      status: 503,
    });
  }

  if (!recipient) {
    const blocked = await persistDeliveryState(svc, delivery, claimToken, {
      status: 'CONFIGURATION_REQUIRED',
      updated_at: nowIso,
      next_retry_at: nextRetry,
      last_error_code: 'FOUNDER_OR_ADMIN_ALERT_EMAIL_REQUIRED',
    });
    return {
      attempted: false,
      status: blocked.status,
      reason: blocked.last_error_code,
      eligible_count: incidentIds.length,
      delivery_id: delivery.id,
      incident_ids: incidentIds,
      ...selectionEvidence,
    };
  }
  if (
    !dependencies.send &&
    typeof svc?.integrations?.Core?.SendEmail !== 'function'
  ) {
    const blocked = await persistDeliveryState(svc, delivery, claimToken, {
      status: 'CONFIGURATION_REQUIRED',
      updated_at: nowIso,
      next_retry_at: nextRetry,
      last_error_code: 'EMAIL_SENDER_UNAVAILABLE',
    });
    return {
      attempted: false,
      status: blocked.status,
      reason: blocked.last_error_code,
      eligible_count: incidentIds.length,
      delivery_id: delivery.id,
      incident_ids: incidentIds,
      ...selectionEvidence,
    };
  }

  const outboundAuthority = await readSingletonAuthority(svc, {
    entity: 'OutboundControl',
    query: { control_key: 'global' },
    sort: '-created_date',
    authority: 'incident_alert_outbound_control',
  });
  if (!outboundAuthority.ok || !outboundAuthority.row) {
    const reason = outboundAuthority.blocker ||
      'incident_alert_outbound_control_unavailable';
    const blocked = await persistDeliveryState(svc, delivery, claimToken, {
      status: 'BLOCKED',
      updated_at: nowIso,
      next_retry_at: nextRetry,
      last_error_code: reason,
    });
    return {
      attempted: false,
      status: blocked.status,
      reason,
      eligible_count: incidentIds.length,
      delivery_id: delivery.id,
      incident_ids: incidentIds,
      ...selectionEvidence,
    };
  }
  if (
    outboundAuthority.row.acquisition_enabled !== true ||
    outboundAuthority.row.volume_resend_enabled !== true
  ) {
    const reason = 'OUTBOUND_COMMUNICATION_CONTAINED';
    const blocked = await persistDeliveryState(svc, delivery, claimToken, {
      status: 'BLOCKED',
      updated_at: nowIso,
      next_retry_at: nextRetry,
      last_error_code: reason,
    });
    return {
      attempted: false,
      status: blocked.status,
      reason,
      eligible_count: incidentIds.length,
      delivery_id: delivery.id,
      incident_ids: incidentIds,
      ...selectionEvidence,
    };
  }

  let emergencyEpoch: EmergencyEpochClaim;
  try {
    emergencyEpoch = await captureEmergencyEpoch(svc, 'communications');
  } catch (error) {
    const reason = compact(error);
    const blocked = await persistDeliveryState(svc, delivery, claimToken, {
      status: 'BLOCKED',
      updated_at: nowIso,
      next_retry_at: nextRetry,
      last_error_code: reason,
    });
    return {
      attempted: false,
      status: blocked.status,
      reason,
      eligible_count: incidentIds.length,
      delivery_id: delivery.id,
      incident_ids: incidentIds,
      ...selectionEvidence,
    };
  }

  const effecting = await persistDeliveryState(svc, delivery, claimToken, {
    status: 'EFFECTING',
    effect_started_at: nowIso,
    updated_at: nowIso,
    next_retry_at: null,
    last_error_code: '',
  });
  const send = dependencies.send || sendCostGovernedEmail;
  let sent: any;
  try {
    sent = await send(
      svc,
      {
        event_key: batchKey,
        stable_event_key: true,
        source: 'incidentAlerting',
        provider: 'base44_email',
        related_entity_type: 'IncidentAlertDelivery',
        related_entity_id: String(delivery.id || ''),
        emergency_epoch_claim: emergencyEpoch,
      },
      buildIncidentAlertBatchPayload(selection.candidates, severity, recipient),
    );
  } catch (error) {
    const status = preEffectBlockStatus(error);
    try {
      const failed = await persistDeliveryState(svc, effecting, claimToken, {
        status,
        updated_at: new Date().toISOString(),
        next_retry_at: status === 'REVIEW_REQUIRED' ? null : nextRetry,
        last_error_code: compact(error),
      });
      return {
        attempted: true,
        status: failed.status,
        reason: failed.last_error_code,
        review_required: failed.status === 'REVIEW_REQUIRED',
        eligible_count: incidentIds.length,
        delivery_id: delivery.id,
        incident_ids: incidentIds,
        ...selectionEvidence,
      };
    } catch (persistenceError) {
      const ambiguity = await markPersistenceAmbiguous(
        svc,
        effecting,
        claimToken,
        persistenceError,
      );
      return {
        attempted: true,
        status: 'REVIEW_REQUIRED',
        reason: compact(error),
        review_required: true,
        persistence_ambiguous: !ambiguity.persisted,
        eligible_count: incidentIds.length,
        delivery_id: delivery.id,
        incident_ids: incidentIds,
        ...selectionEvidence,
      };
    }
  }

  if (sent?.duplicate === true) {
    const ambiguous = await persistDeliveryState(svc, effecting, claimToken, {
      status: 'REVIEW_REQUIRED',
      updated_at: new Date().toISOString(),
      next_retry_at: null,
      last_error_code: 'PROVIDER_EFFECT_PREVIOUSLY_CLAIMED_RECONCILIATION_REQUIRED',
    });
    return {
      attempted: true,
      status: ambiguous.status,
      review_required: true,
      eligible_count: incidentIds.length,
      delivery_id: delivery.id,
      incident_ids: incidentIds,
      ...selectionEvidence,
    };
  }

  try {
    const acceptedAt = new Date().toISOString();
    const accepted = await persistDeliveryState(svc, effecting, claimToken, {
      status: 'ACCEPTED',
      accepted_at: acceptedAt,
      updated_at: acceptedAt,
      next_retry_at: null,
      provider_message_id: String(sent?.id || sent?.message_id || ''),
      provider_receipt_json: {
        provider_status: String(sent?.status || 'ACCEPTED'),
        provider_reference_present: Boolean(sent?.id || sent?.message_id),
        delivery_observed: false,
      },
      last_error_code: '',
    });
    return {
      attempted: true,
      status: accepted.status,
      provider_effects: 1,
      delivery_observed: false,
      eligible_count: incidentIds.length,
      delivery_id: delivery.id,
      incident_ids: incidentIds,
      ...selectionEvidence,
    };
  } catch (persistenceError) {
    const ambiguity = await markPersistenceAmbiguous(
      svc,
      effecting,
      claimToken,
      persistenceError,
    );
    return {
      attempted: true,
      status: 'REVIEW_REQUIRED',
      provider_effects: 1,
      review_required: true,
      persistence_ambiguous: !ambiguity.persisted,
      eligible_count: incidentIds.length,
      delivery_id: delivery.id,
      incident_ids: incidentIds,
      ...selectionEvidence,
    };
  }
}

/**
 * Runs one aggregated founder-alert cycle under the existing scheduler CAS /
 * lease / fencing authority. The separate worker key is deliberate: the
 * physical host remains maintenanceEngine while the 15-minute material slot
 * remains independent from its 10-minute diagnostic sweep.
 */
export async function dispatchIncidentAlertBatch(
  svc: any,
  req: Request,
  dependencies: IncidentAlertDependencies = {},
) {
  const schedulerClaim = await claimSchedulerRun(svc, req, {
    worker_key: INCIDENT_ALERT_BATCH_WORKER_KEY,
    cadence_seconds: INCIDENT_ALERT_WINDOW_SECONDS,
  });
  if (!schedulerClaim.allowed) {
    const response = schedulerClaimDeniedResponse(schedulerClaim);
    return {
      attempted: false,
      status: schedulerClaim.duplicate_proven ? 'COOLDOWN' : 'BLOCKED',
      reason: schedulerClaim.reason,
      scheduler_http_status: response?.status || 503,
      review_required: schedulerClaim.review_required === true,
      eligible_count: 0,
    };
  }
  let result: any;
  let completed = false;
  let executionError: any = null;
  try {
    result = await executeClaimedIncidentAlertBatch(
      svc,
      schedulerClaim,
      dependencies,
    );
    completed = true;
  } catch (error) {
    executionError = error;
  }
  const finished = await finishSchedulerRun(
    svc,
    schedulerClaim,
    {
      worker_key: INCIDENT_ALERT_BATCH_WORKER_KEY,
      alert_status: result?.status || 'FAILED',
      provider_effects: Number(result?.provider_effects || 0),
      execution_error: executionError ? compact(executionError) : null,
    },
    completed,
  );
  if (!finished?.ok) {
    throw Object.assign(
      new Error(`incident_alert_scheduler_finalize_ambiguous:${finished?.reason || 'unknown'}`),
      {
        code: 'INCIDENT_ALERT_SCHEDULER_FINALIZE_AMBIGUOUS',
        status: 503,
        review_required: true,
      },
    );
  }
  if (executionError) throw executionError;
  return result;
}
