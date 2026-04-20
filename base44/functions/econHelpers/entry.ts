import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

// Helper function exposed as a multi-op endpoint
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(()=>({}));
    const op = body?.op;

    if (op === 'monthKey') {
      const d = body?.date ? new Date(body.date) : new Date();
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      return Response.json({ month: ym });
    }

    if (op === 'selectBillingRule') {
      const { dealActivationId, month } = body || {};
      if (!dealActivationId) return Response.json({ error: 'dealActivationId required' }, { status: 400 });
      const rules = await base44.asServiceRole.entities.BillingRule.filter({ deal_activation_id: dealActivationId, status: 'active' });
      const [y, m] = (month || '').split('-').map(Number);
      const start = new Date(y || new Date().getFullYear(), (m||1)-1, 1);
      const end = new Date(start); end.setMonth(end.getMonth()+1); end.setDate(0);
      const inRange = (r) => {
        const rs = r.effective_start_date ? new Date(r.effective_start_date) : new Date('1970-01-01');
        const re = r.effective_end_date ? new Date(r.effective_end_date) : new Date('2999-12-31');
        return rs <= end && re >= start;
      };
      const candidates = rules.filter(inRange).sort((a,b)=> new Date(b.effective_start_date||'1970-01-01') - new Date(a.effective_start_date||'1970-01-01'));
      const rule = candidates[0] || null;
      return Response.json({ rule });
    }

    if (op === 'calculateNodeFee') {
      const { savings, billingRule } = body || {};
      const s = Number(savings || 0);
      const pct = Number(billingRule?.node_share_percent ?? 25) / 100;
      const currency = billingRule?.currency || 'EUR';
      const minFee = Number(billingRule?.min_fee || 0);
      const capFee = Number(billingRule?.cap_fee || Infinity);
      let fee = Math.max(0, s * pct);
      if (minFee) fee = Math.max(minFee, fee);
      if (isFinite(capFee)) fee = Math.min(capFee, fee);
      fee = Math.round(fee * 100) / 100;
      return Response.json({ fee, currency, inputs: { savings: s, pct: billingRule?.node_share_percent ?? 25, minFee, capFee } });
    }

    if (op === 'aggregateRealized') {
      const { dealActivationId, months } = body || {};
      if (!dealActivationId) return Response.json({ error: 'dealActivationId required' }, { status: 400 });
      const reports = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ deal_activation_id: dealActivationId });
      reports.sort((a,b)=> (a.month < b.month ? -1 : 1));
      const last = reports[reports.length-1] || null;
      const sumRange = (n) => {
        const slice = reports.slice(-n);
        return {
          savings: slice.reduce((s,r)=>s+Number(r.savings||0),0),
          node_fee: slice.reduce((s,r)=>s+Number(r.node_fee||0),0)
        };
      };
      const res = {
        latest_realized_savings_monthly: Number(last?.savings || 0),
        latest_node_fee_monthly: Number(last?.node_fee || 0),
        trailing_3m: sumRange(3),
        trailing_12m: sumRange(12),
        cumulative: sumRange(reports.length)
      };
      return Response.json(res);
    }

    if (op === 'integrityChecks') {
      const { month } = body || {};
      const anomalies = [];
      // Duplicate reports for same activation+month
      const acts = await base44.asServiceRole.entities.DealActivation.list();
      for (const a of acts) {
        const reps = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ deal_activation_id: a.id, month });
        if (reps.length > 1) anomalies.push({ type: 'duplicate_report', activation_id: a.id, month, count: reps.length });
        if (['live','authorized','migrating'].includes(a.status)) {
          const rules = await base44.asServiceRole.entities.BillingRule.filter({ deal_activation_id: a.id, status: 'active' });
          if (!rules.length) anomalies.push({ type: 'missing_billing_rule', activation_id: a.id });
          const bases = await base44.asServiceRole.entities.Baseline.filter({ deal_activation_id: a.id });
          if (!bases.length) anomalies.push({ type: 'missing_baseline', activation_id: a.id });
        }
      }
      return Response.json({ anomalies });
    }

    return Response.json({ error: 'Unknown op' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});