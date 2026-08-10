import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * M3-1b — Stripe Data Sync (READ-ONLY) — canonical measured rate
 *
 * Fetches last 90 days of charges + balance transactions from the connected
 * Stripe account and computes the merchant's TRUE effective payment rate,
 * comparable to what Stripe publishes on its own pricing page.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ CANONICAL DEFINITION (sealed 2026-07-10 in Decision_Log)             │
 * │                                                                       │
 * │ CATEGORIES = { charge, refund, partial_capture_reversal }            │
 * │   These are the only balance_transaction.reporting_category values   │
 * │   that represent per-transaction PROCESSING cost paid by the         │
 * │   merchant. Excluded: application_fee (Connect platform fees),       │
 * │   stripe_fee (monthly SaaS-style Stripe fees), payout, transfer,     │
 * │   adjustment, dispute, etc.                                          │
 * │                                                                       │
 * │ numerator_cents   = Σ fee   over rows WHERE category ∈ CATEGORIES    │
 * │ denominator_cents = Σ amount over rows WHERE category ∈ CATEGORIES   │
 * │                                                                       │
 * │ Refunds carry NEGATIVE amount and POSITIVE fee in Stripe's model, so │
 * │ this single-formula approach gives us:                               │
 * │   - numerator = fees_charge + fees_refund (all positive; refund fees │
 * │     are sunk cost the PSP does NOT return by default)                │
 * │   - denominator = gross_charge − refunded_amount = NET volume        │
 * │     (matches how Stripe publishes its own rate — apples to apples)   │
 * │                                                                       │
 * │ measured_current_bps = 10000 * numerator / denominator (round int)   │
 * │                                                                       │
 * │ Why NET denominator (winning argument):                              │
 * │   If we put refund fees in the numerator but keep gross in the       │
 * │   denominator, we count the refunded volume asymmetrically — the     │
 * │   rate biases DOWN, worst-case for a VERIFIED badge. Fashion         │
 * │   merchants (our target) see 20–30% refund rates; the gap between    │
 * │   gross and net is not cosmetic. Net = defensible number.            │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Payload: { brand_id?: string }
 * Returns: { ok, data } or { ok:false, error, setup_required? }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const liveKey = Deno.env.get('STRIPE_SECRET_KEY');
    const testKey = Deno.env.get('STRIPE_TEST_SECRET_KEY');
    if (!liveKey) {
      return Response.json({
        ok: false,
        error: 'Stripe not configured',
        setup_required: true,
      });
    }

    const body = await req.json().catch(() => ({}));
    let { brand_id } = body;
    const isAdmin = user.role === 'admin';

    // Require explicit brand_id; fall back to user's latest brand only when not provided.
    if (!brand_id) {
      const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1).catch(() => []);
      if (!brands.length) return Response.json({ ok: false, error: 'brand_id is required' }, { status: 400 });
      brand_id = brands[0].id;
    }

    // Verify brand ownership (admins bypass).
    if (!isAdmin) {
      const userBrands = await base44.entities.Brand.filter({ created_by: user.email, id: brand_id }).catch(() => []);
      if (!userBrands.length) {
        return Response.json({ ok: false, error: 'Brand not found or access denied' }, { status: 403 });
      }
    }

    // Find active StripeConnection.
    const connections = await base44.asServiceRole.entities.StripeConnection.filter(
      { brand_id, connection_status: 'connected' },
      '-last_sync_at',
      1
    );
    if (!connections.length) {
      return Response.json({ ok: false, error: 'No active Stripe connection' }, { status: 404 });
    }
    const conn = connections[0];

    // M3-1b: ventana 90 días (era 30d). El motor de payments razona en
    // "monthly rate" pero necesitamos una muestra estable — 90d absorbe
    // estacionalidad semanal y da 3× la señal en el mismo tiempo de wall-clock.
    const WINDOW_DAYS = 90;
    const untilTs = Math.floor(Date.now() / 1000);
    const sinceTs = untilTs - WINDOW_DAYS * 24 * 60 * 60;

    // Read-only auth mode.
    //
    // TEST-MODE BRIDGE — remove when per-merchant Connect OAuth ships.
    // Real merchants will connect via Connect OAuth, at which point the
    // platform's live key + Stripe-Account header is the only path. Until
    // then we need to talk to Stripe test-mode accounts (M3 validation
    // harness) with STRIPE_TEST_SECRET_KEY directly and no Stripe-Account
    // header (test-mode keys authenticate against the test account directly
    // and reject Stripe-Account headers that don't match).
    //
    // Flag lives on the DATA (StripeConnection.is_test), never on the code —
    // avoids magic-string account matching and makes the branch auditable
    // per-row. See KNOWN_DEBT.md → BUG-6 for retirement condition.
    let stripeHeaders: Record<string, string>;
    if (conn.is_test === true) {
      if (!testKey) {
        return Response.json({ ok: false, error: 'STRIPE_TEST_SECRET_KEY required for test-mode connection', setup_required: true });
      }
      stripeHeaders = { 'Authorization': `Bearer ${testKey}` };
    } else {
      stripeHeaders = {
        'Authorization': `Bearer ${liveKey}`,
        'Stripe-Account': conn.stripe_account_id,
      };
    }

    // ── Fetch charges (paginated, up to 1000 for the window) ─────────────
    // We fetch charges primarily to enrich WITH card.country (the international
    // share signal we need for M3 — payments-gap engine uses intl_pct today
    // from user input, but with real data we'll cross-check it). Fees themselves
    // come from balance_transactions where they're authoritative and
    // reporting_category is present (charges list doesn't carry it).
    const charges: any[] = [];
    let startingAfter: string | null = null;
    for (let i = 0; i < 10; i++) {
      const params = new URLSearchParams({
        limit: '100',
        'created[gte]': String(sinceTs),
        // Expand payment_method_details so we get card.country per charge.
        // This is on the charge itself; expand is the documented path.
        'expand[]': 'data.payment_method_details',
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

    // ── Fetch balance transactions (paginated, up to 1000 for the window) ─
    const balanceTxns: any[] = [];
    startingAfter = null;
    for (let i = 0; i < 10; i++) {
      const params = new URLSearchParams({
        limit: '100',
        'created[gte]': String(sinceTs),
      });
      if (startingAfter) params.set('starting_after', startingAfter);
      const res = await fetch(`https://api.stripe.com/v1/balance_transactions?${params}`, { headers: stripeHeaders });
      const json = await res.json();
      if (!res.ok) {
        return Response.json({ ok: false, error: json?.error?.message || 'Stripe balance_transactions fetch failed' }, { status: 502 });
      }
      const items = json.data || [];
      balanceTxns.push(...items);
      if (!json.has_more || !items.length) break;
      startingAfter = items[items.length - 1].id;
    }

    // ── Canonical filter (see header) ────────────────────────────────────
    const CANONICAL_CATEGORIES = new Set(['charge', 'refund', 'partial_capture_reversal']);
    const canonicalRows = balanceTxns.filter(t => CANONICAL_CATEGORIES.has(t.reporting_category));

    // Numerator = Σ fee, denominator = Σ amount, both in the canonical set.
    // Amounts are integers in the smallest currency unit (cents / EUR minor).
    let numeratorCents = 0;
    let denominatorCents = 0;
    let countCharge = 0;
    let countRefund = 0;
    let countPartial = 0;
    for (const t of canonicalRows) {
      numeratorCents += Number(t.fee || 0);
      denominatorCents += Number(t.amount || 0);
      if (t.reporting_category === 'charge') countCharge++;
      else if (t.reporting_category === 'refund') countRefund++;
      else if (t.reporting_category === 'partial_capture_reversal') countPartial++;
    }

    // measured_current_bps = 10000 * fees / net_volume, integer bps.
    // Guard: no volume → 0 bps rather than divide-by-zero. Explicit note in
    // the response so downstream never mistakes it for "no fees".
    const measuredCurrentBps = denominatorCents > 0
      ? Math.round((numeratorCents / denominatorCents) * 10000)
      : 0;

    // ── Fee breakdown by fee_details.type (canonical rows only) ──────────
    // Same set of rows as the numerator — apples-to-apples with the headline
    // measured rate. Historical rows (charge-only, no canonical filter) are
    // available in the raw fetch but the UI-facing breakdown is filtered.
    const breakdownMap: Record<string, number> = {};
    for (const t of canonicalRows) {
      for (const fd of (t.fee_details || [])) {
        const label = fd.type || 'other';
        breakdownMap[label] = (breakdownMap[label] || 0) + Number(fd.amount || 0);
      }
    }
    const feeBreakdown = Object.entries(breakdownMap).map(([label, cents]) => ({
      label,
      amount: Math.round(cents) / 100,
      pct: numeratorCents > 0 ? Math.round((cents / numeratorCents) * 10000) / 100 : 0,
    }));

    // ── International share from card.country (enrichment) ───────────────
    // Only counts successful charges; refunds don't add signal here.
    let intlCharges = 0;
    let domesticCharges = 0;
    const acctCountry = (conn.country || 'FR').toUpperCase();
    for (const c of charges) {
      if (c.status !== 'succeeded') continue;
      const cardCountry = c.payment_method_details?.card?.country;
      if (!cardCountry) continue;
      if (String(cardCountry).toUpperCase() === acctCountry) domesticCharges++;
      else intlCharges++;
    }
    const identifiedCharges = intlCharges + domesticCharges;
    const intlSharePct = identifiedCharges > 0
      ? Math.round((intlCharges / identifiedCharges) * 10000) / 100
      : null; // null when we can't identify (rather than a lying 0).

    // ── Aggregates for the StripeConnection row (major units for legacy fields) ─
    const monthlyVolumeMajor = Math.round(denominatorCents) / 100;
    const totalFeesMajor = Math.round(numeratorCents) / 100;
    const totalTransactions = countCharge; // "transactions" = charge count, not refund count.
    const avgOrderValue = countCharge > 0
      ? Math.round((canonicalRows
          .filter(t => t.reporting_category === 'charge')
          .reduce((s, t) => s + Number(t.amount || 0), 0) / countCharge)) / 100
      : 0;
    const currency = (canonicalRows[0]?.currency || conn.currency || 'eur').toUpperCase();

    const updated = await base44.asServiceRole.entities.StripeConnection.update(conn.id, {
      monthly_volume: monthlyVolumeMajor,
      // effective_fee_pct kept for legacy UI; same number the canonical
      // engine reads, just in % not bps. Preserved so downstream Dashboard
      // reads that still hit this field don't break — they see the CANONICAL
      // rate now (previously they saw the biased-down all-in rate).
      effective_fee_pct: Math.round((measuredCurrentBps / 100) * 10000) / 10000,
      total_fees_monthly: totalFeesMajor,
      total_transactions: totalTransactions,
      avg_order_value: avgOrderValue,
      fee_breakdown: feeBreakdown,
      currency,
      data_as_of: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      connection_status: 'connected',
    });

    // Non-blocking vendor inference from descriptors.
    try {
      await base44.asServiceRole.functions.invoke('inferVendorsFromBankData', { brand_id, internal_secret: Deno.env.get('INTERNAL_CALL_SECRET') || '' });
    } catch (e) {
      console.warn('inferVendorsFromBankData failed (non-blocking):', (e as any)?.message || e);
    }

    return Response.json({
      ok: true,
      data: {
        // Legacy fields kept for the current Dashboard reads.
        monthly_volume: updated.monthly_volume,
        effective_fee_pct: updated.effective_fee_pct,
        total_fees_monthly: updated.total_fees_monthly,
        total_transactions: updated.total_transactions,
        avg_order_value: updated.avg_order_value,
        fee_breakdown: updated.fee_breakdown,

        // Canonical M3 fields — the auditable ones.
        window: {
          days: WINDOW_DAYS,
          since_ts: sinceTs,
          until_ts: untilTs,
          since_iso: new Date(sinceTs * 1000).toISOString(),
          until_iso: new Date(untilTs * 1000).toISOString(),
        },
        canonical: {
          categories_included: ['charge', 'refund', 'partial_capture_reversal'],
          numerator_cents: numeratorCents,
          denominator_cents: denominatorCents,
          measured_current_bps: measuredCurrentBps,
          measured_current_pct: Math.round(measuredCurrentBps) / 100,
          counts: { charge: countCharge, refund: countRefund, partial_capture_reversal: countPartial },
        },
        intl: {
          identified_charges: identifiedCharges,
          intl_charges: intlCharges,
          domestic_charges: domesticCharges,
          intl_share_pct: intlSharePct,
          acct_country: acctCountry,
        },
        // Raw counts for cross-checking against ground truth.
        raw_counts: { charges_fetched: charges.length, balance_txns_fetched: balanceTxns.length },
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: (error as any).message }, { status: 500 });
  }
});