// Admin-only, idempotent seeder for the PaymentsRateTable entity.
// Idempotency: upserts by cohort_key. Existing rows are UPDATED (never
// duplicated) so re-running after correcting a cited number is safe.
//
// Chunk 1b: seeds 7 verified rows (Stripe EU/UK/US, PayPal EU/UK/US,
// Shopify US Basic) + 4 regional fallback rows. Every verified row carries a
// source_url + source_quote for audit — if a rate changes, grep source_quote
// to find the stale row.
//
// Chunk 1.2.0 (Enmienda 1 fix): every row now also carries intl_uplift_bps
// and achievable_intl_uplift_bps, with intl_uplift_source_url +
// intl_uplift_source_quote when a PSP publishes a distinct cross-border rate,
// or intl_uplift_assumption_notes when the value is derived. NO intl uplift
// constants live in the engine — the seeder is the single source of truth.
//
// Rows without a published cross-border rate leave intl_uplift_bps null
// deliberately. The engine treats that as 0 and emits "intl uplift not
// modeled for this cohort" — this is honest silence rather than invention.
//
// Component-atomic format (Enmienda structural del Chunk 1a):
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
    // ACHIEVABLE INTL UPLIFT — shared derivation notes
    //
    // No PSP publishes a "negotiated cross-border rate" — the closest public
    // reference is Visa/Mastercard's cross-border interchange schedules, which
    // are NOT negotiable (schemes set them and processors pass them through).
    // A well-negotiated processor can compress its OWN cross-border margin,
    // but the scheme floor remains. We model achievable ≈ ~50% of the
    // published uplift as a conservative assumption:
    //   - Below 50% would imply negotiating away the scheme floor (impossible).
    //   - Above 50% (say 70-80%) would mean assuming little negotiation
    //     leverage, undercounting the achievable gap.
    // Every row that carries an achievable_intl_uplift_bps documents this
    // derivation in intl_uplift_assumption_notes. NEVER move the ~50% ratio
    // into code — it lives on the row.
    // -------------------------------------------------------------------

    // -------------------------------------------------------------------
    // VERIFIED ROWS — every number cited verbatim from the source URL
    // Sondeo: 2026-07-09 (all Stripe pricing pages verified this day)
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
        achievable_percent_bps: 86,
        achievable_fixed_fee_minor_units: 25,
        // Intl uplift: Stripe EU publishes "3.25% + €0.25 for international
        // cards" ⇒ +175 bps over 1.5% domestic (fixed fee unchanged).
        intl_uplift_bps: 175,
        // Achievable intl uplift: 90 bps ≈ 51% of 175. Conservative floor
        // documented below.
        achievable_intl_uplift_bps: 90,
        intl_uplift_source_url: 'https://stripe.com/en-es/pricing',
        intl_uplift_source_quote: '3.25% + €0.25 for international cards',
        intl_uplift_assumption_notes: 'Verified 2026-07-09 on stripe.com/en-es/pricing. Achievable uplift (90 bps ≈ 51% of 175) is an ASSUMPTION derived from: scheme cross-border interchange floor (Visa/MC cross-border consumer credit ≈ 100 bps for EU→EU-off-EEA, non-negotiable) + assumed 25% negotiated processor-margin compression. Above this floor is dominated by processor cross-border margin, which IS negotiable. NEVER move this ratio into code — every future re-calibration edits this field.',
        verified: true,
        source_url: 'https://stripe.com/es/pricing',
        source_quote: '1,5 % + 0,25 € para tarjetas estándar del Espacio Económico Europeo',
        source_notes: 'EEA consumer standard cards. Premium EEA (1,9% + 0,25€) NOT seeded — added when form asks card mix (Fase 6). Also verified verbatim on https://stripe.com/fr/pricing and https://stripe.com/en-es/pricing.',
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
        // Intl uplift: Stripe UK publishes "3.25% + 20p for international
        // cards" ⇒ +175 bps over 1.5% domestic. UK also publishes "2.5% + 20p
        // for EEA cards" (a nearer neighbor at +100 bps) — we seed the true
        // international uplift here; EEA-neighbor pricing would need its own
        // dimension (not seeded).
        intl_uplift_bps: 175,
        achievable_intl_uplift_bps: 90,
        intl_uplift_source_url: 'https://stripe.com/gb/pricing',
        intl_uplift_source_quote: '3.25% + 20p for international cards',
        intl_uplift_assumption_notes: 'Verified 2026-07-09 on stripe.com/gb/pricing. Achievable derivation same as stripe|ANY|EU (scheme floor non-negotiable, ~50% margin compression assumption). Stripe UK also publishes 2.5% + 20p for EEA cards (a +100 bps "near-intl" tier) — NOT seeded (would need distinct near-intl vs far-intl split in the input form).',
        verified: true,
        source_url: 'https://stripe.com/gb/pricing',
        source_quote: '1.5% + 20p for standard UK cards',
        source_notes: 'UK consumer standard cards. Premium UK (1.9% + 20p) NOT seeded — added when form asks card mix (Fase 6). UK IFR caps mirror EU IFR post-Brexit (0.2%/0.3%).',
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
        achievable_percent_bps: 180,
        achievable_fixed_fee_minor_units: 30,
        // Intl uplift: Stripe US publishes "+1.5% for international cards"
        // explicitly (as a delta, not a full rate) ⇒ +150 bps flat.
        intl_uplift_bps: 150,
        achievable_intl_uplift_bps: 75,
        intl_uplift_source_url: 'https://stripe.com/pricing',
        intl_uplift_source_quote: '+1.5% for international cards',
        intl_uplift_assumption_notes: 'Verified 2026-07-09 on stripe.com/pricing (US home). Stripe US quotes the intl uplift as a delta (+1.5%), not a full rate. Achievable 75 bps = 50% of 150 (scheme floor non-negotiable, ~50% margin compression assumption). US intl uplift is LOWER than EU/UK (150 vs 175) because US cross-border volumes are dominated by Visa/MC issued abroad rather than premium-loaded card mix; documented delta is smaller.',
        verified: true,
        source_url: 'https://stripe.com/pricing',
        source_quote: '2.9% + 30¢ per successful transaction for domestic cards',
        source_notes: 'US domestic consumer cards. Currency conversion (+1%) NOT seeded — modeled separately. No US IFR — achievable interchange is a blended market estimate, not a legal cap.',
        achievable_breakdown_json: {
          interchange_bps: 110,
          scheme_fees_bps: 25,
          processor_margin_bps: 45,
          processor_margin_band_bps: 25,
          sources: [
            { label: 'Assumption — US blended interchange, no IFR cap', url: null }
          ]
        },
        savings_band_pct: 0.25,
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
        achievable_percent_bps: 86,
        achievable_fixed_fee_minor_units: 25,
        // PayPal EU publishes an intl surcharge on its business-fees page but
        // in a table format we cannot cite verbatim without visiting each
        // country's fee table. Rather than invent a number in code, we leave
        // it null — the engine emits "intl uplift not modeled" and the intl
        // portion of GMV is understated (documented + honest).
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'PayPal EU publishes cross-border surcharges as country-pair tables on paypal.com/es/business/paypal-business-fees. Not seeded verbatim because a single number would misrepresent country-pair variance (EU→UK ≠ EU→US ≠ EU→BR). When a merchant has significant intl volume the engine falls to "intl uplift not modeled" and understates the intl portion — safer than fabricating a blended number. TODO Fase 6: parse the country-pair table into a separate PayPalCrossBorderRate entity.',
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
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'PayPal UK cross-border surcharges are country-pair tables. Same treatment as paypal|ANY|EU — not seeded. Engine emits "intl uplift not modeled" for intl volume.',
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
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'PayPal US cross-border surcharges are country-pair tables. Same treatment as paypal|ANY|EU — not seeded.',
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
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'Shopify Payments quotes premium/international cards at 3.5% + 30¢ on shopify.com/pricing but does not separately publish a domestic-vs-intl delta (bundles premium + intl). Not seeded verbatim — would need form to ask card mix (Fase 6). Engine emits "intl uplift not modeled" for intl volume.',
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
    //
    // Fallback intl uplifts: seeded as a regional AVERAGE of the intl
    // uplifts we DO have published data for. Stripe is currently the only
    // PSP publishing a distinct cross-border rate as a clean delta, so we
    // use its regional value as the fallback proxy. Documented as assumption
    // (verified=false), widest band applies.
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
        intl_uplift_bps: 175,
        achievable_intl_uplift_bps: 90,
        intl_uplift_source_url: 'https://stripe.com/en-es/pricing',
        intl_uplift_source_quote: '3.25% + €0.25 for international cards',
        intl_uplift_assumption_notes: 'Fallback EU intl uplift proxied from Stripe EU (+175 bps, verified 2026-07-09). Applied because Stripe is the only major PSP publishing a distinct cross-border delta in the EU market. Widest band (±35%) already flags this as an estimate. Achievable ≈ 51% of published (scheme floor non-negotiable, ~50% margin compression assumption).',
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
        intl_uplift_bps: 175,
        achievable_intl_uplift_bps: 90,
        intl_uplift_source_url: 'https://stripe.com/gb/pricing',
        intl_uplift_source_quote: '3.25% + 20p for international cards',
        intl_uplift_assumption_notes: 'Fallback UK intl uplift proxied from Stripe UK (+175 bps, verified 2026-07-09). Same reasoning as ANY|ANY|EU. Achievable ≈ 51% of published.',
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
        intl_uplift_bps: 150,
        achievable_intl_uplift_bps: 75,
        intl_uplift_source_url: 'https://stripe.com/pricing',
        intl_uplift_source_quote: '+1.5% for international cards',
        intl_uplift_assumption_notes: 'Fallback US intl uplift proxied from Stripe US (+150 bps, verified 2026-07-09). Stripe US quotes the intl uplift as a delta (+1.5%), lower than EU/UK because US cross-border volumes have a different card-mix composition. Achievable ≈ 50% of published (~50% margin compression assumption).',
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
        // RoW: no reliable single reference. Blend of US (150) and EU (175)
        // published rates as a conservative midpoint. Widest band absorbs
        // the extra uncertainty.
        intl_uplift_bps: 165,
        achievable_intl_uplift_bps: 85,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'RoW default. No published cross-border rate applies globally. Seeded as an ASSUMPTION blending Stripe US (+150) and Stripe EU (+175) published uplifts to a mid-point of +165 bps. Achievable ≈ 52% of published (scheme floor non-negotiable). Widest band (±35%) already absorbs the extra uncertainty. Re-calibrate per-region (BR/AU/JP/etc.) when a merchant lands in one of those markets and a public source is available.',
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

    // -------------------------------------------------------------------
    // VERIFIED IN-STORE ROWS — M4-TPV Fase 2A (2026-07-12)
    //
    // Card-present (in-store TPV) pricing is a DIFFERENT product from
    // card-not-present (online) even at the same provider. IFR caps still
    // apply to the EU % component, but the fixed-fee floor and terminal
    // rental introduce a shape the online engine did not have.
    //
    // Modern TPV providers (SumUp / Zettle / Smile&Pay / Stripe Terminal)
    // sell hardware one-off with NO monthly rental → terminal_rental = 0.
    // Traditional bank acquirers charge €15-40/mo rental → captured on the
    // fallback in-store rows below (bank TPVs land in the fallback bucket).
    //
    // Cross-border intl uplift is NULL on every in-store row — card-present
    // cross-border volume is negligible for the ICP (physical shoppers use
    // domestic cards). Engine emits "intl uplift not modeled" when intl_pct
    // > 0 on an in-store cohort — honest, matches reality.
    //
    // Verified sondeo 2026-07-12 (all pages visited verbatim same day).
    // -------------------------------------------------------------------
    const verifiedInStore = [
      // --- SumUp EU (contactless + chip standard) ---
      {
        cohort_key: 'sumup|ANY|EU|in_store',
        provider_slug: 'sumup',
        tier: 'ANY',
        region: 'EU',
        channel: 'in_store',
        percent_bps: 175,           // 1.75%
        fixed_fee_minor_units: 0,   // no per-tx fixed fee
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 0,
        // M4-TPV Fase 2A-redo corrección (2026-07-12) — achievable in-store
        // = mejor pricing público CONTRATABLE de la región, no composición
        // teórica interchange+scheme+margin. Regla auditable: el merchant
        // debe poder firmar el achievable mañana con un proveedor real.
        // EU floor = Stripe Terminal 1.4% + €0.10 (contratable en stripe.com
        // hoy). A tickets bajos (<€25) el fixed drag empuja el achievable
        // POR ENCIMA del current SumUp — computeMonthlySavings clampa a 0
        // cuando gap <= 0 (comportamiento correcto: cero savings honestas
        // si SumUp ya es el floor real para ese ticket).
        achievable_percent_bps: 140,   // Stripe Terminal EEA
        achievable_fixed_fee_minor_units: 10,  // €0.10 Stripe Terminal
        achievable_terminal_rental_monthly_minor: 0,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'Card-present intl uplift not modeled — physical shoppers use domestic cards, intl volume in-store is negligible for the ICP. Engine emits "intl uplift not modeled" if intl_pct > 0 on this cohort.',
        verified: true,
        source_url: 'https://sumup.com/en-gb/pricing/',
        source_quote: 'Card and contactless payments: 1.75%',
        source_notes: 'SumUp UK page cited verbatim 2026-07-12; SumUp harmonizes EU rate at 1.75% per company policy (same rate applies FR/DE/ES/IT). Hardware one-off (Solo €89, Air €59), no monthly rental, no per-transaction fixed fee. Ticket-dependent floor: SumUp is cheapest below ~€25 ticket (fixed-fee drag on Stripe Terminal dominates); Stripe Terminal is cheapest above ~€25 ticket (1.4% % component wins). At €25 the two are ~equal (1.75% vs 1.4%+€0.10/€25=1.8%). Engine sets achievable = Stripe Terminal composition; savings clamp to 0 when SumUp is already the floor for the merchant ticket.',
        achievable_breakdown_json: {
          anchor_provider: 'stripe_terminal',
          anchor_region: 'EU',
          anchor_percent_bps: 140,
          anchor_fixed_fee_minor_units: 10,
          anchor_source_url: 'https://stripe.com/terminal',
          anchor_source_quote: '1.4% + €0.10 for standard EEA cards, in-person'
        },
        savings_band_pct: 0.25,
        verified_at: NOW,
        active: true
      },
      // --- Stripe Terminal EEA (card-present standard) ---
      {
        cohort_key: 'stripe_terminal|ANY|EU|in_store',
        provider_slug: 'stripe_terminal',
        tier: 'ANY',
        region: 'EU',
        channel: 'in_store',
        percent_bps: 140,           // 1.4%
        fixed_fee_minor_units: 10,  // €0.10 per transaction
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 0,  // hardware one-off (BBPOS €59, Verifone €249)
        // Stripe Terminal EU is ALREADY the floor for the region — achievable
        // = same rate (no better publicly contractable rate exists for a
        // standard EEA card-present cohort). Savings on this cohort come only
        // from removing terminal rental if the merchant is on a bank TPV
        // migrating TO Stripe Terminal (handled by the fallback bank row).
        achievable_percent_bps: 140,
        achievable_fixed_fee_minor_units: 10,
        achievable_terminal_rental_monthly_minor: 0,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'Card-present intl uplift not modeled (same reasoning as sumup|ANY|EU|in_store).',
        verified: true,
        source_url: 'https://stripe.com/terminal',
        source_quote: '1.4% + €0.10 for standard EEA cards, in-person',
        source_notes: 'Stripe Terminal EEA card-present rate cited verbatim 2026-07-12 from stripe.com/terminal. Ticket-dependent floor position: SumUp (1.75% flat, no fixed) is cheaper for tickets <€25 where the €0.10 fixed drag pushes Stripe Terminal effective rate above 1.75% (0.10/25×10000 = 40bps drag → 180bps effective). Stripe Terminal wins for tickets >€25 (drag falls below 40bps). At exactly €25 the two are effectively tied. Merchants ALREADY on Stripe Terminal have no achievable gap on the % side — engine returns 0 savings which is honest.',
        achievable_breakdown_json: {
          anchor_provider: 'stripe_terminal',
          anchor_region: 'EU',
          anchor_percent_bps: 140,
          anchor_fixed_fee_minor_units: 10,
          anchor_source_url: 'https://stripe.com/terminal',
          anchor_source_quote: '1.4% + €0.10 for standard EEA cards, in-person'
        },
        savings_band_pct: 0.25,
        verified_at: NOW,
        active: true
      },
      // --- Smile & Pay FR (French mobile TPV) ---
      {
        cohort_key: 'smile_and_pay|ANY|EU|in_store',
        provider_slug: 'smile_and_pay',
        tier: 'ANY',
        region: 'EU',
        channel: 'in_store',
        percent_bps: 155,           // 1.55%
        fixed_fee_minor_units: 0,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 0,
        // Smile&Pay 1.55% is already close to the EU floor for a no-fixed-fee
        // TPV. Achievable = Stripe Terminal (140 + €0.10) — cheaper on % but
        // adds fixed drag. Merchant benefits at higher tickets; at lower
        // tickets Smile&Pay is already the floor (gap clamps to 0).
        achievable_percent_bps: 140,
        achievable_fixed_fee_minor_units: 10,
        achievable_terminal_rental_monthly_minor: 0,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'Card-present intl uplift not modeled (same reasoning as sumup|ANY|EU|in_store). Smile&Pay is FR-first — RoW intl not applicable.',
        verified: true,
        source_url: 'https://smileandpay.com/tarifs',
        source_quote: '1,55 % par transaction — sans abonnement, sans engagement',
        source_notes: 'Smile & Pay FR page cited verbatim 2026-07-12. FR-focused, expanding EU. Hardware one-off (Smile Basic €59). Zero fixed fee, zero rental. Ticket crossover with Stripe Terminal: Smile&Pay wins below ~€67 ticket (0.10/67×10000 = 15bps drag → 155bps effective for Stripe Terminal, tied with Smile); Stripe Terminal wins above €67. Achievable anchor = Stripe Terminal to give merchants at higher tickets a real recovery path.',
        achievable_breakdown_json: {
          anchor_provider: 'stripe_terminal',
          anchor_region: 'EU',
          anchor_percent_bps: 140,
          anchor_fixed_fee_minor_units: 10,
          anchor_source_url: 'https://stripe.com/terminal',
          anchor_source_quote: '1.4% + €0.10 for standard EEA cards, in-person'
        },
        savings_band_pct: 0.25,
        verified_at: NOW,
        active: true
      },
      // --- Zettle by PayPal EU (FR verification pending — see KNOWN_DEBT) ---
      {
        cohort_key: 'zettle|ANY|EU|in_store',
        provider_slug: 'zettle',
        tier: 'ANY',
        region: 'EU',
        channel: 'in_store',
        percent_bps: 175,           // 1.75% (GB rate; FR unverified, see notes)
        fixed_fee_minor_units: 0,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 0,
        // Same anchor as sumup|EU|in_store (identical positioning at 1.75%
        // with no fixed fee).
        achievable_percent_bps: 140,
        achievable_fixed_fee_minor_units: 10,
        achievable_terminal_rental_monthly_minor: 0,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'Card-present intl uplift not modeled (same reasoning as sumup|ANY|EU|in_store).',
        // verified=false + widest band because only the GB page was cited
        // verbatim on 2026-07-12. FR page not verified. See KNOWN_DEBT entry
        // "M4-TPV — Zettle FR: verified=false pending".
        verified: false,
        source_url: 'https://zettle.com/gb/pricing',
        source_quote: 'Card and contactless payments: 1.75%',
        source_notes: 'Zettle GB page cited verbatim 2026-07-12. Zettle harmonizes rate across EU per PayPal policy (same rate FR/DE/ES) but FR page NOT re-verified in this sondeo — verified=false + savings_band 0.30 until FR page is re-cited. Fix documented in KNOWN_DEBT.',
        achievable_breakdown_json: {
          anchor_provider: 'stripe_terminal',
          anchor_region: 'EU',
          anchor_percent_bps: 140,
          anchor_fixed_fee_minor_units: 10,
          anchor_source_url: 'https://stripe.com/terminal',
          anchor_source_quote: '1.4% + €0.10 for standard EEA cards, in-person'
        },
        savings_band_pct: 0.30,
        verified_at: NOW,
        active: true
      }
    ];

    // -------------------------------------------------------------------
    // FALLBACK IN-STORE ROWS — regional bank TPV averages, NOT verified.
    // These catch traditional bank acquirers (BNP, CA, SG, BPCE, CM-CIC,
    // LBP, LCL, HSBC-FR, ...) that publish tariffs only through their
    // sales teams. Rental of €15-40/mo captured verbatim as
    // terminal_rental_monthly_minor 2500 (=€25) — engine amortizes.
    // -------------------------------------------------------------------
    const fallbackInStore = [
      {
        cohort_key: 'ANY|ANY|EU|in_store',
        provider_slug: 'ANY',
        tier: 'ANY',
        region: 'EU',
        channel: 'in_store',
        percent_bps: 220,           // 2.2% — bank TPV blended average
        fixed_fee_minor_units: 0,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 2500,  // €25/mo — median bank rental
        // Achievable = Stripe Terminal EEA (140 + €0.10, no rental). The
        // recovery narrative for bank-TPV merchants: migrate to a modern
        // publicly-contractable rate + drop the €25/mo rental drag.
        achievable_percent_bps: 140,
        achievable_fixed_fee_minor_units: 10,
        achievable_terminal_rental_monthly_minor: 0,  // modern TPV = no rental
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'Card-present intl uplift not modeled.',
        verified: false,
        source_url: null,
        source_quote: null,
        source_notes: 'Regional average for traditional bank acquirers (BNP, CA, SG, BPCE, CM-CIC, LBP, LCL, HSBC-FR). Rental €25/mo is the observed median of the FR bank market (2026 sondeo). Ticket-floor rules for achievable side: for tickets <€25 the achievable optimum is SumUp/Smile (1.55-1.75%, zero fixed) because Stripe Terminal fixed-fee drag dominates; for tickets ≥€25 Stripe Terminal (1.4%+€0.10) is the achievable floor. We anchor achievable to Stripe Terminal for both consistency and the strongest recovery narrative — merchants on low tickets simply see a smaller gap, clamped to zero when they already sit at or below the contractable floor.',
        achievable_breakdown_json: {
          anchor_provider: 'stripe_terminal',
          anchor_region: 'EU',
          anchor_percent_bps: 140,
          anchor_fixed_fee_minor_units: 10,
          anchor_source_url: 'https://stripe.com/terminal',
          anchor_source_quote: '1.4% + €0.10 for standard EEA cards, in-person',
          alt_provider_low_ticket: { provider: 'sumup', percent_bps: 175, ticket_floor_eur: 25 }
        },
        savings_band_pct: 0.35,
        verified_at: NOW,
        active: true
      },
      {
        cohort_key: 'ANY|ANY|UK|in_store',
        provider_slug: 'ANY',
        tier: 'ANY',
        region: 'UK',
        channel: 'in_store',
        percent_bps: 210,
        fixed_fee_minor_units: 0,
        fixed_fee_currency: 'GBP',
        terminal_rental_monthly_minor: 2500,  // £25/mo
        // UK achievable anchor = SumUp UK 1.75% (page verbatim already
        // cited). SumUp has no fixed fee → simplest audit trail for UK
        // merchants. Stripe Terminal UK also available but SumUp is the
        // reference the marketing/product already talks about.
        achievable_percent_bps: 175,
        achievable_fixed_fee_minor_units: 0,
        achievable_terminal_rental_monthly_minor: 0,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'Card-present intl uplift not modeled.',
        verified: false,
        source_url: null,
        source_quote: null,
        source_notes: 'UK bank TPV blended average (Barclaycard, Lloyds, HSBC UK). UK IFR floor applies (0.2/0.3 caps). Achievable anchored to SumUp UK 1.75% (publicly contractable, no fixed fee, no rental — cleanest audit trail).',
        achievable_breakdown_json: {
          anchor_provider: 'sumup',
          anchor_region: 'UK',
          anchor_percent_bps: 175,
          anchor_fixed_fee_minor_units: 0,
          anchor_source_url: 'https://sumup.com/en-gb/pricing/',
          anchor_source_quote: 'Card and contactless payments: 1.75%'
        },
        savings_band_pct: 0.35,
        verified_at: NOW,
        active: true
      },
      {
        cohort_key: 'ANY|ANY|US|in_store',
        provider_slug: 'ANY',
        tier: 'ANY',
        region: 'US',
        channel: 'in_store',
        percent_bps: 260,
        fixed_fee_minor_units: 10,   // $0.10 typical CP fixed
        fixed_fee_currency: 'USD',
        terminal_rental_monthly_minor: 0,   // US market is mostly no-rental
        // US achievable anchor = Square 2.6% + $0.10 (published card-present
        // rate at squareup.com/us/en/pricing, industry reference floor for
        // US in-store SMB). No IFR in the US — the achievable is the market
        // reference floor, not a regulatory floor.
        achievable_percent_bps: 260,
        achievable_fixed_fee_minor_units: 10,
        achievable_terminal_rental_monthly_minor: 0,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'Card-present intl uplift not modeled.',
        verified: false,
        source_url: null,
        source_quote: null,
        source_notes: 'US in-store blended average. Achievable anchored to Square 2.6% + $0.10 (industry reference for US card-present SMB). Because we set fallback current at 2.60% too, savings on this cohort come primarily from rental removal (already 0 in most US bank setups) — for US bank customers still on legacy contracts with rentals, the fallback rate itself may be higher; those cases are captured by narrowing per real merchant data.',
        achievable_breakdown_json: {
          anchor_provider: 'square',
          anchor_region: 'US',
          anchor_percent_bps: 260,
          anchor_fixed_fee_minor_units: 10,
          anchor_source_url: 'https://squareup.com/us/en/pricing',
          anchor_source_quote: '2.6% + 10¢ per tap, dip, or swipe'
        },
        savings_band_pct: 0.35,
        verified_at: NOW,
        active: true
      },
      {
        cohort_key: 'ANY|ANY|RoW|in_store',
        provider_slug: 'ANY',
        tier: 'ANY',
        region: 'RoW',
        channel: 'in_store',
        percent_bps: 250,
        fixed_fee_minor_units: 10,
        fixed_fee_currency: 'USD',
        terminal_rental_monthly_minor: 2000,  // $20/mo — RoW bank average
        // RoW achievable = Square-tier anchor. No public global floor exists
        // — Square 2.6%+$0.10 is the most cited SMB card-present reference,
        // used as a defensible upper bound. Savings on RoW come mostly from
        // rental removal, not from % reduction.
        achievable_percent_bps: 260,
        achievable_fixed_fee_minor_units: 10,
        achievable_terminal_rental_monthly_minor: 0,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: 'Card-present intl uplift not modeled.',
        verified: false,
        source_url: null,
        source_quote: null,
        source_notes: 'RoW in-store default. No published global reference; achievable anchored to Square 2.6%+$0.10 as an SMB reference floor. Widest band. Savings for this cohort come primarily from rental removal ($20/mo drag), not from % reduction — this is honest for a merchant on a legacy RoW bank contract.',
        achievable_breakdown_json: {
          anchor_provider: 'square',
          anchor_region: 'US',
          anchor_percent_bps: 260,
          anchor_fixed_fee_minor_units: 10,
          anchor_source_url: 'https://squareup.com/us/en/pricing',
          anchor_source_quote: '2.6% + 10¢ per tap, dip, or swipe'
        },
        savings_band_pct: 0.35,
        verified_at: NOW,
        active: true
      }
    ];

    // -------------------------------------------------------------------
    // SPAIN (SEED-ES / SEED-ES-2 / COHERENCE-1) — country-pinned ES rows.
    //
    // COHERENCE-1 Tarea 3 (2026-07-24): these rows were originally seeded
    // ad-hoc (SEED-ES + SEED-ES-2 chunks) directly into the DB; this block
    // makes the seeder the CANONICAL reproducible source. Values are copied
    // VERBATIM from the live table on 2026-07-24 (9 rows — the count in
    // production; see Decision_Log_COHERENCE1.md for the seed-vs-live diff).
    // verified_at is HARDCODED (not NOW) so re-running the seed produces
    // zero changes on these rows. Country resolution is FIELD-based (M5):
    // the 'EU-ES' segment in cohort_key is a readable identifier only.
    // -------------------------------------------------------------------
    const seedES = [
      // --- SumUp Pagos Plus ES (PLUS plan anchor — achievable pool only) ---
      {
        cohort_key: 'sumup|PLUS|EU-ES|in_store',
        provider_slug: 'sumup',
        tier: 'PLUS',
        region: 'EU',
        country: 'ES',
        channel: 'in_store',
        percent_bps: 75,
        fixed_fee_minor_units: 0,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 1900,
        achievable_percent_bps: 75,
        achievable_fixed_fee_minor_units: 0,
        achievable_terminal_rental_monthly_minor: 1900,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: null,
        verified: true,
        source_url: 'https://www.sumup.com/es-es/',
        source_quote: '0,75% por transacción con el plan Pagos Plus (19 €/mes), sin permanencia.',
        source_notes: 'SEED-ES-2 2026-07-24. SumUp Pagos Plus ES: 0,75% + 19€/mes (modelado como rental), sin permanencia. Pricing público verificado. Fuente: rankia.com / sumup.com/es 2026-07. DECISIÓN DE MODELADO: la suscripción mensual de 19€ se modela como terminal_rental_monthly_minor=1900 porque económicamente es idéntica a un alquiler (coste fijo mensual amortizado contra el GMV) y el motor ya amortiza ese campo en computeEffectiveBps. TIER=PLUS a propósito: lo excluye de la resolución de tarifa ACTUAL de selectRow (countryRow exige tier ANY; las keys candidatas solo construyen |ANY|) mientras el pool multi-anchor — sin filtro de tier — sí lo recoge como achievable. Exclusión self intacta (slug sumup): un merchant cuyo proveedor actual es sumup no recibe este anchor. | COHERENCE-1 2026-07-24: el 0,75% aplica a operaciones estándar ELEGIBLES según las condiciones publicadas del plan Pagos Plus; las tarjetas premium y de empresa pueden costar más. Fuente: sumup.com/es-es/ (condiciones del plan Pagos Plus).',
        achievable_breakdown_json: { anchor_provider: 'sumup' },
        savings_band_pct: 0.2,
        verified_at: '2026-07-24T13:02:12.444Z',
        active: true
      },
      // --- SumUp ES in-store (standard rate, verified anchor) ---
      {
        cohort_key: 'sumup|ANY|EU-ES|in_store',
        provider_slug: 'sumup',
        tier: 'ANY',
        region: 'EU',
        country: 'ES',
        channel: 'in_store',
        percent_bps: 149,
        fixed_fee_minor_units: 0,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 0,
        achievable_percent_bps: 75,
        achievable_fixed_fee_minor_units: 0,
        achievable_terminal_rental_monthly_minor: 1900,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: null,
        verified: true,
        source_url: 'https://www.rankia.com/',
        source_quote: '1,49% por transacción (tarifa estándar SumUp España, sin cuota mensual).',
        source_notes: 'DRAFT SEED-ES 2026-07-24. SumUp ES presencial 1,49% (vs 1,75% FR). Achievable 0,75% = plan Pagos Plus, cuya suscripción de 19€/mes se modela como achievable_terminal_rental (el motor la amortiza sobre GMV). Fuente: rankia jul 2026. Estimate — connect your PSP. | SEED-ES-2 2026-07-24: promovida a anchor verified=true (pricing público verificado y contratable, mismo estándar que los anchors FR; 1,49% confirmado multi-fuente) + achievable_breakdown_json.anchor_provider=sumup para entrar al pool multi-anchor.',
        achievable_breakdown_json: { anchor_provider: 'sumup' },
        savings_band_pct: 0.25,
        verified_at: '2026-07-24T13:02:12.444Z',
        active: true
      },
      // --- Zettle ES in-store (tiered, draft) ---
      {
        cohort_key: 'zettle|ANY|EU-ES|in_store',
        provider_slug: 'zettle',
        tier: 'ANY',
        region: 'EU',
        country: 'ES',
        channel: 'in_store',
        percent_bps: 110,
        fixed_fee_minor_units: 0,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 0,
        achievable_percent_bps: null,
        achievable_fixed_fee_minor_units: null,
        achievable_terminal_rental_monthly_minor: null,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: null,
        verified: false,
        source_url: 'https://www.zettle.com/es',
        source_quote: null,
        source_notes: 'DRAFT SEED-ES 2026-07-24. Escalonado 1,99%→0,99% por volumen mensual con rebate a fin de mes; 110 bps = punto estimado al GMV del ICP. Banda extra-ancha 0.40 por el escalonado. Fuente: multi-fuente 2023-2025. Tramos dinámicos fuera de alcance (chunk aparte). Estimate — connect your PSP.',
        achievable_breakdown_json: null,
        savings_band_pct: 0.4,
        verified_at: null,
        active: true
      },
      // --- Square ES in-store (draft) ---
      {
        cohort_key: 'square|ANY|EU-ES|in_store',
        provider_slug: 'square',
        tier: 'ANY',
        region: 'EU',
        country: 'ES',
        channel: 'in_store',
        percent_bps: 125,
        fixed_fee_minor_units: 5,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 0,
        achievable_percent_bps: null,
        achievable_fixed_fee_minor_units: null,
        achievable_terminal_rental_monthly_minor: null,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: null,
        verified: false,
        source_url: 'https://www.roams.es/',
        source_quote: null,
        source_notes: 'DRAFT SEED-ES 2026-07-24. El pay-per-use presencial más barato de ES (1,25% + 0,05€). Fuente: roams.es jun 2026. Estimate — connect your PSP.',
        achievable_breakdown_json: null,
        savings_band_pct: 0.25,
        verified_at: null,
        active: true
      },
      // --- myPOS ES in-store (draft) ---
      {
        cohort_key: 'mypos|ANY|EU-ES|in_store',
        provider_slug: 'mypos',
        tier: 'ANY',
        region: 'EU',
        country: 'ES',
        channel: 'in_store',
        percent_bps: 145,
        fixed_fee_minor_units: 5,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 0,
        achievable_percent_bps: null,
        achievable_fixed_fee_minor_units: null,
        achievable_terminal_rental_monthly_minor: null,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: null,
        verified: false,
        source_url: 'https://sincomisiones.org/',
        source_quote: null,
        source_notes: 'DRAFT SEED-ES 2026-07-24. myPOS ES 1,45% + 0,05€. Fuente: sincomisiones jun 2026. Estimate — connect your PSP.',
        achievable_breakdown_json: null,
        savings_band_pct: 0.25,
        verified_at: null,
        active: true
      },
      // --- Bank TPV ES (Redsys acquirers, draft fallback for bank_tpv_es slug) ---
      {
        cohort_key: 'bank_tpv_es|ANY|EU-ES|in_store',
        provider_slug: 'bank_tpv_es',
        tier: 'ANY',
        region: 'EU',
        country: 'ES',
        channel: 'in_store',
        percent_bps: 100,
        fixed_fee_minor_units: 0,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: 2500,
        achievable_percent_bps: 75,
        achievable_fixed_fee_minor_units: 0,
        achievable_terminal_rental_monthly_minor: 0,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: null,
        verified: false,
        source_url: 'https://comisionestpv.es/',
        source_quote: null,
        source_notes: 'DRAFT SEED-ES 2026-07-24. TPV bancario sobre Redsys (CaixaBank/Santander/BBVA/Sabadell): negociado 0,3–1,5%, típico PYME 0,4–1,2% + alquiler 10–35€/mes + permanencia. 80 bps = punto medio; el coste real incluye cuotas fijas no capturadas en bps — el alquiler típico se modela aparte como terminal_rental (25€/mes, punto medio del rango, mismo patrón que la fila fallback FR). Banda máxima 0.50: tarifa negociada, dispersión real enorme. Fuentes: comisionestpv.es, batemat.es 2026. | SEED-ES-2 2026-07-24: punto 80 → 100 bps — el research sitúa al comercio del ICP más cerca del 0,7–1,2% negociado que del punto medio optimista; la banda 0.50 sigue cubriendo el rango completo.',
        achievable_breakdown_json: null,
        savings_band_pct: 0.5,
        verified_at: null,
        active: true
      },
      // --- PAYCOMET ES online (draft) ---
      {
        cohort_key: 'paycomet|ANY|EU-ES',
        provider_slug: 'paycomet',
        tier: 'ANY',
        region: 'EU',
        country: 'ES',
        channel: 'online',
        percent_bps: 55,
        fixed_fee_minor_units: 9,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: null,
        achievable_percent_bps: 86,
        achievable_fixed_fee_minor_units: 9,
        achievable_terminal_rental_monthly_minor: null,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: null,
        verified: false,
        source_url: 'https://www.paycomet.com/',
        source_quote: null,
        source_notes: 'DRAFT SEED-ES 2026-07-24. Régimen >2.000€/mes: ~0,50% nacional / 0,60% UE + 0,09€. Tarifa plana 19€/mes solo bajo 2k€ (irrelevante para el ICP). Fuente: paycomet.com 2026-07-24. Estimate — connect your PSP.',
        achievable_breakdown_json: {
          interchange_bps: 26,
          scheme_fees_bps: 20,
          processor_margin_bps: 40,
          processor_margin_band_bps: 20,
          sources: [
            { label: 'EU interchange cap (Reg. 2015/751) + scheme fee estimates', url: 'https://eur-lex.europa.eu/eli/reg/2015/751/oj' }
          ]
        },
        savings_band_pct: 0.3,
        verified_at: null,
        active: true
      },
      // --- Square ES online (draft) ---
      {
        cohort_key: 'square|ANY|EU-ES',
        provider_slug: 'square',
        tier: 'ANY',
        region: 'EU',
        country: 'ES',
        channel: 'online',
        percent_bps: 140,
        fixed_fee_minor_units: 25,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: null,
        achievable_percent_bps: 86,
        achievable_fixed_fee_minor_units: 25,
        achievable_terminal_rental_monthly_minor: null,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: null,
        verified: false,
        source_url: 'https://www.roams.es/',
        source_quote: null,
        source_notes: 'DRAFT SEED-ES 2026-07-24. 1,40% + 0,25€ tarjetas UE; 2,90% no-EEE (no modelado como intl_uplift — sin cita directa). Fuente: roams.es jun 2026. Banda 0.35 (draft, no especificada en el research). Estimate — connect your PSP.',
        achievable_breakdown_json: {
          interchange_bps: 26,
          scheme_fees_bps: 20,
          processor_margin_bps: 40,
          processor_margin_band_bps: 20,
          sources: [
            { label: 'EU interchange cap (Reg. 2015/751) + scheme fee estimates', url: 'https://eur-lex.europa.eu/eli/reg/2015/751/oj' }
          ]
        },
        savings_band_pct: 0.35,
        verified_at: null,
        active: true
      },
      // --- MONEI ES online (draft) ---
      {
        cohort_key: 'monei|ANY|EU-ES',
        provider_slug: 'monei',
        tier: 'ANY',
        region: 'EU',
        country: 'ES',
        channel: 'online',
        percent_bps: 65,
        fixed_fee_minor_units: 24,
        fixed_fee_currency: 'EUR',
        terminal_rental_monthly_minor: null,
        achievable_percent_bps: 86,
        achievable_fixed_fee_minor_units: 24,
        achievable_terminal_rental_monthly_minor: null,
        intl_uplift_bps: null,
        achievable_intl_uplift_bps: null,
        intl_uplift_source_url: null,
        intl_uplift_source_quote: null,
        intl_uplift_assumption_notes: null,
        verified: false,
        source_url: 'https://monei.com/pricing/',
        source_quote: null,
        source_notes: 'DRAFT SEED-ES 2026-07-24. MONEI X: interchange++ (markup 0,1%) + platform fee escalado desde 0,15% + 0,24€ + 0,10€/día. Coste efectivo estimado mix ES (65 bps + 0,24€). Fuente: monei.com/pricing 2026-07-24. Achievable = composición estándar EU (patrón de las filas draft FR). Estimate — connect your PSP.',
        achievable_breakdown_json: {
          interchange_bps: 26,
          scheme_fees_bps: 20,
          processor_margin_bps: 40,
          processor_margin_band_bps: 20,
          sources: [
            { label: 'EU interchange cap (Reg. 2015/751) + scheme fee estimates', url: 'https://eur-lex.europa.eu/eli/reg/2015/751/oj' }
          ]
        },
        savings_band_pct: 0.35,
        verified_at: null,
        active: true
      }
    ];

    const allRows = [...verified, ...fallback, ...verifiedInStore, ...fallbackInStore, ...seedES];

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
        verified_in_store_count: verifiedInStore.length,
        fallback_in_store_count: fallbackInStore.length,
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