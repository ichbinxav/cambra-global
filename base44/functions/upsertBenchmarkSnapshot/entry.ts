import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function mean(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function stddev(arr){ const m = mean(arr); return arr.length ? Math.sqrt(arr.reduce((s,x)=>s+Math.pow(x-m,2),0)/arr.length) : 0; }
function quantile(sortedArr, q){ const n=sortedArr.length; if(!n) return null; const pos=(n-1)*q; const b=Math.floor(pos); const r=pos-b; return sortedArr[b+1]!==undefined? sortedArr[b] + r*(sortedArr[b+1]-sortedArr[b]) : sortedArr[b]; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    // Gather recent results
    const results = await base44.asServiceRole.entities.AnalyzerResult.filter({}, '-created_date', 500);

    const metrics = [
      { key: 'payments.effective_rate', pick: r => r?.details?.payment_current_rate, unit: '%' },
      { key: 'shipping.avg_cost', pick: r => r?.details?.shipping_current_avg, unit: '€' }
    ];

    const snapshots = [];
    for (const m of metrics) {
      const vals = results.map(m.pick).filter(v => typeof v === 'number' && isFinite(v)).sort((a,b)=>a-b);
      const snap = {
        cohort_key: 'global|all|mixed',
        month,
        metric_key: m.key,
        n: vals.length,
        mean: mean(vals) || null,
        p25: vals.length ? quantile(vals, 0.25) : null,
        p50: vals.length ? quantile(vals, 0.5) : null,
        p75: vals.length ? quantile(vals, 0.75) : null,
        p90: vals.length ? quantile(vals, 0.9) : null,
        std: stddev(vals) || null,
        source_count_json: { results: results.length }
      };
      snapshots.push(snap);
    }

    // Upsert snapshots
    for (const s of snapshots) {
      const existing = await base44.asServiceRole.entities.BenchmarkSnapshot.filter({ cohort_key: s.cohort_key, month: s.month, metric_key: s.metric_key }, '-created_date', 1);
      if (existing.length) {
        await base44.asServiceRole.entities.BenchmarkSnapshot.update(existing[0].id, s);
      } else {
        await base44.asServiceRole.entities.BenchmarkSnapshot.create(s);
      }
    }

    return Response.json({ status: 'ok', updated: snapshots.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});