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

      let gmvReal = null; let baselineCost = null; let actualCost = null; let savings = null; let nodeFee = 0; let confidence = 0.3;

      if (d.vertical === 'payments') {
        const inputs = await base44.asServiceRole.entities.AnalyzerInput.list();
        const first = inputs[0];
        gmvReal = first?.monthly_revenue || 0;
        const oldRate = baseline?.baseline_value ?? 2.9;
        const newRate = Math.max(0, oldRate - (d.projected_savings_annual && gmvReal ? ((d.projected_savings_annual/12)/gmvReal)*100 : 0));
        if (gmvReal) {
          const rateImprovement = Math.max(0, (oldRate - newRate) / 100);
          const nodeCut = rateImprovement * (rule.node_share_percent/100);
          nodeFee = Math.max(0, gmvReal * nodeCut);
          savings = Math.max(0, gmvReal * (oldRate/100 - newRate/100));
          baselineCost = gmvReal * (oldRate/100);
          actualCost = gmvReal * (newRate/100);
          confidence = 0.5;
        }
      } else {
        const oldCost = baseline?.baseline_value ?? null;
        if (oldCost != null) {
          baselineCost = oldCost;
          actualCost = Math.max(0, oldCost - (d.projected_savings_monthly || 0));
          savings = Math.max(0, baselineCost - actualCost);
          nodeFee = savings * (rule.node_share_percent/100);
          confidence = 0.4;
        }
      }

      const status = savings == null ? 'pending' : 'calculated';
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