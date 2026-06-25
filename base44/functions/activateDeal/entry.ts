import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

function assert(value, message) { if (!value) throw new Error(message); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    assert(me, 'Unauthorized');

    const body = await req.json().catch(() => ({}));
    const { vertical, resultId, provider_id: providerId, brand_id: requestedBrandId } = body || {};
    assert(vertical, 'vertical required');

    // FIX 6 — prefer explicit brand_id with ownership check; fall back to user's latest brand
    let brand = null;
    if (requestedBrandId) {
      const owned = await base44.entities.Brand.filter({ created_by: me.email, id: requestedBrandId });
      if (!owned.length) {
        return Response.json({ error: 'Brand not found or access denied' }, { status: 403 });
      }
      brand = owned[0];
    } else {
      // TODO: require explicit brand_id selection for multi-brand users
      const brands = await base44.entities.Brand.filter({ created_by: me.email }, '-created_date', 1);
      brand = brands?.[0];
    }
    assert(brand, 'No brand found for current user');

    let result = null; let input = null;
    if (resultId) {
      const r = await base44.entities.AnalyzerResult.filter({ id: resultId });
      result = r?.[0] || null;
      if (result?.input_id) {
        const ins = await base44.entities.AnalyzerInput.filter({ id: result.input_id });
        input = ins?.[0] || null;
      }
    }

    const existing = await base44.entities.DealActivation.filter({ brand_id: brand.id, vertical });
    const dup = existing.find(d => ['activated','awaiting_authorization','authorized','migrating','live','monetizing','paused'].includes(d.status));
    assert(!dup, 'An activation already exists for this vertical');

    const monthlyRevenue = Number(input?.monthly_revenue || 0);
    let currentMonthly = 0, projectedMonthly = 0, providerFrom = 'Current', providerTo = 'Network';
    if (vertical === 'payments') {
      const curr = Number(result?.details?.payment_current_rate ?? 2.9);
      const next = Number(result?.details?.payment_optimal_rate ?? 1.4);
      currentMonthly = monthlyRevenue * (curr/100);
      projectedMonthly = monthlyRevenue * (next/100);
      providerFrom = input?.payment_provider || 'Current PSP';
      providerTo = 'Network PSP';
    } else if (vertical === 'shipping') {
      const perCurr = Number(result?.details?.shipping_current_avg ?? 7.5);
      const perNext = Number(result?.details?.shipping_optimal_avg ?? 5.2);
      const shipments = Number(input?.monthly_shipments ?? Math.max(1, Math.round((input?.monthly_shipping_cost || 0) / perCurr)));
      currentMonthly = perCurr * shipments;
      projectedMonthly = perNext * shipments;
      providerFrom = input?.shipping_provider || 'Current carrier';
      providerTo = 'Network carrier';
    } else {
      currentMonthly = Number(input?.total_saas_spend ?? 2500);
      projectedMonthly = Number(result?.details?.saas_optimal_total ?? currentMonthly * 0.7);
      providerFrom = 'Current tools';
      providerTo = 'Group licenses';
    }
    const estMonthly = Math.max(0, currentMonthly - projectedMonthly);
    const estAnnual = Math.round(estMonthly * 12);

    const deal = await base44.entities.DealActivation.create({
      brand_id: brand.id,
      user_email: me.email,
      vertical,
      provider_id: providerId || undefined,
      provider_from: providerFrom,
      provider_to: providerTo,
      projected_savings_monthly: Math.round(estMonthly),
      projected_savings_annual: estAnnual,
      node_share_percent: 25,
      billing_model: 'monthly_success_fee',
      status: 'detected',
      activated_at: new Date().toISOString(),
      last_updated: new Date().toISOString()
    });

    const baselineType = vertical === 'payments' ? 'rate' : 'cost';
    const baselineValue = vertical === 'payments'
      ? Number(result?.details?.payment_current_rate ?? 2.9)
      : (vertical === 'shipping' ? Number(result?.details?.shipping_current_avg ?? 7.5) : Number(input?.total_saas_spend ?? 2500));

    await base44.entities.Baseline.create({
      deal_activation_id: deal.id,
      brand_id: brand.id,
      provider_id: deal.provider_id || '',
      catalog_deal_id: deal.catalog_deal_id || '',
      vertical,
      baseline_type: baselineType,
      baseline_value: baselineValue,
      currency: 'EUR',
      snapshot_json: { resultId, inputId: result?.input_id, details: result?.details },
      source: input ? 'manual' : 'api',
      locked: true,
      locked_at: new Date().toISOString(),
      is_current: true
    });

    await base44.entities.BillingRule.create({
      deal_activation_id: deal.id,
      brand_id: brand.id,
      provider_id: deal.provider_id || '',
      billing_model: 'monthly_success_fee',
      node_share_percent: 25,
      status: 'active',
      effective_start_date: new Date().toISOString().slice(0,10)
    });

    return Response.json({ ok: true, deal_activation_id: deal.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
});