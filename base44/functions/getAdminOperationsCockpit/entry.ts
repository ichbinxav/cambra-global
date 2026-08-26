import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { CAMBRA_PUBLIC_LEGAL_IDENTITY, readInternalFiscalProfile } from '../../shared/cambraLegalIdentity.ts';
import {
  CANONICAL_INCIDENT_ADAPTER_VERSION,
  canonicalIncidentCoverage,
  canonicalIncidentView,
  observeBoundedOperationalCollection,
} from '../../shared/canonicalIncident.ts';

const PLATFORM = '_platform';
const TERMINAL_TASKS = new Set(['completed', 'failed', 'cancelled']);
const WORKERS = [
  {
    id: 'webhook_dlq',
    agent: 'webhook_dead_letter_processor',
    worker_key: 'processWebhookDeadLetters',
    label: 'Webhook DLQ',
    cadence: '5 min',
    maxAgeMinutes: 15,
  },
  {
    id: 'production_health',
    agent: 'ecl_production_health',
    worker_key: 'eclProductionHealth',
    label: 'Production health',
    cadence: '10 min',
    maxAgeMinutes: 25,
  },
  {
    id: 'ecl_lifecycle',
    agent: 'ecl_lifecycle_scheduler',
    worker_key: 'eclLifecycleScheduler',
    label: 'ECL lifecycle',
    cadence: '15 min',
    maxAgeMinutes: 40,
  },
  {
    id: 'billing_reconciliation',
    agent: 'recover_billing_reconciler',
    worker_key: 'reconcileRecoverBilling',
    label: 'Billing reconciliation',
    cadence: '15 min',
    maxAgeMinutes: 40,
  },
];

