import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const result = {
      baseline_cleared: 0,
      mandate_cleared: 0,
      billingrule_cleared: 0,
      report_provider_fixed: 0,
      invoice_amount_legacy_cleared: 0,
      migrationtask_cleared: 0,
      activation_provider_legacy_cleared: 0,
    };

    // Baseline: clear legacy deal_id when canonical present
    const baselines = await base44.asServiceRole.entities.Baseline.list();
    for (const b of baselines) {
      if (b.deal_id && b.deal_activation_id) {
        await base44.asServiceRole.entities.Baseline.update(b.id, { deal_id: null });
        result.baseline_cleared++;
      }
    }

    // Mandate: clear legacy deal_id when canonical present
    const mandates = await base44.asServiceRole.entities.Mandate.list();
    for (const m of mandates) {
      if (m.deal_id && m.deal_activation_id) {
        await base44.asServiceRole.entities.Mandate.update(m.id, { deal_id: null });
        result.mandate_cleared++;
      }
    }

    // BillingRule: nothing legacy listed, but ensure no legacy fields remain (model/start_date)
    const rules = await base44.asServiceRole.entities.BillingRule.list();
    for (const r of rules) {
      const patch: Record<string, unknown> = {};
      if (r.model && !r.billing_model) patch.billing_model = r.model; // enforce canonical if needed
      if (r.start_date && !r.effective_start_date) patch.effective_start_date = r.start_date;
      if (Object.keys(patch).length) {
        await base44.asServiceRole.entities.BillingRule.update(r.id, patch);
        result.billingrule_cleared++;
      }
    }

    // MonthlySavingsReport: ensure provider_id exists; no legacy provider_name field in schema, so skip; nothing to clear
    const reports = await base44.asServiceRole.entities.MonthlySavingsReport.list();
    for (const r of reports) {
      if (!r.provider_id && r.deal_activation_id) {
        // Best effort: fetch activation and copy provider_id
        const acts = await base44.asServiceRole.entities.DealActivation.filter({ id: r.deal_activation_id }, '-created_date', 1);
        const act = acts?.[0];
        if (act?.provider_id) {
          await base44.asServiceRole.entities.MonthlySavingsReport.update(r.id, { provider_id: act.provider_id });
          result.report_provider_fixed++;
        }
      }
    }

    // Invoice: clear legacy amount if total_amount present
    const invoices = await base44.asServiceRole.entities.Invoice.list();
    for (const i of invoices) {
      if (i.amount != null && i.total_amount != null) {
        await base44.asServiceRole.entities.Invoice.update(i.id, { amount: null });
        result.invoice_amount_legacy_cleared++;
      }
    }

    // MigrationTask: clear legacy deal_id when canonical present
    const tasks = await base44.asServiceRole.entities.MigrationTask.list();
    for (const t of tasks) {
      if (t.deal_id && t.deal_activation_id) {
        await base44.asServiceRole.entities.MigrationTask.update(t.id, { deal_id: null });
        result.migrationtask_cleared++;
      }
    }

    // DealActivation: clear legacy provider string if provider_id exists
    const activations = await base44.asServiceRole.entities.DealActivation.list();
    for (const a of activations) {
      if (a.provider && a.provider_id) {
        await base44.asServiceRole.entities.DealActivation.update(a.id, { provider: null });
        result.activation_provider_legacy_cleared++;
      }
    }

    return Response.json({ ok: true, result });
  } catch (error) {
    return internalErrorResponse(error, 'phase2CleanupLegacyFields');
  }
});
