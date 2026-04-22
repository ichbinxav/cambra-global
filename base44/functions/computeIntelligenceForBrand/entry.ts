import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function quantile(sortedArr, q) {
  const n = sortedArr.length;
  if (!n) return null;
  const pos = (n - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedArr[base + 1] !== undefined) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  } else {
    return sortedArr[base];
  }
}

function bandGMV(annual) {
  if (annual == null) return 'unknown';
  if (annual < 100000) return '<100k';
  if (annual < 500000) return '100k-500k';
  if (annual < 2000000) return '500k-2M';
  if (annual < 10000000) return '2M-10M';
  return '10M+';
}

function bucketChannelMix(cm) {
  if (!cm) return 'unknown';
  const dtc = Number(cm.dtc_pct || 0);
  const mkt = Number(cm.marketplace_pct || 0);
  const retail = Number(cm.retail_pct || 0);
  if (dtc >= 60) return 'dtc-heavy';
  if (mkt >= 40) return 'marketplace-heavy';
  if (retail >= 30) return 'omni';
  return 'mixed';
}

const EU_COUNTRIES = new Set(['Austria','Belgium','Bulgaria','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Ireland','Italy','Latvia','Lithuania','Luxembourg','Malta','Netherlands','Poland','Portugal','Romania','Slovakia','Slovenia','Spain','Sweden']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { resultId } = body;
    if (!resultId) return Response.json({ error: 'resultId is required' }, { status: 400 });

    // Load result (service role to read safely, then enforce ownership)
    const results = await base44.asServiceRole.entities.AnalyzerResult.filter({ id: resultId }, '-created_date', 1);
    if (!results.length) return Response.json({ error: 'Result not found' }, { status: 404 });
    const result = results[0];
    if (result.created_by !== user.email && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Load related input + brand + profiles (best-effort)
    let input = null;
    if (result.input_id) {
      const inputs = await base44.asServiceRole.entities.AnalyzerInput.filter({ id: result.input_id }, '-created_date', 1);
      input = inputs[0] || null;
    }
    const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
    const brand = brands[0] || null;

    const monthlyRevenue = input?.monthly_revenue ?? null;
    const annualGMV = monthlyRevenue ? monthlyRevenue * 12 : null;
    const gmvBand = bandGMV(annualGMV);
    const geo = brand?.country && EU_COUNTRIES.has(brand.country) ? 'EU' : 'Global';
    const channelBucket = bucketChannelMix(input?.channel_mix || null);
    const cohortKey = `${geo}|${gmvBand}|${channelBucket}`;

    // Current brand metrics
    const payEff = (result.details?.payment_current_rate != null) ? Number(result.details.payment_current_rate) : null;
    const shipAvg = (result.details?.shipping_current_avg != null) ? Number(result.details.shipping_current_avg) : null;
    const saasPct = (monthlyRevenue && monthlyRevenue > 0 && input?.total_saas_spend != null)
      ? (Number(input.total_saas_spend) / Number(monthlyRevenue)) * 100
      : null;

    // Prefer cohort snapshots; fallback to ad-hoc peers
    let paymentsBench, shippingBench;
    try {
      const snaps = await base44.asServiceRole.entities.BenchmarkSnapshot.filter({ cohort_key: cohortKey }, '-month', 100);
      const pick = (arr, metric) => (arr || []).filter(s => s.metric_key === metric).sort((a,b)=> (a.month > b.month ? -1 : 1))[0] || null;
      let pSnap = pick(snaps, 'payments.effective_rate');
      let sSnap = pick(snaps, 'shipping.avg_cost');
      if (!pSnap || !sSnap) {
        const gSnaps = await base44.asServiceRole.entities.BenchmarkSnapshot.filter({ cohort_key: 'global|all|mixed' }, '-month', 100);
        pSnap = pSnap || pick(gSnaps, 'payments.effective_rate');
        sSnap = sSnap || pick(gSnaps, 'shipping.avg_cost');
      }
      paymentsBench = {
        value: payEff,
        unit: '%',
        n: pSnap?.n || 0,
        p50: pSnap?.p50 ?? 1.4,
        p75: pSnap?.p75 ?? 1.8,
        p90: pSnap?.p90 ?? 2.2,
      };
      shippingBench = {
        value: shipAvg,
        unit: '€',
        n: sSnap?.n || 0,
        p50: sSnap?.p50 ?? 5.2,
        p75: sSnap?.p75 ?? 6.9,
        p90: sSnap?.p90 ?? 8.5,
      };
    } catch {
      // Fallback to ad-hoc peers (bounded)
      const peerResults = await base44.asServiceRole.entities.AnalyzerResult.filter({}, '-created_date', 500);
      const peerPay = peerResults.map(r => r?.details?.payment_current_rate).filter(v => typeof v === 'number' && isFinite(v)).sort((a,b)=>a-b);
      const peerShip = peerResults.map(r => r?.details?.shipping_current_avg).filter(v => typeof v === 'number' && isFinite(v)).sort((a,b)=>a-b);
      paymentsBench = { value: payEff, unit: '%', n: peerPay.length, p50: peerPay.length ? quantile(peerPay, 0.5) : 1.4, p75: peerPay.length ? quantile(peerPay, 0.75) : 1.8, p90: peerPay.length ? quantile(peerPay, 0.9) : 2.2 };
      shippingBench = { value: shipAvg, unit: '€', n: peerShip.length, p50: peerShip.length ? quantile(peerShip, 0.5) : 5.2, p75: peerShip.length ? quantile(peerShip, 0.75) : 6.9, p90: peerShip.length ? quantile(peerShip, 0.9) : 8.5 };
    }
    const saasBench = {
      value: saasPct,
      unit: '%',
      n: 0,
      p50: 3.0,
      p75: 4.0,
      p90: 5.0,
    };

    // Scores (simple, explainable first pass)
    const gaps = [];
    if (paymentsBench.value != null && paymentsBench.p50 != null) {
      gaps.push(Math.max(0, (paymentsBench.value - paymentsBench.p50) / Math.max(0.1, paymentsBench.p50)));
    }
    if (shippingBench.value != null && shippingBench.p50 != null) {
      gaps.push(Math.max(0, (shippingBench.value - shippingBench.p50) / Math.max(0.01, shippingBench.p50)));
    }
    if (saasBench.value != null && saasBench.p50 != null) {
      gaps.push(Math.max(0, (saasBench.value - saasBench.p50) / Math.max(0.1, saasBench.p50)));
    }
    const avgGap = gaps.length ? gaps.reduce((a,b)=>a+b,0) / gaps.length : 0;
    const costEfficiency = Math.max(0, Math.min(100, 100 - avgGap * 100));

    // Readiness & completeness from profiles (if any)
    let completenessVals = [];
    let readinessVals = [];
    if (brand?.id) {
      const [pp] = await base44.asServiceRole.entities.PaymentsProfile.filter({ brand_id: brand.id }, '-updated_date', 1);
      const [sp] = await base44.asServiceRole.entities.ShippingProfile.filter({ brand_id: brand.id }, '-updated_date', 1);
      const [ss] = await base44.asServiceRole.entities.SaaSProfile.filter({ brand_id: brand.id }, '-updated_date', 1);
      [pp, sp, ss].forEach(p => { if (p) { if (typeof p.completeness_score === 'number') completenessVals.push(p.completeness_score); if (typeof p.readiness_score === 'number') readinessVals.push(p.readiness_score); } });
    }
    const completeness = completenessVals.length ? Math.round(completenessVals.reduce((a,b)=>a+b,0)/completenessVals.length) : 40;
    const readiness = readinessVals.length ? Math.round(readinessVals.reduce((a,b)=>a+b,0)/readinessVals.length) : 40;

    const riskReliability = 100 - Math.max(0, (result.details?.chargeback_rate || 0) * 800); // crude: 0.5% -> 60 pts
    const stackEfficiency = 70; // placeholder until we have usage/connectors

    const breakdown = [
      { key: 'cost_efficiency', label: 'Cost efficiency', value: Math.round(costEfficiency), weight: 40, rationale: 'Gap vs cohort medians across payments, shipping, SaaS' },
      { key: 'stack_efficiency', label: 'Stack efficiency', value: stackEfficiency, weight: 25, rationale: 'Heuristic until usage signals are available' },
      { key: 'risk_reliability', label: 'Risk & reliability', value: Math.round(Math.max(0, Math.min(100, riskReliability))), weight: 15, rationale: 'Chargeback and payout stability (first pass)' },
      { key: 'readiness', label: 'Readiness & data quality', value: Math.round((readiness*0.6 + completeness*0.4)), weight: 20, rationale: 'Profiles completeness + readiness' }
    ];
    const infraScore = Math.round(
      breakdown.reduce((sum, c) => sum + (c.value * (c.weight/100)), 0)
    );

    // Insights
    const insights = [];
    const estFlag = !(paymentsBench.n >= 20 && shippingBench.n >= 20);
    const confidence = estFlag ? 0.55 : 0.8;

    if (paymentsBench.value != null && paymentsBench.p50 != null && paymentsBench.value > paymentsBench.p50 + 0.3) {
      insights.push({
        type: 'overpaying_payments',
        title: 'Likely overpaying in payments',
        message: `Your effective rate ${paymentsBench.value.toFixed(1)}% is above cohort p50 ${paymentsBench.p50.toFixed(1)}%`,
        metric_key: 'payments.effective_rate',
        cohort_ref: cohortKey,
        severity: 'warning',
        action_key: 'view_deals_payments',
        estimated: estFlag,
        confidence
      });
    }
    if (shippingBench.value != null && shippingBench.p50 != null && shippingBench.value > shippingBench.p50 * 1.15) {
      insights.push({
        type: 'overpaying_shipping',
        title: 'Shipping costs above peers',
        message: `€${shippingBench.value.toFixed(2)}/shipment vs p50 €${shippingBench.p50.toFixed(2)}`,
        metric_key: 'shipping.avg_cost',
        cohort_ref: cohortKey,
        severity: 'warning',
        action_key: 'view_deals_shipping',
        estimated: estFlag,
        confidence
      });
    }
    if (completeness < 60) {
      insights.push({
        type: 'low_readiness',
        title: 'Low data completeness may block savings',
        message: 'Complete onboarding data to raise readiness and unlock accurate benchmarks',
        metric_key: 'global.readiness',
        cohort_ref: cohortKey,
        severity: 'info',
        action_key: 'complete_onboarding',
        estimated: estFlag,
        confidence
      });
    }
    if (avgGap > 0.15 && readiness < 60) {
      insights.push({
        type: 'high_opportunity_low_readiness',
        title: 'High savings potential but low readiness',
        message: 'Strong gaps vs peers detected; connect tools to accelerate activation',
        metric_key: 'global.opportunity',
        cohort_ref: cohortKey,
        severity: 'critical',
        action_key: 'connect_data',
        estimated: estFlag,
        confidence
      });
    }

    const intelligence = {
      cohort: { key: cohortKey, rules: { geo, gmv_band: gmvBand, channel: channelBucket }, n: Math.max(paymentsBench.n, shippingBench.n) },
      metrics: {
        payments: { effective_rate: paymentsBench },
        shipping: { avg_cost: shippingBench },
        saas: { pct_revenue: saasBench }
      },
      infra_breakdown: breakdown,
      infra_score: infraScore,
      insights,
      flags: { estimated: estFlag, confidence }
    };

    return Response.json({ intelligence });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});