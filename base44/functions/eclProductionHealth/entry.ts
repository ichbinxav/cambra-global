import { safeBestEffort } from '../../shared/bestEffort.ts';
// eclProductionHealth — CAMBRA v0.66.0 / ECL P7.
// Authoritative critical-path health sweep. Detects liveness/backlog/drift and
// materializes idempotent OperationalIncident episodes. It NEVER invokes a
// recovery worker and never mutates evidence, invoices, payments or reviews.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { createOnce } from '../../shared/eclPersistence.ts';
import { P7_ACTIVE_INCIDENT_STATUSES, P7_WORKERS, buildIncidentRecord, incidentDedupeKey, workerFreshness, type P7IncidentSignal } from '../../shared/eclOperationalRecovery.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

const PLATFORM_TENANT = '_platform';
const HEALTH_AGENT = 'ecl_production_health';
const ECL_OVERDUE_MIN = 30;
const DLQ_OVERDUE_MIN = 15;
const REVIEW_RESOLVING_STALE_MIN = 30;

function ageMinutes(value: unknown, nowMs: number) {
  if (!value) return null;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor((nowMs - ms) / 60000)) : null;
}

async function ensureIncident(svc: any, signal: P7IncidentSignal, nowIso: string) {
  const rows = await svc.entities.OperationalIncident.filter({ dedupe_key: signal.dedupeKey }, '-created_date', 20);
  const active = (rows || []).find((row: any) => P7_ACTIVE_INCIDENT_STATUSES.includes(row.status));
  if (active) {
    await svc.entities.OperationalIncident.update(active.id, {
      severity: signal.severity === 'critical' || active.severity === 'critical' ? 'critical' : 'warning',
      summary: signal.summary.slice(0, 500), details_json: signal.details || {}, recovery_action: signal.recoveryAction,
      subject_type: signal.subjectType || '', subject_id: signal.subjectId || '', last_seen_at: nowIso,
      occurrence_count: Number(active.occurrence_count || 0) + 1,
    });
    return { id: active.id, created: false };
  }
  const record = buildIncidentRecord(signal, nowIso);
  const claim = await createOnce(svc, 'OperationalIncident', record.idempotency_key, record);
  const claimed = await svc.entities.OperationalIncident.get(claim.id);
  // A human may resolve while the authoritative signal is still present. A
  // same-bucket createOnce must therefore reopen that exact episode rather than
  // letting a manual resolution manufacture a temporary green window.
  if (claimed?.status === 'resolved') {
    await svc.entities.OperationalIncident.update(claimed.id, {
      status: 'open', severity: signal.severity, summary: signal.summary.slice(0, 500), details_json: signal.details || {},
      recovery_action: signal.recoveryAction, subject_type: signal.subjectType || '', subject_id: signal.subjectId || '',
      last_seen_at: nowIso, occurrence_count: Number(claimed.occurrence_count || 0) + 1,
      resolved_at: '', resolved_by: '', resolution_note: '',
    });
    return { id: claimed.id, created: false, reopened: true };
  }
  return { id: claim.id, created: claim.created, reopened: false };
}

async function activeHealthIncidents(svc: any) {
  const pages = await Promise.all(P7_ACTIVE_INCIDENT_STATUSES.map((status) => svc.entities.OperationalIncident.filter({ source: 'ecl_production_health', status }, '-created_date', 200)));
  return pages.flat();
}

