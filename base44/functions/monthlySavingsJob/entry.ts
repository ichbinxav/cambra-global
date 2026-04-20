import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const deals = await base44.asServiceRole.entities.DealActivation.filter({ status: 'live' });
    const monthDate = new Date(); monthDate.setMonth(monthDate.getMonth()-1);
    const ym = `${monthDate.getFullYear()}-${String(monthDate.getMonth()+1).padStart(2,'0')}`;

    for (const d of deals) {
      const rules = await base44.asServiceRole.entities.BillingRule.filter({ deal_id: d.id }, '-created_date', 1);
      const rule = rules[0] || { model: 'monthly_success_fee', node_share_percent: d.node_share_percent || 25 };
      const baselines = await base44.asServiceRole.entities.Baseline.filter({ deal_id: d.id }, '-created_date', 1);
      const baseline = baselines[0];
      if (!baseline) {
        // Cannot calculate savings without a locked baseline
        continue;
      }

      // Try to get brand-scoped AnalyzerInput to infer GMV for payments
      let gmvReal = 0;
      if (d.brand_id) {
        const ins = await base44.asServiceRole.entities.AnalyzerInput.filter({ brand_id: d.brand_id }, '-created_date', 1);
        if (ins?.length) gmvReal = Number(ins[0].monthly_revenue || 0);
      }
      if (!gmvReal && baseline?.snapshot_json?.inputId) {
        const insById = await base44.asServiceRole.entities.AnalyzerInput.filter({ id: baseline.snapshot_json.inputId }, '-created_date', 1);
        if (insById?.length) gmvReal = Number(insById[0].monthly_revenue || 0);
      }

      let baselineCost = 0; let actualCost = 0; let savings = 0; let nodeFee = 0; let confidence = 0.3;

      if (d.vertical === 'payments') {
        if (!gmvReal) {
          // No GMV available → cannot compute monthly savings reliably
          savings = 0;
        }
        const details = baseline?.snapshot_json?.details || {};
        const oldRate = Number(baseline.baseline_value);
        const newRate = typeof details.payment_optimal_rate === 'number' ? Number(details.payment_optimal_rate) : oldRate; // default to no improvement
        const rateImprovement = Math.max(0, (oldRate - newRate) / 100);
        const nodeCut = rateImprovement * (rule.node_share_percent/100);
        baselineCost = gmvReal * (oldRate/100);
        actualCost = gmvReal * (newRate/100);
        savings = Math.max(0, baselineCost - actualCost);
        nodeFee = Math.max(0, gmvReal * nodeCut);
        confidence = gmvReal ? 0.6 : 0.3;
      } else {
        // shipping / saas
        const oldCost = Number(baseline.baseline_value ?? 0);
        const projected = Number(d.projected_savings_monthly || 0);
        baselineCost = oldCost;
        actualCost = Math.max(0, oldCost - projected);
        savings = Math.max(0, baselineCost - actualCost);
        nodeFee = savings * (rule.node_share_percent/100);
        confidence = 0.4;
      }

      // Only mark calculated when positive savings exist
      const status = savings > 0 ? 'calculated' : 'pending';
      await base44.asServiceRole.entities.MonthlySavingsReport.create({
        deal_id: d.id,
        month: ym,
        gmv_real: gmvReal || 0,
        baseline_cost: baselineCost || 0,
        actual_cost: actualCost || 0,
        savings: savings || 0,
        node_fee: nodeFee || 0,
        status,
        confidence_score: confidence
      });

      if (status === 'calculated') {
        await base44.asServiceRole.entities.Invoice.create({ deal_id: d.id, month: ym, amount: Math.max(0, nodeFee), status: 'draft' });
      }
    }

    return Response.json({ ok: true, processed: deals.length, month: ym });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});