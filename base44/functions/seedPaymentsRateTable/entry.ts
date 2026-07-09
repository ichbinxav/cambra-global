// Admin-only, idempotent seeder for the PaymentsRateTable entity.
// Idempotency: upserts by cohort_key. Existing rows are UPDATED (never
// duplicated) so re-running after correcting a cited number is safe.
// Chunk 1b: seeds 6 verified rows (Stripe EU/UK/US, PayPal EU/UK/US,
// Shopify US Basic) + 4 regional fallback rows. Every verified row carries a
// source_url + source_quote for audit — if a rate changes, grep source_quote
// to find the stale row.
// Component-atomic format (Enmienda estructural del Chunk 1a):
// - percent_bps and fixed_fee_minor_units stored SEPARATELY
// - Engine amortizes fixed_fee against merchant's real avg_ticket at runtime
// - No blended-to-AOV numbers ever leave this file

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const NOW = new Date().toISOString();

    // -------------------------------------------------------------------
    // VERIFIED ROWS — every number cited verbatim from the source URL
    // Sondeo: 2026-07-09
    // -------------------------------------------------------------------
    const verified = [
      // --- Stripe EU (EEA standard consumer cards) ---
      {
        cohort_key: 'stripe|ANY|EU',
        provider_slug: 'stripe',
        tier: 'ANY',
        region: 'EU',
        percent_bps: 150,           // 1.5%
        fixed_fee_minor_units: 25,  // 0.25 EUR
        fixed_fee_currency: 'EUR',
        // Achievable breakdown (bottom-up, documented in achievable_breakdown_json):
        //   interchange 26 bps (IFR mix débito 40% × 20 bps + crédito 60% × 30 bps)
        //   + scheme_fees 20 bps (public Visa/MC schedules, conservative)
        //   + processor_margin 40 bps (ASSUMPTION, band ±20 bps)
        //   = 86 bps
        achievable_percent_bps: 86,
        achievable_fixed_fee_minor_units: 25, // fixed fee rarely negotiated below scheme minimums
        verified: true,
        source_url: 'https://stripe.com/es/pricing',
        source_quote: '1,5 % + 0,25 € para tarjetas estándar del Espacio Económico Europeo',
        source_notes: 'EEA consumer standard cards. Premium EEA (1,9% + 0,25€) NOT seeded — added when form asks card mix (Fase 6). Also verified verbatim on https://stripe.com/fr/pricing.',
        achievable_breakdown_json: {
          interchange_bps: 26,
          scheme_fees_bps: 20,
          processor_margin_bps: 40,
          processor_margin_band_bps: 20,
          sources: [
            { label: 'IFR (EU 2015/751) — 0.2% debit, 0.3% credit consumer caps', url: 'https://eur-lex.europa.eu/EN/legal-content/summary/fees-for-card-based-payments.html' },
            { label: 'Assumption — merchant negotiable margin range', url: null }
          ]
        },
        savings_band_pct: 0.20,
        verified_at: NOW,
        active: true
      },
      // --- Stripe UK (UK standard consumer cards) ---
      {
        cohort_key: 'stripe|ANY|UK',
        provider_slug: 'stripe',
        tier: 'ANY',
        region: 'UK',
        percent_bps: 150,           // 1.5%
        fixed_fee_minor_units: 20,  // 20p
        fixed_fee_currency: 'GBP',
        achievable_percent_bps: 86,
        achievable_fixed_fee_minor_units: 20,
        verified: true,
        source_url: 'https://stripe.com/gb/pricing',
        source_quote: '1.5% + 20p for standard UK cards',
        source_notes: 'UK consumer standard cards. Premium UK (1.9% + 20p) and EEA cards from UK (2.5% + 20p) NOT seeded — added when form asks card mix (Fase 6). UK IFR caps mirror EU IFR post-Brexit (0.2%/0.3%).',
        achievable_breakdown_json: {
          interchange_bps: 26,
          scheme_fees_bps: 20,
          processor_margin_bps: 40,
          processor_margin_band_bps: 20,
          sources: [
            { label: 'UK IFR (retained EU law) — 0.2%/0.3% caps', url: 'https://eur-lex.europa.eu/EN/legal-content/summary/fees-for-card-based-payments.html' }
          ]
        },
        savings_band_pct: 0.20,
        verified_at: NOW,
        active: true
      },
      // --- Stripe US (domestic cards) ---
      {
        cohort_key: 'stripe|ANY|US',
        provider_slug: 'stripe',
        tier: 'ANY',
        region: 'US',
        percent_bps: 290,           // 2.9%
        fixed_fee_minor_units: 30,  // $0.30
        fixed_fee_currency: 'USD',
        // US has no IFR-style cap — Durbin (regulated debit) caps only ~24 bps + 22c for debit at large issuers, but most cards are unregulated credit.
        // Achievable: ~180 bps (interchange 110 bps blended + scheme 25 + margin 45 assumed).
        achievable_percent_bps: 180,
        achievable_fixed_fee_minor_units: 30,
        verified: true,
        source_url: 'https://stripe.com/pricing',
        source_quote: '2.9% + 30¢ per successful transaction for domestic cards',
        source_notes: 'US domestic consumer cards. International +1.5%, currency conversion +1% NOT seeded. No US IFR — achievable interchange is a blended market estimate, not a legal cap.',
        achievable_breakdown_json: {
          interchange_bps: 110,
          scheme_fees_bps: 25,
          processor_margin_bps: 45,
          processor_margin_band_bps: 25,
          sources: [
            { label: 'Assumption — US blended interchange, no IFR cap', url: null }
          ]
        },
        savings_band_pct: 0.25, // wider than EU/UK — no legal floor
        verified_at: NOW,
        active: true
      },
      // --- PayPal EU (ES market — same fee table applies across EEA) ---
      {
        cohort_key: 'paypal|ANY|EU',
        provider_slug: 'paypal',
        tier: 'ANY',
        region: 'EU',
        percent_bps: 290,           // 2.90%
        fixed_fee_minor_units: 35,  // 0.35 EUR
        fixed_fee_currency: 'EUR',
        // PayPal doesn't offer IC++ pricing. Achievable ≈ Stripe EU verified rate (86 bps)
        // as merchants can migrate. Represents "what you could pay if you moved off PayPal".
        achievable_percent_bps: 86,
        achievable_fixed_fee_minor_units: 25,
        verified: true,
        source_url: 'https://www.paypal.com/es/business/paypal-business-fees',
        source_quote: 'Todas las demás transacciones comerciales — 2,90% + tarifa fija (0,35 EUR)',
        source_notes: 'PayPal ES page (last updated 9 Feb 2026). Same fee structure applies to other EEA markets per PayPal EEA harmonization. Achievable rate uses Stripe EU verified components — the recommendation is "move card processing to a PSP with IC++ pricing".',
        achievable_breakdown_json: {
          interchange_bps: 26,
          scheme_fees_bps: 20,
          processor_margin_bps: 40,
          processor_margin_band_bps: 20,
          sources: [
            { label: 'IFR (EU 2015/751)', url: 'https://eur-lex.europa.eu/EN/legal-content/summary/fees-for-card-based-payments.html' },
            { label: 'Achievable modeled on Stripe EU verified rate', url: 'https://stripe.com/es/pricing' }
          ]
        },
        savings_band_pct: 0.20,
        verified_at: NOW,
        active: true
      },
      // --- PayPal UK ---
      {
        cohort_key: 'paypal|ANY|UK',
        provider_slug: 'paypal',
        tier: 'ANY',
        region: 'UK',
        percent_bps: 290,           // 2.9%
        fixed_fee_minor_units: 30,  // 0.30 GBP
        fixed_fee_currency: 'GBP',
        achievable_percent_bps: 86,
        achievable_fixed_fee_minor_units: 20,
        verified: true,
        source_url: 'https://www.paypal.com/uk/business/paypal-business-fees',
        source_quote: 'All Other Commercial Transactions — 2.9% + fixed fee (0.30 GBP)',
        source_notes: 'PayPal UK page (last updated 9 Feb 2026). Achievable modeled on Stripe UK verified rate.',
        achievable_breakdown_json: {
          interchange_bps: 26,
          scheme_fees_bps: 20,
          processor_margin_bps: 40,
          processor_margin_band_bps: 20,
          sources: [
            { label: 'Achievable modeled on Stripe UK verified rate', url: 'https://stripe.com/gb/pricing' }
          ]
        },
        savings_band_pct: 0.20,
        verified_at: NOW,
        active: true
      },
      // --- PayPal US ---
      {
        cohort_key: 'paypal|ANY|US',
        provider_slug: 'paypal',
        tier: 'ANY',
        region: 'US',
        percent_bps: 299,           // 2.99%
        fixed_fee_minor_units: 49,  // $0.49
        fixed_fee_currency: 'USD',
        achievable_percent_bps: 180,
        achievable_fixed_fee_minor_units: 30,
        verified: true,
        source_url: 'https://www.paypal.com/us/webapps/mpp/merchant-fees',
        source_quote: 'Standard Credit and Debit Card Payments — 2.99% + fixed fee (0.49 USD)',
        source_notes: 'PayPal US page (last updated 29 Jun 2026). PayPal Checkout is 3.49% + fee — NOT seeded (would need form to distinguish flow). Achievable modeled on Stripe US verified rate.',
        achievable_breakdown_json: {
          interchange_bps: 110,
          scheme_fees_bps: 25,
          processor_margin_bps: 45,
          processor_margin_band_bps: 25,
          sources: [
            { label: 'Achievable modeled on Stripe US verified rate', url: 'https://stripe.com/pricing' }
          ]
        },
        savings_band_pct: 0.25,
        verified_at: NOW,
        active: true
      },
      // --- Shopify Payments US (Basic plan) ---
      {
        cohort_key: 'shopify_payments|ANY|US',
        provider_slug: 'shopify_payments',
        tier: 'ANY',
        region: 'US',
        percent_bps: 290,           // 2.9% (Basic plan)
        fixed_fee_minor_units: 30,  // $0.30
        fixed_fee_currency: 'USD',
        achievable_percent_bps: 180,
        achievable_fixed_fee_minor_units: 30,
        verified: true,
        source_url: 'https://www.shopify.com/pricing',
        source_quote: 'Basic — Card rates from 2.9% + 30¢ USD',
        source_notes: 'Shopify Basic plan. Shopify tiers by plan: Grow 2.7%+30¢, Advanced 2.5%+30¢, Plus 2.25%+30¢ (all cited from shopify.com/pricing). NOT seeded until form asks Shopify plan. Premium cards 3.5%+30¢ documented but not seeded until Fase 6.',
        achievable_breakdown_json: {
          interchange_bps: 110,
          scheme_fees_bps: 25,
          processor_margin_bps: 45,
          processor_margin_band_bps: 25,
          sources: [
            { label: 'Shopify tiering by plan documented in source_notes', url: 'https://www.shopify.com/pricing' }
          ]
        },
        savings_band_pct: 0.25,
        verified_at: NOW,
        active: true
      }
    ];

    // -------------------------------------------------------------------
    // FALLBACK ROWS — regional averages, NOT provider-verified.
    // Used when engine's provider|region lookup misses (e.g. Adyen/Mollie/
    // Checkout/Braintree/Worldpay, and any unrecognized provider slug).
    // Wide savings band (±35%), verified=false triggers the mandatory
    // "Estimate — connect your PSP" assumption in engine output.
    // -------------------------------------------------------------------
    const fallback = [
      {
        cohort_key: 'ANY|ANY|EU',
        provider_slug: 'ANY',
        tier: 'ANY',
        region: 'EU',
        percent_bps: 200,           // 2.0% avg (between Stripe 1.5% and PayPal 2.9%)
        fixed_fee_minor_units: 25,  // 0.25 EUR blended
        fixed_fee_currency: 'EUR',
        achievable_percent_bps: 100, // interchange+scheme+margin, IFR-anchored
        achievable_fixed_fee_minor_units: 25,
        verified: false,
        source_url: 'https://eur-lex.europa.eu/EN/legal-content/summary/fees-for-card-based-payments.html',
        source_quote: 'IFR caps at 0.2% debit / 0.3% credit consumer cards — used as achievable floor',
        source_notes: 'Regional average derived from Stripe EU (1.5%+0.25€) and PayPal EU (2.9%+0.35€). NOT provider-verified. Used for Adyen, Mollie, Checkout.com, Braintree, Worldpay, and any unrecognized PSP until each is seeded with public source.',
        achievable_breakdown_json: {
          interchange_bps: 26,
          scheme_fees_bps: 20,
          processor_margin_bps: 54,
          processor_margin_band_bps: 30,
          sources: [
            { label: 'IFR — floor', url: 'https://eur-lex.europa.eu/EN/legal-content/summary/fees-for-card-based-payments.html' }
          ]
        },
        savings_band_pct: 0.35,
        verified_at: NOW,
        active: true
      },
      {
        cohort_key: 'ANY|ANY|UK',
        provider_slug: 'ANY',
        tier: 'ANY',
        region: 'UK',
        percent_bps: 200,
        fixed_fee_minor_units: 25,
        fixed_fee_currency: 'GBP',
        achievable_percent_bps: 100,
        achievable_fixed_fee_minor_units: 20,
        verified: false,
        source_url: 'https://eur-lex.europa.eu/EN/legal-content/summary/fees-for-card-based-payments.html',
        source_quote: 'Retained UK IFR mirrors EU caps 0.2%/0.3%',
        source_notes: 'Regional average derived from Stripe UK (1.5%+20p) and PayPal UK (2.9%+30p). NOT provider-verified.',
        achievable_breakdown_json: {
          interchange_bps: 26,
          scheme_fees_bps: 20,
          processor_margin_bps: 54,
          processor_margin_band_bps: 30,
          sources: [
            { label: 'UK IFR — floor', url: 'https://eur-lex.europa.eu/EN/legal-content/summary/fees-for-card-based-payments.html' }
          ]
        },
        savings_band_pct: 0.35,
        verified_at: NOW,
        active: true
      },
      {
        cohort_key: 'ANY|ANY|US',
        provider_slug: 'ANY',
        tier: 'ANY',
        region: 'US',
        percent_bps: 280,
        fixed_fee_minor_units: 30,
        fixed_fee_currency: 'USD',
        achievable_percent_bps: 200,
        achievable_fixed_fee_minor_units: 30,
        verified: false,
        source_url: null,
        source_quote: null,
        source_notes: 'Regional average derived from Stripe US (2.9%+30¢) and PayPal US (2.99%+49¢). NOT provider-verified. No US IFR — achievable is a market estimate.',
        achievable_breakdown_json: {
          interchange_bps: 110,
          scheme_fees_bps: 25,
          processor_margin_bps: 65,
          processor_margin_band_bps: 35,
          sources: [
            { label: 'Assumption — US blended, no IFR', url: null }
          ]
        },
        savings_band_pct: 0.35,
        verified_at: NOW,
        active: true
      },
      {
        cohort_key: 'ANY|ANY|RoW',
        provider_slug: 'ANY',
        tier: 'ANY',
        region: 'RoW',
        percent_bps: 320,
        fixed_fee_minor_units: 30,
        fixed_fee_currency: 'USD',
        achievable_percent_bps: 220,
        achievable_fixed_fee_minor_units: 30,
        verified: false,
        source_url: null,
        source_quote: null,
        source_notes: 'Rest-of-world default. No specific regional benchmark seeded. Widest band applies. Add region-specific rows (BR/AU/JP/etc.) when a merchant lands in one of those markets.',
        achievable_breakdown_json: {
          interchange_bps: 130,
          scheme_fees_bps: 30,
          processor_margin_bps: 60,
          processor_margin_band_bps: 40,
          sources: [
            { label: 'Assumption — RoW default, no source', url: null }
          ]
        },
        savings_band_pct: 0.35,
        verified_at: NOW,
        active: true
      }
    ];

    const allRows = [...verified, ...fallback];

    // Idempotent upsert by cohort_key.
    // Fetch existing rows first, then update or create as needed.
    const existing = await base44.asServiceRole.entities.PaymentsRateTable.list('-created_date', 500);
    const byCohortKey = new Map(existing.map(r => [r.cohort_key, r]));

    const results = { created: [], updated: [], errors: [] };
    for (const row of allRows) {
      try {
        const found = byCohortKey.get(row.cohort_key);
        if (found) {
          await base44.asServiceRole.entities.PaymentsRateTable.update(found.id, row);
          results.updated.push(row.cohort_key);
        } else {
          await base44.asServiceRole.entities.PaymentsRateTable.create(row);
          results.created.push(row.cohort_key);
        }
      } catch (err) {
        results.errors.push({ cohort_key: row.cohort_key, message: err.message });
      }
    }

    return Response.json({
      ok: true,
      summary: {
        total_rows: allRows.length,
        verified_count: verified.length,
        fallback_count: fallback.length,
        created: results.created.length,
        updated: results.updated.length,
        errors: results.errors.length
      },
      details: results
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});