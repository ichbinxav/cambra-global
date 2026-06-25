import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M3 — Stripe Data Sync (READ-ONLY)
 *
 * Fetches last 30 days of charges + balance transactions from Stripe and
 * computes monthly KPIs. Updates the brand's StripeConnection record.
 *
 * Payload: { brand_id?: string }
 * Returns: { ok, data } or { ok:false, error, setup_required? }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return Response.json({
        ok: false,
        error: 'Stripe not configured',
        setup_required: true,
      });
    }

    const body = await req.json().catch(() => ({}));
    let { brand_id } = body;

    // Resolve brand_id from user if not provided
    if (!brand_id) {
      const brands = await base44.entities.Brand.list('-created_date', 1).catch(() => []);
      if (!brands.length) return Response.json({ ok: false, error: 'No brand found' }, { status: 400 });
      brand_id = brands[0].id;
    }

    // Verify brand ownership (admins allowed via service role pathway)
    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      const userBrands = await base44.entities.Brand.filter({ id: brand_id }).catch(() => []);
      if (!userBrands.length) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    // Find active StripeConnection
    const connections = await base44.asServiceRole.entities.StripeConnection.filter(
      { brand_id, connection_status: 'connected' },
      '-last_sync_at',
      1
    );
    if (!connections.length) {
      return Response.json({ ok: false, error: 'No active Stripe connection' }, { status: 404 });
    }
    const conn = connections[0];

    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

    // Read-only fetches — use Stripe-Account header to scope to connected account
    const stripeHeaders = {
      'Authorization': `Bearer ${stripeKey}`,
      'Stripe-Account': conn.stripe_account_id,
    };

    // Fetch charges (last 30d, paginate up to 1000)
    const charges = [];
    let startingAfter = null;
    for (let i = 0; i < 10; i++) {
      const params = new URLSearchParams({
        limit: '100',
        'created[gte]': String(since),
      });
      if (startingAfter) params.set('starting_after', startingAfter);
      const res = await fetch(`https://api.stripe.com/v1/charges?${params}`, { headers: stripeHeaders });
      const json = await res.json();
      if (!res.ok) {
        return Response.json({ ok: false, error: json?.error?.message || 'Stripe charges fetch failed' }, { status: 502 });
      }
      const items = json.data || [];
      charges.push(...items);
      if (!json.has_more || !items.length) break;
      startingAfter = items[items.length - 1].id;
    }

    // Fetch balance transactions for fee breakdown
    const balanceTxns = [];
    startingAfter = null;
    for (let i = 0; i < 10; i++) {
      const params = new URLSearchParams({
        limit: '100',
        'created[gte]': String(since),
      });
      if (startingAfter) params.set('starting_after', startingAfter);
      const res = await fetch(`https://api.stripe.com/v1/balance_transactions?${params}`, { headers: stripeHeaders });
      const json = await res.json();
      if (!res.ok) break; // non-fatal — breakdown is optional
      const items = json.data || [];
      balanceTxns.push(...items);
      if (!json.has_more || !items.length) break;
      startingAfter = items[items.length - 1].id;
    }

    // Compute KPIs (amounts are in minor units → divide by 100)
    const successful = charges.filter(c => c.status === 'succeeded' && !c.refunded);
    const monthlyVolume = successful.reduce((s, c) => s + (c.amount || 0), 0) / 100;
    const totalFees = successful.reduce((s, c) => s + (c.application_fee_amount || 0), 0) / 100
      + balanceTxns.filter(t => t.type === 'charge').reduce((s, t) => s + (t.fee || 0), 0) / 100;
    const totalTransactions = successful.length;
    const effectiveFeePct = monthlyVolume > 0 ? (totalFees / monthlyVolume) * 100 : 0;
    const avgOrderValue = totalTransactions > 0 ? monthlyVolume / totalTransactions : 0;

    // Fee breakdown by fee_details.type
    const breakdownMap = {};
    for (const t of balanceTxns) {
      if (t.type !== 'charge') continue;
      for (const fd of (t.fee_details || [])) {
        const label = fd.type || 'other';
        breakdownMap[label] = (breakdownMap[label] || 0) + (fd.amount || 0) / 100;
      }
    }
    const feeBreakdown = Object.entries(breakdownMap).map(([label, amount]) => ({
      label,
      amount: Math.round(amount * 100) / 100,
      pct: totalFees > 0 ? Math.round((amount / totalFees) * 10000) / 100 : 0,
    }));

    const currency = (successful[0]?.currency || conn.currency || 'eur').toUpperCase();

    const updated = await base44.asServiceRole.entities.StripeConnection.update(conn.id, {
      monthly_volume: Math.round(monthlyVolume * 100) / 100,
      effective_fee_pct: Math.round(effectiveFeePct * 10000) / 10000,
      total_fees_monthly: Math.round(totalFees * 100) / 100,
      total_transactions: totalTransactions,
      avg_order_value: Math.round(avgOrderValue * 100) / 100,
      fee_breakdown: feeBreakdown,
      currency,
      data_as_of: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      connection_status: 'connected',
    });

    return Response.json({
      ok: true,
      data: {
        monthly_volume: updated.monthly_volume,
        effective_fee_pct: updated.effective_fee_pct,
        total_fees_monthly: updated.total_fees_monthly,
        total_transactions: updated.total_transactions,
        avg_order_value: updated.avg_order_value,
        fee_breakdown: updated.fee_breakdown,
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});