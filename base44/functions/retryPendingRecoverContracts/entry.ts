import { safeBestEffort } from '../../shared/bestEffort.ts';
// retryPendingRecoverContracts — RECOVER-3 (2026-08-03).
//
// THE reconciler. Because this platform has no queue and no job runner, an
// un-awaited call can vanish when a serverless invocation ends — so the durable
// guarantee is not the call, it is this scan of persisted state:
//
//   · PDF pending / failed_retryable, past its backoff window;
//   · PDF stuck in 'generating' with an EXPIRED lease (abandoned worker);
//   · email pending / failed_retryable, past its backoff window.
//
// It never resumes a job whose lease is still alive, never retries a permanent
// failure, and processes a bounded batch per run so one bad row cannot starve the
// rest. Admin or internal only.
//
// TRIGGER, VERIFIED (RECOVER-3-FIX, 2026-08-03): a real platform scheduled
// automation runs this every 15 minutes ("Recover contract delivery reconciler",
// EventBridge-backed, same mechanism as the pre-existing weekly benchmark
// recompute). It is not an "intended" trigger — it was observed executing on
// schedule, and its first live runs are what exposed the 404 bug in the internal
// invocation path (see shared/invokeInternal.ts).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { leaseExpired } from '../../shared/recoverContractState.ts';
import { invokeInternal } from '../../shared/invokeInternal.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

const BATCH = 10;

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const gate = await requireAdminOrInternal(req, base44, body);
  if (!gate.ok) return gate.response;

  const svc = base44.asServiceRole;
  const now = Date.now();
  const due = (v: unknown) => {
    if (!v) return true;
    const t = new Date(String(v)).getTime();
    return !Number.isFinite(t) || t <= now;
  };

  // One scan of recent mandates: filtering in memory keeps this to a single query
  // instead of one per status combination.
  const rows = await svc.entities.Mandate.filter({ status: 'active' }, '-created_date', 200).catch((error:any)=>safeBestEffort(error,{operation:'retryPendingRecoverContracts',fallback:[],severity:'critical'}));

  const pdfJobs: any[] = [];
  const emailJobs: any[] = [];

  for (const m of rows || []) {
    const pdfStatus = m.contract_pdf_status || 'pending';
    const emailStatus = m.contract_email_status || 'not_ready';

    const pdfDue =
      (pdfStatus === 'pending' || pdfStatus === 'failed_retryable') && due(m.contract_pdf_next_retry_at);
    const pdfAbandoned = pdfStatus === 'generating' && leaseExpired(m.contract_pdf_last_attempt_at);
    if (pdfDue || pdfAbandoned) {
      pdfJobs.push(m);
      continue; // the generator queues the email itself on success
    }

    if (pdfStatus === 'generated') {
      const emailDue =
        (emailStatus === 'pending' || emailStatus === 'failed_retryable') && due(m.contract_email_next_retry_at);
      const emailAbandoned = emailStatus === 'sending' && leaseExpired(m.contract_email_last_attempt_at);
      if (emailDue || emailAbandoned) emailJobs.push(m);
    }
  }

  const results: Record<string, unknown>[] = [];

  for (const m of pdfJobs.slice(0, BATCH)) {
    const r = await invokeInternal(base44, 'generateRecoverContractPdf', { mandate_id: m.id }).catch((error:any)=>safeBestEffort(error,{operation:'retryPendingRecoverContracts',fallback:null,severity:'critical'}));
    results.push({ mandate_id: m.id, job: 'pdf', ok: Boolean(r?.ok), status: r?.status ?? 0 });
  }
  for (const m of emailJobs.slice(0, BATCH)) {
    const r = await invokeInternal(base44, 'sendRecoverContractEmail', { mandate_id: m.id }).catch((error:any)=>safeBestEffort(error,{operation:'retryPendingRecoverContracts',fallback:null,severity:'critical'}));
    results.push({ mandate_id: m.id, job: 'email', ok: Boolean(r?.ok), status: r?.status ?? 0 });
  }

  return Response.json({
    ok: true,
    scanned: (rows || []).length,
    pdf_due: pdfJobs.length,
    email_due: emailJobs.length,
    processed: results.length,
    results,
  });
}