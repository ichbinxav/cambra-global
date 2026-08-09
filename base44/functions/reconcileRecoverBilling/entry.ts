// reconcileRecoverBilling — CAMBRA v0.65.0 / ECL P6.
//
// Read-only against Stripe: GET current invoice state, validate the frozen
// local↔remote binding, then repair ONLY local lifecycle mirrors. It never
// creates/finalizes/pays/refunds/credits a Stripe object and never edits frozen
// invoice economics. Runs every 15 minutes and is also admin/internal callable.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { resolveBillingMode, stripeRequest } from '../../shared/stripeBilling.ts';
import {
  appendPaymentEventOnce,
  expectedInvoiceTotalMinor,
  healRecoverInvoiceDuplicatesForReport,
  reconciliationEventHash,
  stripeStatusProjection,
  validateStripeInvoiceBinding,
} from '../../shared/economicExecution.ts';

const MAX_BATCH = 100;
const PLATFORM_TENANT = '_platform';
const RECONCILER_AGENT = 'recover_billing_reconciler';

export default async function (req: Request): Promise<Response> {
  let svc: any = null;
  let task: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const requested = Number(body?.args?.limit ?? body?.limit ?? 50);
    const limit = Math.max(1, Math.min(MAX_BATCH, Number.isFinite(requested) ? Math.floor(requested) : 50));
    svc = base44.asServiceRole;
    const mode = resolveBillingMode();
    task = await svc.entities.AgentTask.create({
      brand_id: PLATFORM_TENANT,
      agent_name: RECONCILER_AGENT,
      task_type: 'recover_billing_reconciliation',
      status: 'running',
      requires_approval: false,
      risk_level: 1,
      input_summary: `P7-observed P6 Stripe read-only reconciliation · limit ${limit}`,
      started_at: new Date().toISOString(),
    }).catch(() => null);
    const rows = await svc.entities.Invoice.filter({ payment_provider: 'stripe' }, '-created_date', 250);
    const candidates = (rows || [])
      .filter((inv: any) => inv.monthly_savings_report_id && inv.stripe_invoice_id)
      .slice(0, limit);

    const results: any[] = [];
    let corrected = 0;
    let matched = 0;
    let mismatched = 0;
    let errors = 0;

    for (const candidate of candidates) {
      const result: any = { invoice_id: candidate.id, stripe_invoice_id: candidate.stripe_invoice_id };
      results.push(result);
      try {
        // Heal transient duplicate drafts left by a crash/race. Multiple
        // committed invoices are never auto-deleted; the helper throws.
        const inv = await healRecoverInvoiceDuplicatesForReport(svc, candidate.monthly_savings_report_id);
        if (!inv) { result.skipped = 'invoice_missing_after_heal'; continue; }
        if (inv.id !== candidate.id) { result.skipped = 'duplicate_draft_collapsed'; continue; }

        const remoteRes = await stripeRequest(mode, 'GET', `invoices/${inv.stripe_invoice_id}`);
        const nowIso = new Date().toISOString();
        if (!remoteRes.ok) {
          errors++;
          const err = `stripe_get_failed:${remoteRes.status}:${remoteRes.data?.error?.code || 'unknown'}`;
          await svc.entities.Invoice.update(inv.id, { reconciliation_status: 'error', reconciliation_error: err.slice(0, 1500), last_reconciled_at: nowIso });
          result.error = err;
          continue;
        }

        const remote = remoteRes.data;
        const binding = validateStripeInvoiceBinding(inv, remote);
        if (!binding.ok) {
          mismatched++;
          const reason = binding.reasons.join('|').slice(0, 1500);
          await svc.entities.Invoice.update(inv.id, { reconciliation_status: 'mismatch', reconciliation_error: reason, last_reconciled_at: nowIso });
          await appendPaymentEventOnce(svc, reconciliationEventHash(inv, remote, 'mismatch'), {
            invoice_id: inv.id,
            brand_id: inv.brand_id || '',
            amount: expectedInvoiceTotalMinor(inv) / 100,
            currency: inv.currency || 'EUR',
            event_type: 'reconciliation_mismatch',
            processor: 'stripe',
            processor_ref: inv.stripe_invoice_id,
            error_code: reason.slice(0, 100),
            metadata_json: { mode, reasons: binding.reasons, source: 'reconcileRecoverBilling' },
            occurred_at: nowIso,
          });
          result.mismatch = binding.reasons;
          continue;
        }

        const projection = stripeStatusProjection(inv, remote, nowIso);
        await svc.entities.Invoice.update(inv.id, {
          ...projection.patch,
          reconciliation_status: projection.changed ? 'drift_corrected' : 'ok',
        });
        if (projection.changed) {
          corrected++;
          await appendPaymentEventOnce(svc, reconciliationEventHash(inv, remote, 'corrected'), {
            invoice_id: inv.id,
            brand_id: inv.brand_id || '',
            amount: Number(remote.total || 0) / 100,
            currency: inv.currency || 'EUR',
            event_type: 'reconciliation_corrected',
            processor: 'stripe',
            processor_ref: inv.stripe_invoice_id,
            metadata_json: {
              mode,
              source: 'reconcileRecoverBilling',
              from_status: inv.status,
              to_status: projection.targetStatus,
              amount_paid_minor: Number(remote.amount_paid || 0),
              amount_due_minor: Number(remote.amount_due || 0),
            },
            occurred_at: nowIso,
          });
        } else {
          matched++;
        }

        if (inv.monthly_savings_report_id) {
          const target = projection.targetStatus === 'paid'
            ? 'paid'
            : (['refunded', 'void'].includes(projection.targetStatus) ? 'calculated' : 'invoiced');
          await svc.entities.MonthlySavingsReport.update(inv.monthly_savings_report_id, {
            status: target,
            ...(target === 'paid' ? { verification_status: 'paid' } : {}),
          });
        }
        if (projection.targetStatus === 'paid' && inv.deal_activation_id) {
          const act = (await svc.entities.DealActivation.filter({ id: inv.deal_activation_id }, '-created_date', 1))?.[0];
          if (act?.status === 'live') await svc.entities.DealActivation.update(act.id, { status: 'monetizing', last_updated: nowIso });
        }

        result.ok = true;
        result.corrected = projection.changed;
        result.status = projection.targetStatus;
      } catch (error) {
        errors++;
        result.error = (error as Error).message;
      }
    }

    const summary = {
      ok: errors === 0,
      mode,
      scanned: candidates.length,
      matched,
      corrected,
      mismatched,
      errors,
      results,
      guarantee: 'stripe_read_only_local_convergence',
    };
    if (task?.id) await svc.entities.AgentTask.update(task.id, {
      status: errors === 0 ? 'completed' : 'failed',
      output_summary: `Recover reconciliation: ${matched} matched · ${corrected} corrected · ${mismatched} mismatch · ${errors} errors`,
      output_payload_json: { scanned: candidates.length, matched, corrected, mismatched, errors, guarantee: summary.guarantee },
      ...(errors > 0 ? { error: `${errors} invoice reconciliation error(s)` } : {}),
      completed_at: new Date().toISOString(),
    }).catch(() => null);
    return Response.json(summary);
  } catch (error) {
    const message = String((error as Error)?.message || error || 'reconciliation_failed');
    if (svc && task?.id) await svc.entities.AgentTask.update(task.id, { status: 'failed', error: message.slice(0, 500), completed_at: new Date().toISOString() }).catch(() => null);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