const ageMinutes = (value: unknown) => {
  const t = typeof value === 'string' ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch((error: any) =>
    safeBestEffort(error, {
      operation: 'getAdminOperationsCockpit',
      fallback: null,
      severity: 'secondary',
    })
  );
  if (!user) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (user.role !== 'admin') {
    return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const svc = base44.asServiceRole;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const degradedSources: string[] = [];
  const truncatedSources: string[] = [];
  const observations = new Map<string, {
    coverage_status: 'COMPLETE' | 'UNKNOWN';
    reason_code: string | null;
  }>();
  const pushUnique = (target: string[], name: string) => {
    if (!target.includes(name)) target.push(name);
  };
  const safeRead = async (
    name: string,
    cap: number,
    fn: (requestedLimit: number) => Promise<unknown>,
  ) => {
    const observation = await observeBoundedOperationalCollection<any>(
      name,
      cap,
      fn,
    );
    observations.set(name, observation);
    if (observation.coverage_status === 'UNKNOWN') {
      pushUnique(degradedSources, name);
      if (observation.reason_code === 'RESULT_SET_TRUNCATED') {
        pushUnique(truncatedSources, name);
      }
      console.error(
        `getAdminOperationsCockpit coverage UNKNOWN: ${name}:${observation.reason_code}`,
      );
    }
    return observation.rows;
  };

  const [
    failedTasksByCompletion,
    failedTasksByCreation,
    activeTasks,
    workerRunBuckets,
    autonomyIncidents,
    operationalIncidents,
    approvals,
    questions,
    reviewCases,
    reports,
    invoices,
    deadLetters,
  ] = await Promise.all([
    safeRead(
      'AgentTaskFailed24hByCompletion',
      500,
      (limit) => svc.entities.AgentTask.filter({ status: 'failed', completed_at: { $gte: since24h } }, '-completed_at', limit),
    ),
    safeRead(
      'AgentTaskFailed24hByCreation',
      500,
      (limit) => svc.entities.AgentTask.filter({ status: 'failed', created_date: { $gte: since24h } }, '-created_date', limit),
    ),
    safeRead(
      'AgentTaskActive',
      500,
      (limit) => svc.entities.AgentTask.filter({ status: { $nin: [...TERMINAL_TASKS] } }, '-created_date', limit),
    ),
    Promise.all(WORKERS.map((worker) => safeRead(
      `SchedulerRun:${worker.worker_key}`,
      100,
      (limit) => svc.entities.SchedulerRun.filter({ worker_key: worker.worker_key, invocation_kind: 'SCHEDULED' }, '-started_at', limit),
    ))),
    safeRead(
      'AutonomyIncident',
      500,
      (limit) => svc.entities.AutonomyIncident.list('-last_seen_at', limit),
    ),
    safeRead(
      'OperationalIncident',
      200,
      (limit) => svc.entities.OperationalIncident.list('-last_seen_at', limit),
    ),
    safeRead(
      'Approval',
      200,
      (limit) =>
        svc.entities.Approval.filter(
          { status: 'pending' },
          '-created_date',
          limit,
        ),
    ),
    safeRead(
      'AgentQuestion',
      200,
      (limit) =>
        svc.entities.AgentQuestion.filter(
          { status: 'pending' },
          '-created_date',
          limit,
        ),
    ),
    safeRead(
      'ReviewCase',
      200,
      (limit) => svc.entities.ReviewCase.list('-created_date', limit),
    ),
    safeRead(
      'MonthlySavingsReport',
      300,
      (limit) => svc.entities.MonthlySavingsReport.list('-created_date', limit),
    ),
    safeRead(
      'Invoice',
      300,
      (limit) => svc.entities.Invoice.list('-created_date', limit),
    ),
    safeRead(
      'WebhookDeadLetter',
      300,
      (limit) => svc.entities.WebhookDeadLetter.list('-created_date', limit),
    ),
  ]);

  const taskMap = new Map<string, any>();
  for (const task of [...failedTasksByCompletion, ...failedTasksByCreation, ...activeTasks]) taskMap.set(String(task.id), task);
  const tasks = [...taskMap.values()].sort((a: any, b: any) => String(b.created_date || '').localeCompare(String(a.created_date || '')));

  const canonicalIncidents = canonicalIncidentView(
    autonomyIncidents,
    operationalIncidents,
  );
  const activeIncidents = canonicalIncidents.filter((x: any) => x.status === 'open');
  const criticalIncidents = activeIncidents.filter((x: any) => x.severity === 'critical');
  const incidentCoverage = canonicalIncidentCoverage(
    autonomyIncidents,
    operationalIncidents,
    canonicalIncidents,
    {
      autonomy_complete:
        observations.get('AutonomyIncident')?.coverage_status === 'COMPLETE',
      operational_complete:
        observations.get('OperationalIncident')?.coverage_status === 'COMPLETE',
    },
  );
  const workers = WORKERS.map((w, index) => {
    const latest = workerRunBuckets[index]?.[0] || null;
    const at = latest?.completed_at || latest?.started_at || null;
    const age = ageMinutes(at);
    const healthy = !!latest && latest.status === 'COMPLETED' && age !== null &&
      age <= w.maxAgeMinutes;
    return {
      ...w,
      status: healthy ? 'healthy' : latest?.status === 'FAILED' ? 'failed' : latest ? 'stale' : 'unknown',
      last_run_at: at,
      age_minutes: age,
      scheduler_run_id: latest?.id || null,
      error: latest?.details_json?.reason || null,
    };
  });
  const agentTasks = tasks.filter((t: any) => t.brand_id === PLATFORM || t.agent_name);
  const latestByAgent = new Map<string, any>();
  for (const t of agentTasks) {
    if (t.agent_name && !latestByAgent.has(t.agent_name)) {
      latestByAgent.set(t.agent_name, t);
    }
  }
  const failed24h = agentTasks.filter((t: any) =>
    t.status === 'failed' &&
    (ageMinutes(t.completed_at || t.created_date) ?? Infinity) <= 1440
  ).length;
  const running = agentTasks.filter((t: any) => !TERMINAL_TASKS.has(t.status));
  const pendingReviews = reviewCases.filter((x: any) => !['resolved', 'dismissed', 'closed'].includes(x.status)).length;
  const awaitingApproval = reports.filter((r: any) =>
    !r.invoice_id && r.status !== 'void' &&
    ['verified', 'realized'].includes(r.verification_status) &&
    r.measurement_mode === 'fully_verified' &&
    !['eligible', 'invoiced', 'no_positive_savings'].includes(
      r.billing_eligibility_status,
    )
  ).length;
  const invoiceEligible = reports.filter((r: any) =>
    r.billing_eligibility_status === 'eligible' && !r.invoice_id &&
    r.status !== 'void'
  ).length;
  const reconciliationMismatch = invoices.filter((i: any) =>
    ['mismatch', 'error'].includes(i.reconciliation_status)
  ).length;
  const exhaustedDlq = deadLetters.filter((d: any) => d.status === 'exhausted').length;
  const attention = criticalIncidents.length + pendingReviews +
    approvals.length + questions.length + awaitingApproval + invoiceEligible +
    reconciliationMismatch + exhaustedDlq + failed24h;
  const overall = criticalIncidents.length || reconciliationMismatch || exhaustedDlq
    ? 'critical'
    : degradedSources.length || truncatedSources.length || attention ||
        workers.some((w) => w.status !== 'healthy')
    ? 'warning'
    : 'healthy';
  const internalFiscalProfile = readInternalFiscalProfile();

  return Response.json({
    ok: true,
    generated_at: new Date().toISOString(),
    overall_status: overall,
    attention_count: attention,
    attention_count_semantics: degradedSources.length === 0
      ? 'EXACT'
      : 'OBSERVED_LOWER_BOUND',
    degraded_sources: degradedSources,
    truncated_sources: truncatedSources,
    data_complete: degradedSources.length === 0 &&
      truncatedSources.length === 0,
    company_identity: {
      ...CAMBRA_PUBLIC_LEGAL_IDENTITY,
      internal_fiscal_profile_status: internalFiscalProfile.ok ? 'configured' : 'configuration_required',
      internal_fiscal_profile: internalFiscalProfile.ok ? internalFiscalProfile.profile : null,
      internal_fiscal_profile_missing: internalFiscalProfile.ok ? [] : internalFiscalProfile.missing,
    },
    metrics: {
      active_incidents: incidentCoverage.data_complete
        ? activeIncidents.length
        : null,
      active_incidents_observed: activeIncidents.length,
      critical_incidents: incidentCoverage.data_complete
        ? criticalIncidents.length
        : null,
      critical_incidents_observed: criticalIncidents.length,
      incident_count_semantics: incidentCoverage.count_semantics,
      pending_reviews: pendingReviews,
      pending_approvals: approvals.length,
      agent_questions: questions.length,
      recover_awaiting_approval: awaitingApproval,
      recover_invoice_eligible: invoiceEligible,
      reconciliation_mismatch: reconciliationMismatch,
      exhausted_dead_letters: exhaustedDlq,
      agent_failures_24h: failed24h,
      agent_running_or_waiting: running.length,
      agents_seen: latestByAgent.size,
      degraded_sources: degradedSources.length,
      truncated_sources: truncatedSources.length,
      canonical_incident_rows: canonicalIncidents.length,
      autonomy_incident_source_rows: autonomyIncidents.length,
      operational_incident_source_rows: operationalIncidents.length,
    },
    incident_adapter_version: CANONICAL_INCIDENT_ADAPTER_VERSION,
    incident_coverage: {
      ...incidentCoverage,
      incidents_returned: activeIncidents.length,
      all_observed_active_rows_returned: true,
    },
    workers,
    incidents: activeIncidents.map((x: any) => ({
      id: x.id,
      canonical_key: x.canonical_key,
      canonical_authority: x.canonical_authority,
      source_links: x.source_links,
      incident_type: x.incident_type,
      severity: x.severity,
      status: x.status,
      workflow_state: x.workflow_state,
      owner_type: x.owner_type,
      title: x.summary,
      summary: x.summary,
      last_detected_at: x.last_seen_at,
      occurrence_count: x.occurrence_count,
    })),
    attention: {
      reviews: pendingReviews,
      approvals: approvals.length,
      questions: questions.length,
      recover_awaiting_approval: awaitingApproval,
      recover_invoice_eligible: invoiceEligible,
      reconciliation_mismatch: reconciliationMismatch,
      exhausted_dead_letters: exhaustedDlq,
    },
  });
});
