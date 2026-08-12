import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { CAMBRA_PUBLIC_LEGAL_IDENTITY, readInternalFiscalProfile } from '../../shared/cambraLegalIdentity.ts';

const PLATFORM = '_platform';
const ACTIVE_INCIDENTS = ['open', 'acknowledged', 'recovering'];
const TERMINAL_TASKS = new Set(['completed', 'failed', 'cancelled']);
const WORKERS = [
  { id: 'webhook_dlq', agent: 'webhook_dead_letter_processor', label: 'Webhook DLQ', cadence: '5 min', maxAgeMinutes: 15 },
  { id: 'production_health', agent: 'ecl_production_health', label: 'Production health', cadence: '10 min', maxAgeMinutes: 25 },
  { id: 'ecl_lifecycle', agent: 'ecl_lifecycle_scheduler', label: 'ECL lifecycle', cadence: '15 min', maxAgeMinutes: 40 },
  { id: 'billing_reconciliation', agent: 'recover_billing_reconciler', label: 'Billing reconciliation', cadence: '15 min', maxAgeMinutes: 40 },
];

const ageMinutes = (value: unknown) => {
  const t = typeof value === 'string' ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'getAdminOperationsCockpit',fallback:null,severity:'secondary'}));
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });

  const svc = base44.asServiceRole;
  const degradedSources: string[] = [];
  const safeRead = async (name: string, fn: () => Promise<any[]>) => {
    try {
      const data = await fn();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      degradedSources.push(name);
      console.error(`getAdminOperationsCockpit read failed: ${name}`, error);
      return [];
    }
  };

  const [tasks, incidents, approvals, questions, reviewCases, reports, invoices, deadLetters] = await Promise.all([
    safeRead('AgentTask', () => svc.entities.AgentTask.list('-created_date', 500)),
    safeRead('OperationalIncident', () => svc.entities.OperationalIncident.list('-last_detected_at', 200)),
    safeRead('Approval', () => svc.entities.Approval.filter({ status: 'pending' }, '-created_date', 200)),
    safeRead('AgentQuestion', () => svc.entities.AgentQuestion.filter({ status: 'pending' }, '-created_date', 200)),
    safeRead('ReviewCase', () => svc.entities.ReviewCase.list('-created_date', 200)),
    safeRead('MonthlySavingsReport', () => svc.entities.MonthlySavingsReport.list('-created_date', 300)),
    safeRead('Invoice', () => svc.entities.Invoice.list('-created_date', 300)),
    safeRead('WebhookDeadLetter', () => svc.entities.WebhookDeadLetter.list('-created_date', 300)),
  ]);

  const activeIncidents = incidents.filter((x: any) => ACTIVE_INCIDENTS.includes(x.status));
  const criticalIncidents = activeIncidents.filter((x: any) => x.severity === 'critical');
  const workers = WORKERS.map((w) => {
    const latest = tasks.find((t: any) => t.agent_name === w.agent) || null;
    const at = latest?.completed_at || latest?.started_at || latest?.created_date || null;
    const age = ageMinutes(at);
    const healthy = !!latest && latest.status === 'completed' && age !== null && age <= w.maxAgeMinutes;
    return { ...w, status: healthy ? 'healthy' : latest?.status === 'failed' ? 'failed' : 'stale', last_run_at: at, age_minutes: age, task_id: latest?.id || null, error: latest?.error || null };
  });
  const agentTasks = tasks.filter((t: any) => t.brand_id === PLATFORM || t.agent_name);
  const latestByAgent = new Map<string, any>();
  for (const t of agentTasks) if (t.agent_name && !latestByAgent.has(t.agent_name)) latestByAgent.set(t.agent_name, t);
  const failed24h = agentTasks.filter((t: any) => t.status === 'failed' && (ageMinutes(t.completed_at || t.created_date) ?? Infinity) <= 1440).length;
  const running = agentTasks.filter((t: any) => !TERMINAL_TASKS.has(t.status));
  const pendingReviews = reviewCases.filter((x: any) => !['resolved', 'dismissed', 'closed'].includes(x.status)).length;
  const awaitingApproval = reports.filter((r: any) => !r.invoice_id && r.status !== 'void' && ['verified', 'realized'].includes(r.verification_status) && r.measurement_mode === 'fully_verified' && !['eligible', 'invoiced', 'no_positive_savings'].includes(r.billing_eligibility_status)).length;
  const invoiceEligible = reports.filter((r: any) => r.billing_eligibility_status === 'eligible' && !r.invoice_id && r.status !== 'void').length;
  const reconciliationMismatch = invoices.filter((i: any) => ['mismatch', 'error'].includes(i.reconciliation_status)).length;
  const exhaustedDlq = deadLetters.filter((d: any) => d.status === 'exhausted').length;
  const attention = criticalIncidents.length + pendingReviews + approvals.length + questions.length + awaitingApproval + invoiceEligible + reconciliationMismatch + exhaustedDlq + failed24h;
  const overall = criticalIncidents.length || reconciliationMismatch || exhaustedDlq
    ? 'critical'
    : degradedSources.length || attention || workers.some((w) => w.status !== 'healthy')
      ? 'warning'
      : 'healthy';
  const internalFiscalProfile = readInternalFiscalProfile();

  return Response.json({
    ok: true,
    generated_at: new Date().toISOString(),
    overall_status: overall,
    attention_count: attention,
    degraded_sources: degradedSources,
    data_complete: degradedSources.length === 0,
    company_identity: {
      ...CAMBRA_PUBLIC_LEGAL_IDENTITY,
      internal_fiscal_profile_status: internalFiscalProfile.ok ? 'configured' : 'configuration_required',
      internal_fiscal_profile: internalFiscalProfile.ok ? internalFiscalProfile.profile : null,
      internal_fiscal_profile_missing: internalFiscalProfile.ok ? [] : internalFiscalProfile.missing,
    },
    metrics: {
      active_incidents: activeIncidents.length,
      critical_incidents: criticalIncidents.length,
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
    },
    workers,
    incidents: activeIncidents.slice(0, 8).map((x: any) => ({
      id: x.id,
      incident_type: x.incident_type,
      severity: x.severity,
      status: x.status,
      title: x.title,
      summary: x.summary,
      last_detected_at: x.last_detected_at,
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
