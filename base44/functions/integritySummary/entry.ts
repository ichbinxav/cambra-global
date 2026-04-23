import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const [deals, baselines, rules, mandates, reports, invoices] = await Promise.all([
      base44.asServiceRole.entities.DealActivation.list(),
      base44.asServiceRole.entities.Baseline.list(),
      base44.asServiceRole.entities.BillingRule.list(),
      base44.asServiceRole.entities.Mandate.list(),
      base44.asServiceRole.entities.MonthlySavingsReport.list(),
      base44.asServiceRole.entities.Invoice.list(),
    ]);

    const byAct = (arr, key='deal_activation_id') => arr.reduce((m,x)=>{ const k = x[key]; if(!k) return m; (m[k]=m[k]||[]).push(x); return m; },{});

    const blByA = byAct(baselines);
    const ruByA = byAct(rules);
    const mdByA = byAct(mandates);
    const repByA = byAct(reports);
    const invByA = byAct(invoices);

    const anomalies = [];

    for (const d of deals) {
      if (!blByA[d.id]?.length) anomalies.push({ type:'missing_baseline', activation_id: d.id });
      if (!ruByA[d.id]?.length) anomalies.push({ type:'missing_billing_rule', activation_id: d.id });
      if (['awaiting_authorization','authorized','migrating','live','monetizing'].includes(d.status) && !(mdByA[d.id]?.find(m=>m.status==='active'))) {
        anomalies.push({ type:'missing_mandate', activation_id: d.id });
      }
      if (d.status==='live' && !(repByA[d.id]?.length)) anomalies.push({ type:'live_no_reports', activation_id: d.id });
    }

    // Invoice without linked report
    for (const i of invoices) {
      if (!i.monthly_savings_report_id) anomalies.push({ type:'invoice_no_report', invoice_id: i.id, activation_id: i.deal_activation_id||null });
    }

    // Duplicates and negatives
    const pairKey = (r)=> `${r.deal_activation_id||''}::${r.month||''}`;
    const seen = new Map();
    for (const r of reports) {
      if (r.savings<0) anomalies.push({ type:'negative_savings', activation_id: r.deal_activation_id, report_id: r.id });
      const k = pairKey(r); seen.set(k, (seen.get(k)||0)+1);
    }
    for (const [k,c] of seen.entries()) if (c>1) anomalies.push({ type:'duplicate_report', key:k, count:c });

    const invSeen = new Map();
    for (const i of invoices) { const k = `${i.deal_activation_id||''}::${i.month||''}`; invSeen.set(k, (invSeen.get(k)||0)+1); }
    for (const [k,c] of invSeen.entries()) if (c>1) anomalies.push({ type:'duplicate_invoice', key:k, count:c });

    return Response.json({ ok:true, anomalies, counts: { total: anomalies.length } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});