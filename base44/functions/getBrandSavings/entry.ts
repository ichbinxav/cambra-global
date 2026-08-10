import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * getBrandSavings
 *
 * Returns the savings stack for a brand:
 *  - identified  → from latest AnalyzerResult
 *  - activated   → sum of DealActivation projections
 *  - realized    → sum of MonthlySavingsReport.savings (last 12 months)
 *  - monthly_history (last 12 MonthlySavingsReport, ascending)
 *  - realized_to_date / node_fees_to_date (lifetime)
 *  - measurement_quality (verified / mixed / estimated)
 *  - baseline (current Baseline summary)
 *  - next_report_due (first day of next month)
 */

function nextReportDueISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function ymSinceMonthsAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId } = await req.json().catch(() => ({}));
    if (!brandId) return Response.json({ error: 'brandId required' }, { status: 400 });

    const brands = await base44.entities.Brand.filter({ id: brandId });
    const brand = brands?.[0];
    if (!brand) return Response.json({ error: 'Brand not found' }, { status: 404 });
    const isOwner = brand.created_by === user.email;
    const isAdmin = user.role === 'admin';
    if (!isOwner && !isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole;

    const results = await svc.entities.AnalyzerResult.filter({ brand_id: brandId }, '-created_date', 1);
    const latestResult = results?.[0] || null;
    const identifiedYearly = Number(latestResult?.total_savings || 0);

    const savingsRows = await svc.entities.BrandSavings.filter({ brand_id: brandId }, '-created_date', 100);

    const activations = await svc.entities.DealActivation.filter({ brand_id: brandId });
    const activatedYearly = activations.reduce(
      (s, a) => s + Number(a.estimated_savings_yearly || a.projected_savings_annual || 0),
      0
    );

    const allReports = await svc.entities.MonthlySavingsReport
      .filter({ brand_id: brandId }).catch(() => []);
    const liveReports = allReports.filter(r => r.status !== 'void');

    const ymSince = ymSinceMonthsAgo(12);
    const last12 = liveReports.filter(r => r.month >= ymSince).sort((a, b) => (a.month > b.month ? 1 : -1));
    const realizedYearly = last12.reduce((s, r) => s + Number(r.savings || 0), 0);

    // Lifetime totals
    const realizedToDate = liveReports.reduce((s, r) => s + Number(r.savings || 0), 0);
    const nodeFeesToDate = liveReports.reduce((s, r) => s + Number(r.node_fee || 0), 0);

    // Quality across live reports
    let measurementQuality = 'estimated';
    if (liveReports.length > 0) {
      const modes = new Set(liveReports.map(r => r.measurement_mode));
      const allVerified = liveReports.every(r => r.measurement_mode === 'fully_verified');
      const anyVerified = modes.has('fully_verified') || modes.has('estimated_from_partial_data');
      const allEstimated = liveReports.every(r => r.measurement_mode === 'fallback_projection');
      if (allVerified) measurementQuality = 'verified';
      else if (allEstimated) measurementQuality = 'estimated';
      else if (anyVerified) measurementQuality = 'mixed';
    }

    // Current baseline (summary only — no brand internals)
    const baselines = await svc.entities.Baseline
      .filter({ brand_id: brandId, is_current: true }, '-locked_at', 10).catch(() => []);
    const baseline = baselines[0]
      ? {
          baseline_value: baselines[0].baseline_value,
          vertical: baselines[0].vertical,
          locked_at: baselines[0].locked_at,
          currency: baselines[0].currency || 'EUR',
        }
      : null;

    const monthlyHistory = last12.map(r => ({
      month: r.month,
      savings: Number(r.savings || 0),
      node_fee: Number(r.node_fee || 0),
      measurement_mode: r.measurement_mode,
      verification_status: r.verification_status,
      baseline_cost: Number(r.baseline_cost || 0),
      current_cost: Number(r.actual_cost || 0),
    }));

    return Response.json({
      brandId,
      identified: { yearly: identifiedYearly, monthly: identifiedYearly / 12 },
      activated: { yearly: activatedYearly, monthly: activatedYearly / 12 },
      realized: { yearly: realizedYearly, monthly: realizedYearly / 12 },
      monthly_history: monthlyHistory,
      realized_to_date: Number(realizedToDate.toFixed(2)),
      node_fees_to_date: Number(nodeFeesToDate.toFixed(2)),
      measurement_quality: measurementQuality,
      baseline,
      next_report_due: nextReportDueISO(),
      history: savingsRows,
    });
  } catch (error) {
    console.error('getBrandSavings failed', error);
    return Response.json({ error: 'brand_savings_unavailable' }, { status: 500 });
  }
});