import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

async function selectRule(base44, activationId, ym) {
  const resp = await base44.functions.invoke('econHelpers', { op: 'selectBillingRule', dealActivationId: activationId, month: ym });
  return resp?.data?.rule || null;
}

async function calcFee(base44, savings, rule) {
  const resp = await base44.functions.invoke('econHelpers', { op: 'calculateNodeFee', savings, billingRule: rule || {} });
  return resp?.data || { fee: 0, currency: 'EUR', inputs: { savings, pct: 25 } };
}

function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date(); now.setMonth(now.getMonth()-1); // process previous month
    const ym = monthKey(now);

    const acts = await base44.asServiceRole.entities.DealActivation.filter({ status: 'live' });

    let processed = 0, created = 0, updated = 0, skipped = 0;

    for (const a of acts) {
      processed += 1;
      // Resolve baseline (canonical first)
      let baselines = await base44.asServiceRole.entities.Baseline.filter({ deal_activation_id: a.id }, '-created_date', 1);
      if (!baselines.length) {
        console.warn('monthlyEconomicsJob: legacy fallback to deal_id for baseline', { activation_id: a.id });
        baselines = await base44.asServiceRole.entities.Baseline.filter({ deal_id: a.id }, '-created_date', 1);
      }
      const baseline = baselines[0];
      if (!baseline) { skipped += 1; continue; }

      // Data inputs (fallback for now)
      let gmv = 0, shipments = 0, saasSpend = 0;
      const inputs = a.brand_id ? await base44.asServiceRole.entities.AnalyzerInput.filter({ brand_id: a.brand_id }, '-created_date', 1) : [];
      if (inputs?.length) {
        gmv = Number(inputs[0].monthly_revenue || 0);
        shipments = Number(inputs[0].monthly_shipments || 0);
        saasSpend = Number(inputs[0].total_saas_spend || 0);
      }

      let baselineCost = 0, actualCost = 0, savings = 0;
      let measurement_mode = 'fallback_projection';
      let measurement_source = 'manual_review';

      if (a.vertical === 'payments') {
        const oldRate = Number(baseline.baseline_value || 0);
        // Without verified data, project using target rate from snapshot if present
        const next = Number(baseline?.snapshot_json?.details?.payment_optimal_rate ?? oldRate);
        baselineCost = gmv * (oldRate/100);
        actualCost = gmv * (next/100);
        savings = Math.max(0, baselineCost - actualCost);
      } else if (a.vertical === 'shipping') {
        const perCurr = Number(baseline.baseline_value || 0);
        const perNext = Number(baseline?.snapshot_json?.details?.shipping_optimal_avg ?? perCurr);
        const count = shipments || Math.max(1, Math.round((Number(inputs?.[0]?.monthly_shipping_cost||0) / (perCurr||1))));
        baselineCost = perCurr * count;
        actualCost = perNext * count;
        savings = Math.max(0, baselineCost - actualCost);
      } else {
        const curr = Number(inputs?.[0]?.total_saas_spend || baseline.baseline_value || 0);
        const next = Number(baseline?.snapshot_json?.details?.saas_optimal_total ?? curr);
        baselineCost = curr;
        actualCost = next;
        savings = Math.max(0, baselineCost - actualCost);
      }

      const rule = await selectRule(base44, a.id, ym) || { node_share_percent: a.node_share_percent || 25, currency: 'EUR' }; // canonical by deal_activation_id
      const feeRes = await calcFee(base44, savings, rule);

      // Idempotent upsert for MonthlySavingsReport
      let existing = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ deal_activation_id: a.id, month: ym }, '-created_date', 2);
      if (existing.length > 1) {
        // keep latest, void others
        for (let i=0; i<existing.length-1; i++) {
          await base44.asServiceRole.entities.MonthlySavingsReport.update(existing[i].id, { status: 'void', notes: 'Duplicate auto-void' });
        }
        existing = [existing[existing.length-1]];
      }

      const payload = {
        deal_activation_id: a.id,
        brand_id: a.brand_id || '',
        provider_id: a.provider_id || '',
        vertical: a.vertical,
        month: ym,
        measurement_source,
        measurement_mode,
        gmv_real: gmv,
        shipment_count_real: shipments,
        saas_usage_real: saasSpend,
        baseline_cost: Math.round(baselineCost*100)/100,
        actual_cost: Math.round(actualCost*100)/100,
        savings: Math.round(savings*100)/100,
        node_fee: Number(feeRes.fee || 0),
        currency: feeRes.currency || 'EUR',
        confidence_score: measurement_mode === 'fallback_projection' ? 0.4 : 0.8,
        status: 'calculated',
        supporting_snapshot_json: { billing_rule: rule, fee_inputs: feeRes.inputs, baseline_id: baseline.id }
      };

      let report = null;
      if (existing.length === 1) {
        report = await base44.asServiceRole.entities.MonthlySavingsReport.update(existing[0].id, payload);
        updated += 1;
      } else {
        report = await base44.asServiceRole.entities.MonthlySavingsReport.create(payload);
        created += 1;
      }

      // Idempotent invoice draft
      let inv = await base44.asServiceRole.entities.Invoice.filter({ deal_activation_id: a.id, month: ym }, '-created_date', 2);
      if (!inv.length) {
        await base44.asServiceRole.entities.Invoice.create({
          deal_activation_id: a.id,
          brand_id: a.brand_id || '',
          provider_id: a.provider_id || '',
          month: ym,
          subtotal_amount: Number(feeRes.fee || 0),
          tax_amount: 0,
          total_amount: Number(feeRes.fee || 0),
          amount: Number(feeRes.fee || 0),
          currency: feeRes.currency || 'EUR',
          status: 'draft',
          monthly_savings_report_id: report.id,
          billing_snapshot_json: { fee_inputs: feeRes.inputs, rule },
          notes: 'Auto-generated from MonthlySavingsReport'
        });
      } else if (inv.length > 1) {
        for (let i=0; i<inv.length-1; i++) {
          await base44.asServiceRole.entities.Invoice.update(inv[i].id, { status: 'void', notes: 'Duplicate auto-void' });
        }
      } else if (inv[0].status === 'draft') {
        await base44.asServiceRole.entities.Invoice.update(inv[0].id, {
          subtotal_amount: Number(feeRes.fee || 0),
          tax_amount: 0,
          total_amount: Number(feeRes.fee || 0),
          amount: Number(feeRes.fee || 0),
          currency: feeRes.currency || 'EUR',
          monthly_savings_report_id: report.id
        });
      }
    }

    return Response.json({ ok: true, processed, created, updated, skipped, month: ym });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});