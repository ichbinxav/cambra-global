import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function mean(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function stddev(arr){ const m = mean(arr); return arr.length ? Math.sqrt(arr.reduce((s,x)=>s+Math.pow(x-m,2),0)/arr.length) : 0; }
function quantile(sortedArr, q){ const n=sortedArr.length; if(!n) return null; const pos=(n-1)*q; const b=Math.floor(pos); const r=pos-b; return sortedArr[b+1]!==undefined? sortedArr[b] + r*(sortedArr[b+1]-sortedArr[b]) : sortedArr[b]; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Allow scheduled/service calls; block non-admin interactive calls
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    // Helper: cohort logic (geo | GMV band | channel bucket)
    const EU = new Set(['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden']);
    function gmvBand(annual){ if(annual==null) return 'unknown'; if(annual<100000) return '<100k'; if(annual<500000) return '100k-500k'; if(annual<2000000) return '500k-2M'; if(annual<10000000) return '2M-10M'; return '10M+'; }
    function channelBucket(cm){ if(!cm) return 'unknown'; const d=Number(cm.dtc_pct||0), mk=Number(cm.marketplace_pct||0), rt=Number(cm.retail_pct||0); if(d>=60) return 'dtc-heavy'; if(mk>=40) return 'marketplace-heavy'; if(rt>=30) return 'omni'; return 'mixed'; }

    // Fetch recent analyzer results (bounded)
    const results = await base44.asServiceRole.entities.AnalyzerResult.filter({}, '-created_date', 500);
    const brands = await base44.asServiceRole.entities.Brand.list();
    const brandByUser = new Map((brands||[]).map(b => [b.created_by, b]));

    // Accumulators per cohort
    const buckets = new Map(); // key -> { pay: number[], ship: number[] }

    for (const r of (results||[])) {
      // Resolve input for GMV + mix
      let input = null;
      if (r.input_id) {
        const [i] = await base44.asServiceRole.entities.AnalyzerInput.filter({ id: r.input_id }, '-created_date', 1);
        input = i || null;
      }
      const brand = brandByUser.get(r.created_by) || null;
      const monthly = Number(input?.monthly_revenue ?? 0) || null;
      const annual = monthly ? monthly * 12 : null;
      const key = `${brand?.country && EU.has(brand.country) ? 'EU' : 'Global'}|${gmvBand(annual)}|${channelBucket(input?.channel_mix||null)}`;
      if (!buckets.has(key)) buckets.set(key, { pay: [], ship: [] });
      const pay = r?.details?.payment_current_rate; if (typeof pay === 'number' && isFinite(pay)) buckets.get(key).pay.push(Number(pay));
      const ship = r?.details?.shipping_current_avg; if (typeof ship === 'number' && isFinite(ship)) buckets.get(key).ship.push(Number(ship));
    }

    // Also compute global bucket across all samples
    const globalAll = { pay: [], ship: [] };
    for (const r of (results||[])) {
      const pay = r?.details?.payment_current_rate; if (typeof pay === 'number' && isFinite(pay)) globalAll.pay.push(Number(pay));
      const ship = r?.details?.shipping_current_avg; if (typeof ship === 'number' && isFinite(ship)) globalAll.ship.push(Number(ship));
    }
    buckets.set('global|all|mixed', globalAll);

    // Build snapshots for current month per cohort and metric
    const snapshots = [];
    for (const [cohort_key, arrs] of buckets.entries()) {
      const payVals = (arrs.pay||[]).sort((a,b)=>a-b);
      const shipVals = (arrs.ship||[]).sort((a,b)=>a-b);
      const make = (metric_key, vals) => ({
        cohort_key,
        month,
        metric_key,
        n: vals.length,
        mean: vals.length ? mean(vals) : null,
        p25: vals.length ? quantile(vals, 0.25) : null,
        p50: vals.length ? quantile(vals, 0.5) : null,
        p75: vals.length ? quantile(vals, 0.75) : null,
        p90: vals.length ? quantile(vals, 0.9) : null,
        std: vals.length ? stddev(vals) : null,
        source_count_json: { results: results.length }
      });
      snapshots.push(make('payments.effective_rate', payVals));
      snapshots.push(make('shipping.avg_cost', shipVals));
    }

    // Upsert snapshots (idempotent per cohort/month/metric)
    let updated = 0;
    for (const s of snapshots) {
      const existing = await base44.asServiceRole.entities.BenchmarkSnapshot.filter({ cohort_key: s.cohort_key, month: s.month, metric_key: s.metric_key }, '-created_date', 1);
      if (existing.length) {
        await base44.asServiceRole.entities.BenchmarkSnapshot.update(existing[0].id, s);
      } else {
        await base44.asServiceRole.entities.BenchmarkSnapshot.create(s);
      }
      updated += 1;
    }

    return Response.json({ status: 'ok', updated, cohorts: buckets.size, month });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});