export default async function (req: Request): Promise<Response> {
  let svc: any = null;
  let task: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    svc = base44.asServiceRole;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    task = await svc.entities.AgentTask.create({ brand_id: PLATFORM_TENANT, agent_name: HEALTH_AGENT, task_type: 'ecl_p7_health_sweep', status: 'running', requires_approval: false, risk_level: 1, input_summary: 'P7 authoritative critical production health', started_at: nowIso }).catch((error:any)=>safeBestEffort(error,{operation:'eclProductionHealth',fallback:null,severity:'secondary'}));

    const overdueCutoff = new Date(nowMs - ECL_OVERDUE_MIN * 60000).toISOString();
    const dlqCutoff = new Date(nowMs - DLQ_OVERDUE_MIN * 60000).toISOString();
    // No empty-array fallbacks: a critical read outage fails the sweep rather than manufacturing green.
    const [recentTasks, overdueStatements, overdueSavings, mismatchInvoices, errorInvoices, exhaustedDlq, pendingDlq, resolvingReviews] = await Promise.all([
      svc.entities.AgentTask.list('-created_date', 500),
      svc.entities.StatementImport.filter({ evidence_status: 'accepted_provisionally', next_lifecycle_action_at: { $lte: overdueCutoff } }, 'next_lifecycle_action_at', 100),
      svc.entities.SavingsEvidence.filter({ evidence_status: 'accepted_provisionally', next_lifecycle_action_at: { $lte: overdueCutoff } }, 'next_lifecycle_action_at', 100),
      svc.entities.Invoice.filter({ payment_provider: 'stripe', reconciliation_status: 'mismatch' }, '-created_date', 100),
      svc.entities.Invoice.filter({ payment_provider: 'stripe', reconciliation_status: 'error' }, '-created_date', 100),
      svc.entities.WebhookDeadLetter.filter({ status: 'exhausted' }, '-created_date', 100),
      svc.entities.WebhookDeadLetter.filter({ status: 'pending_retry', next_retry_at: { $lte: dlqCutoff } }, 'next_retry_at', 100),
      svc.entities.ReviewCase.filter({ status: 'resolving' }, '-created_date', 100),
    ]);

    const signals: P7IncidentSignal[] = [];
    for (const [agentName, contract] of Object.entries(P7_WORKERS)) {
      const freshness = workerFreshness(agentName, recentTasks || [], nowMs, contract.maxAgeMinutes);
      if (!freshness.healthy) signals.push({ dedupeKey: incidentDedupeKey('worker_liveness', agentName), domain: agentName === 'recover_billing_reconciler' ? 'billing_reconciliation' : agentName === 'webhook_dead_letter_processor' ? 'webhook_delivery' : 'evidence_lifecycle', incidentType: 'critical_worker_missed_slo', severity: 'critical', recoveryAction: contract.recoveryAction as P7IncidentSignal['recoveryAction'], summary: `${agentName} has no completed run inside its ${contract.maxAgeMinutes} minute P7 liveness window.`, subjectType: 'AgentTask', subjectId: agentName, details: freshness });
    }

    const eclOverdue = [...(overdueStatements || []), ...(overdueSavings || [])];
    if (eclOverdue.length) signals.push({ dedupeKey: incidentDedupeKey('ecl_overdue_backlog'), domain: 'evidence_lifecycle', incidentType: 'evidence_lifecycle_overdue_backlog', severity: eclOverdue.length >= 10 ? 'critical' : 'warning', recoveryAction: 'run_ecl_lifecycle_scheduler', summary: `${eclOverdue.length} evidence item(s) are overdue more than ${ECL_OVERDUE_MIN} minutes.`, subjectType: 'EvidenceLifecycle', details: { count: eclOverdue.length, threshold_minutes: ECL_OVERDUE_MIN } });

    for (const inv of mismatchInvoices || []) signals.push({ dedupeKey: incidentDedupeKey('invoice_reconciliation_mismatch', inv.id), domain: 'billing_reconciliation', incidentType: 'invoice_reconciliation_mismatch', severity: 'critical', recoveryAction: 'inspect_manual', summary: 'Stripe/local invoice binding mismatch is quarantined and requires manual inspection.', subjectType: 'Invoice', subjectId: inv.id, details: { invoice_id: inv.id, stripe_invoice_id: inv.stripe_invoice_id || null, last_reconciled_at: inv.last_reconciled_at || null, reconciliation_error: String(inv.reconciliation_error || '').slice(0, 500) } });
    for (const inv of errorInvoices || []) signals.push({ dedupeKey: incidentDedupeKey('invoice_reconciliation_error', inv.id), domain: 'billing_reconciliation', incidentType: 'invoice_reconciliation_error', severity: 'warning', recoveryAction: 'run_recover_billing_reconciler', summary: 'Recover invoice reconciliation could not converge Stripe state.', subjectType: 'Invoice', subjectId: inv.id, details: { invoice_id: inv.id, stripe_invoice_id: inv.stripe_invoice_id || null, reconciliation_error: String(inv.reconciliation_error || '').slice(0, 500) } });
    for (const dlq of exhaustedDlq || []) signals.push({ dedupeKey: incidentDedupeKey('webhook_dead_letter_exhausted', dlq.id), domain: 'webhook_delivery', incidentType: 'webhook_dead_letter_exhausted', severity: 'critical', recoveryAction: 'replay_webhook_dead_letter', summary: `Webhook delivery exhausted automatic retries after ${Number(dlq.total_attempts || 0)} attempt(s).`, subjectType: 'WebhookDeadLetter', subjectId: dlq.id, details: { dead_letter_id: dlq.id, event_type: dlq.event_type || null, total_attempts: Number(dlq.total_attempts || 0), last_response_code: Number(dlq.last_response_code || 0) || null } });
    if ((pendingDlq || []).length) signals.push({ dedupeKey: incidentDedupeKey('webhook_dead_letter_overdue'), domain: 'webhook_delivery', incidentType: 'webhook_dead_letter_overdue_backlog', severity: pendingDlq.length >= 10 ? 'critical' : 'warning', recoveryAction: 'run_webhook_dead_letters', summary: `${pendingDlq.length} webhook retry item(s) are overdue more than ${DLQ_OVERDUE_MIN} minutes.`, subjectType: 'WebhookDeadLetter', details: { count: pendingDlq.length, threshold_minutes: DLQ_OVERDUE_MIN } });
    for (const review of resolvingReviews || []) { const age = ageMinutes(review.updated_date || review.created_date, nowMs); if (age !== null && age > REVIEW_RESOLVING_STALE_MIN) signals.push({ dedupeKey: incidentDedupeKey('review_resolution_stuck', review.id), domain: 'review_workflow', incidentType: 'review_resolution_stuck', severity: 'critical', recoveryAction: 'inspect_manual', summary: `ReviewCase has remained resolving for ${age} minutes.`, subjectType: 'ReviewCase', subjectId: review.id, details: { review_case_id: review.id, age_minutes: age, threshold_minutes: REVIEW_RESOLVING_STALE_MIN } }); }

    const materialized = [];
    for (const signal of signals) materialized.push({ signal: signal.dedupeKey, ...(await ensureIncident(svc, signal, nowIso)) });
    const activeKeys = new Set(signals.map((signal) => signal.dedupeKey));
    const existingActive = await activeHealthIncidents(svc);
    let autoResolved = 0;
    for (const incident of existingActive) if (!activeKeys.has(incident.dedupe_key)) { await svc.entities.OperationalIncident.update(incident.id, { status: 'resolved', resolved_at: nowIso, resolved_by: 'system:p7_health', resolution_note: 'Signal cleared on an authoritative P7 health sweep.', last_recovery_error: '' }); autoResolved++; }

    const critical = signals.filter((signal) => signal.severity === 'critical').length;
    const warning = signals.filter((signal) => signal.severity === 'warning').length;
    const summary = { checked_at: nowIso, status: critical ? 'critical' : warning ? 'warning' : 'healthy', signals: signals.length, critical, warning, incidents_materialized: materialized.length, incidents_auto_resolved: autoResolved, worker_contracts: P7_WORKERS, guarantees: { detection: 'authoritative_reads_fail_closed', recovery: 'never_auto_executes', economics: 'no_invoice_payment_or_evidence_mutation' } };
    if (task?.id) await svc.entities.AgentTask.update(task.id, { status: 'completed', output_summary: `P7 health ${summary.status}: ${critical} critical · ${warning} warning · ${autoResolved} cleared`, output_payload_json: summary, completed_at: new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'eclProductionHealth',fallback:null,severity:'secondary'}));
    return Response.json({ ok: true, ...summary, materialized });
  } catch (error) {
    const message = String((error as Error)?.message || error || 'unknown_error');
    if (svc && task?.id) await svc.entities.AgentTask.update(task.id, { status: 'failed', error: message.slice(0, 500), completed_at: new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'eclProductionHealth',fallback:null,severity:'secondary'}));
    return Response.json({ ok: false, error: 'p7_health_sweep_failed', message }, { status: 500 });
  }
}
