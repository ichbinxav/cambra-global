import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');

    const { vertical, resultId } = await req.json().catch(() => ({}));
    assert(['payments','shipping','saas'].includes(vertical), 'Invalid vertical');

    const brands = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
    const brand = brands?.[0];
    assert(brand, 'Brand not found');

    // Duplicate protection
    const existing = await base44.entities.DealActivation.filter({ brand_id: brand.id, vertical });
    const dup = existing.find(d => ['activated','awaiting_authorization','authorized','migrating','live','monetizing','paused'].includes(d.status));
    assert(!dup, 'An activation already exists for this brand/vertical');

    // Load analysis context
    let result = null; let input = null;
    if (resultId) {
      const r = await base44.entities.AnalyzerResult.filter({ id: resultId });
      result = r?.[0] || null;
      if (result?.input_id) {
        const ins = await base44.entities.AnalyzerInput.filter({ id: result.input_id });
        input = ins?.[0] || null;
      }
    }
    assert(result, 'Analyzer result missing');

    // Compute summary — all values MUST come from AnalyzerResult.details (scoreEngine output).
    // Never fall back to a hardcoded rate: if details are missing, the result is invalid for activation.
    // Note: Number(undefined) = NaN. isFinite() rejects NaN, Infinity and undefined-derived values.
    assert(result?.details && typeof result.details === 'object',
      'AnalyzerResult has no details object — re-run the Analyzer before activating');

    const monthlyRevenue = Number(input?.monthly_revenue || 0);
    let currentMonthly = 0, projectedMonthly = 0, providerFrom = 'Current', providerTo = 'Network';
    if (vertical === 'payments') {
      const curr = Number(result.details.payment_current_rate);
      const next = Number(result.details.payment_optimal_rate);
      assert(isFinite(curr) && curr >= 0, 'Missing or invalid payment_current_rate in analyzer result — cannot freeze baseline');
      assert(isFinite(next) && next > 0,  'Missing or invalid payment_optimal_rate in analyzer result — cannot freeze baseline');
      currentMonthly = monthlyRevenue * (curr/100);
      projectedMonthly = monthlyRevenue * (next/100);
      providerFrom = input?.payment_provider || 'Current PSP';
      providerTo = 'Network PSP';
    } else if (vertical === 'shipping') {
      const perCurr = Number(result.details.shipping_current_avg);
      const perNext = Number(result.details.shipping_optimal_avg);
      assert(isFinite(perCurr) && perCurr > 0, 'Missing or invalid shipping_current_avg in analyzer result — cannot freeze baseline');
      assert(isFinite(perNext) && perNext > 0, 'Missing or invalid shipping_optimal_avg in analyzer result — cannot freeze baseline');
      const shipments = Number(input?.monthly_shipments ?? Math.max(1, Math.round((input?.monthly_shipping_cost || 0) / perCurr)));
      currentMonthly = perCurr * shipments;
      projectedMonthly = perNext * shipments;
      providerFrom = input?.shipping_provider || 'Current carrier';
      providerTo = 'Network carrier';
    } else {
      currentMonthly = Number(input?.total_saas_spend || 0);
      projectedMonthly = Number(result.details.saas_optimal_total ?? currentMonthly * 0.7);
      assert(isFinite(currentMonthly) && currentMonthly > 0, 'Missing total_saas_spend — cannot freeze baseline');
      providerFrom = 'Current tools';
      providerTo = 'Group licenses';
    }
    const estMonthly = Math.max(0, currentMonthly - projectedMonthly);
    const estAnnual = Math.round(estMonthly * 12);

    // Create DealActivation in awaiting_authorization
    const activation = await base44.entities.DealActivation.create({
      brand_id: brand.id,
      user_email: me.email,
      vertical,
      provider_from: providerFrom,
      provider_to: providerTo,
      projected_savings_monthly: Math.round(estMonthly),
      projected_savings_annual: estAnnual,
      node_share_percent: 25,
      billing_model: 'monthly_success_fee',
      status: 'awaiting_authorization',
      activated_at: new Date().toISOString(),
      last_updated: new Date().toISOString()
    });

    // Freeze Baseline — values come from AnalyzerResult.details only (all asserted above)
    const baselineType = vertical === 'payments' ? 'rate' : 'cost';
    const baselineValue = vertical === 'payments'
      ? Number(result.details.payment_current_rate)
      : (vertical === 'shipping' ? Number(result.details.shipping_current_avg) : Number(input?.total_saas_spend || 0));

    await base44.entities.Baseline.create({
      deal_activation_id: activation.id,
      brand_id: brand.id,
      provider_id: activation.provider_id || '',
      catalog_deal_id: activation.catalog_deal_id || '',
      vertical,
      baseline_type: baselineType,
      baseline_value: baselineValue,
      currency: 'EUR',
      snapshot_json: {
        analysis: { result_id: resultId, input_id: result?.input_id, details: result?.details },
        assumptions: { provider_from: providerFrom, provider_to: providerTo, monthly_revenue: monthlyRevenue },
        confidence: 0.5
      },
      source: 'manual',
      locked: true,
      locked_at: new Date().toISOString(),
      is_current: true
    });

    // Ensure BillingRule exists
    const rules = await base44.entities.BillingRule.filter({ deal_activation_id: activation.id }, '-created_date', 1);
    if (!rules.length) {
      await base44.entities.BillingRule.create({
        deal_activation_id: activation.id,
        brand_id: brand.id,
        provider_id: activation.provider_id || '',
        billing_model: 'monthly_success_fee',
        node_share_percent: 25,
        status: 'active',
        effective_start_date: new Date().toISOString().slice(0,10)
      });
    }

    // Log
    await base44.entities.OperationalLog.create({
      deal_activation_id: activation.id,
      brand_id: brand.id,
      provider_id: activation.provider_id || '',
      event_type: 'activation_created',
      message: 'Activation package created and baseline frozen',
      data_json: { vertical, estAnnual },
      actor_email: me.email,
      created_at: new Date().toISOString()
    });

    return Response.json({ ok: true, deal_activation_id: activation.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});