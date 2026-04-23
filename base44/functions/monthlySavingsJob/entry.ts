import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled/service calls; block non-admin interactive calls
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const deals = await base44.asServiceRole.entities.DealActivation.filter({ status: 'live' });
    const monthDate = new Date(); monthDate.setMonth(monthDate.getMonth()-1);
    const ym = `${monthDate.getFullYear()}-${String(monthDate.getMonth()+1).padStart(2,'0')}`;

    for (const d of deals) {
      const rules = await base44.asServiceRole.entities.BillingRule.filter({ deal_activation_id: d.id }, '-created_date', 1)
        .then(r => r.length ? r : base44.asServiceRole.entities.BillingRule.filter({ deal_id: d.id }, '-created_date', 1));
      const rule = rules[0] || { billing_model: 'monthly_success_fee', node_share_percent: d.node_share_percent || 25 };

      const baselines = await base44.asServiceRole.entities.Baseline.filter({ deal_activation_id: d.id }, '-created_date', 1)
        .then(b => b.length ? b : base44.asServiceRole.entities.Baseline.filter({ deal_id: d.id }, '-created_date', 1));
      const baseline = baselines[0];
      if (!baseline) continue;

      let gmvReal = 0;
      if (d.brand_id) {
        const ins = await base44.asServiceRole.entities.AnalyzerInput.filter({ brand_id: d.brand_id }, '-created_date', 1);
        if (ins?.length) gmvReal = Number(ins[0].monthly_revenue || 0);
      }

      let baselineCost = 0; let actualCost = 0; let savings = 0; let nodeFee = 0; let confidence = 0.3;
      if (d.vertical === 'payments') {
        const details = baseline?.snapshot_json?.details || {};
        const oldRate = Number(baseline.baseline_value);
        const newRate = typeof details.payment_optimal_rate === 'number' ? Number(details.payment_optimal_rate) : oldRate;
        baselineCost = gmvReal * (oldRate/100);
        actualCost = gmvReal * (newRate/100);
        savings = Math.max(0, baselineCost - actualCost);
        nodeFee = Math.max(0, savings * (rule.node_share_percent/100));
        confidence = gmvReal ? 0.6 : 0.3;
      } else {
        const oldCost = Number(baseline.baseline_value ?? 0);
        const projected = Number(d.projected_savings_monthly || 0);
        baselineCost = oldCost;
        actualCost = Math.max(0, oldCost - projected);
        savings = Math.max(0, baselineCost - actualCost);
        nodeFee = savings * (rule.node_share_percent/100);
        confidence = 0.4;
      }

      const status = savings > 0 ? 'calculated' : 'pending';

      // Upsert report (idempotent)
      let existingReports = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ deal_activation_id: d.id, month: ym }, '-created_date', 1);
      let reportRec = null;
      const reportPayload = {
        deal_activation_id: d.id,
        brand_id: d.brand_id || '',
        provider_id: d.provider_id || '',
        month: ym,
        gmv_real: gmvReal || 0,
        baseline_cost: baselineCost || 0,
        actual_cost: actualCost || 0,
        savings: savings || 0,
        node_fee: nodeFee || 0,
        status,
        confidence_score: confidence
      };
      if (existingReports.length) {
        reportRec = await base44.asServiceRole.entities.MonthlySavingsReport.update(existingReports[0].id, reportPayload);
      } else {
        reportRec = await base44.asServiceRole.entities.MonthlySavingsReport.create(reportPayload);
      }

      // Create draft invoice if none exists (idempotent)
      if (status === 'calculated') {
        const existingInv = await base44.asServiceRole.entities.Invoice.filter({ deal_activation_id: d.id, month: ym }, '-created_date', 1);
        if (!existingInv.length) {
          await base44.asServiceRole.entities.Invoice.create({
            deal_activation_id: d.id,
            brand_id: d.brand_id || '',
            provider_id: d.provider_id || '',
            month: ym,
            subtotal_amount: Math.max(0, nodeFee),
            tax_amount: 0,
            total_amount: Math.max(0, nodeFee),
            amount_paid: 0,
            balance_due: Math.max(0, nodeFee),
            currency: 'EUR',
            status: 'draft',
            monthly_savings_report_id: reportRec.id,
            billing_snapshot_json: { source: 'monthlySavingsJob' }
          });
        }
      }
    }

    return Response.json({ ok: true, processed: deals.length, month: ym });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});