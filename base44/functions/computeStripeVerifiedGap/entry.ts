// computeStripeVerifiedGap — M3-Chunk 4. THE bridge that materializes a
// VERIFIED payments-gap row from real Stripe data.
//
// Payload:   { brand_id: string, integration_id?: string }
// Auth:      base44.auth.me() required → 401 if anonymous.
// Ownership: _tenantGuard (Chunk 2) resolves (user, brand_id) → owner_email
//            or 404. Stranger callers CAN'T tell existence from ownership.
// Returns:   { ok: true, verified_id, engine_result, measured, window,
//              sample_metrics, source_charges_hash, reused: bool }
//            or { ok: false, error, ... } on validation / upstream failure.
//
// ─── Why this file inlines the engine (third SYNC copy) ─────────────────────
// The Chunk 3 close sealed the platform-level rule (Decision_Log 2026-07-09):
//   "In Base44, shared logic between backend functions = inline copy between
//    SYNC-START/SYNC-END markers + pair in sync-check. NO inter-function
//    HTTP calls."
// Rationale: (a) no cross-function service token exists, so any callee-side
// auth gate rejects an inter-function caller; (b) even without auth, HTTP
// hops on pure math add latency + failure surface with no isolation benefit.
// The former HTTP endpoint calculatePaymentsGap was DELETED for this reason.
// This is the SECOND consumer of the engine (after submitPaymentsAnalysis),
// so this is the THIRD verbatim copy of the SYNC block. The sync-check pair
// extends via `extraDenos: [...]` to cover all three copies transitively.
//
// ─── Why this file inlines the Stripe aggregation (not fetching via
//     stripeDataSync) ──────────────────────────────────────────────────────
// Same platform rule: stripeDataSync's HTTP handler starts with auth guards
// that a service-role caller can't pass without a token, and its response
// shape doesn't expose the raw charge IDs we need for source_charges_hash
// idempotency (contract §6). We reuse stripeDataSync's CANONICAL FORMULA
// verbatim (see Decision_Log 2026-07-10 M3-Chunk 1b) but talk to Stripe
// directly with the same window + auth logic. When stripeDataSync itself
// migrates to inline computation of the same signature in a future chunk,
// both paths can share a helper — this chunk does not create that helper.
//
// ─── Reuse-or-sync policy (contract §2 with §6 refinement) ─────────────────
// The contract asks: if last_sync_at < 24h, reuse the sync data rather than
// re-fetch. On the Integration entity, last_sync_at is coarse — it tells us
// SOMETHING synced but not what. We use a stronger idempotency signal
// instead: source_charges_hash. If an existing PaymentsAnalysisVerified row
// carries the same (brand_id, integration_id, source_charges_hash), the set
// of charges is IDENTICAL to what a fresh fetch would produce → we return
// the existing row untouched (reused: true). The 24h staleness check now
// becomes a preflight: if last_sync_at is < 24h AND the previous verified
// row on this integration has a source_charges_hash from a fetch within the
// last hour, we skip the Stripe roundtrip entirely and reuse. Otherwise we
// do the fetch, compute the hash, and check for a match after. This is a
// stronger guarantee than "just trust last_sync_at" — see Decision_Log 4b.
//
// ─── No token leaks (contract §7) ──────────────────────────────────────────
// Access tokens live in Integration.access_token (encrypted blob) or in env
// (STRIPE_TEST_SECRET_KEY for the test-mode bridge). This function NEVER
// returns them in any response field, never logs them, and NEVER echoes any
// value from Stripe's account object that could contain a key.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── SYNC block — verbatim copy of src/lib/paymentsGap.js ───────────────────
// See file header for why this is a copy (third consumer of the engine).
// The sync-check `paymentsGap` pair extends via `extraDenos` to compare all
// three copies transitively. When you edit engine logic, edit
// src/lib/paymentsGap.js FIRST and copy the SYNC block verbatim into BOTH
// submitPaymentsAnalysis AND this file. The sync-check will fail loud if
// any of the three drifts.

// SYNC-START: paymentsGap

// payments-gap-1.3.0 — see src/lib/paymentsGap.js version-history header.
const ENGINE_VERSION = "payments-gap-1.3.0";

const MINOR_PER_MAJOR = 100;

const BPS_PER_UNIT = 10000;

const REQUIRED_FALLBACK_KEYS = [
  "ANY|ANY|EU",
  "ANY|ANY|UK",
  "ANY|ANY|US",
  "ANY|ANY|RoW",
];

const DEFAULT_INTL_PCT = 0;

const KNOWN_REGIONS = new Set(["EU", "UK", "US", "RoW"]);

const KNOWN_PROVIDERS = new Set(["stripe", "paypal", "shopify_payments"]);

function normalizeInput(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "input_missing" };
  }
  const monthly_gmv_eur = Number(raw.monthly_gmv_eur);
  if (!isFinite(monthly_gmv_eur) || monthly_gmv_eur <= 0) {
    return { ok: false, reason: "monthly_gmv_eur_invalid" };
  }
  const avg_ticket_eur = Number(raw.avg_ticket_eur);
  if (!isFinite(avg_ticket_eur) || avg_ticket_eur <= 0) {
    return { ok: false, reason: "avg_ticket_eur_invalid" };
  }
  const region = KNOWN_REGIONS.has(raw.region) ? raw.region : "RoW";
  const providerRaw = typeof raw.provider_slug === "string" ? raw.provider_slug.trim().toLowerCase() : "";
  const provider_slug = providerRaw.length > 0 ? providerRaw : "unknown";
  const intl_pctRaw = Number(raw.intl_pct);
  const intl_pct = isFinite(intl_pctRaw) && intl_pctRaw >= 0 && intl_pctRaw <= 100
    ? intl_pctRaw
    : DEFAULT_INTL_PCT;
  // v1.3.0 — verified path. Optional measured fields describing the merchant's
  // real all-in rate over a real time window. When present, the engine uses
  // measured_current_bps as current_effective_bps VERBATIM (no composition on
  // top) and measured_intl_pct in place of the form intl_pct for the
  // achievable side. Absent → 1.2.0 estimated behavior byte-identical.
  const measured_current_bpsRaw = raw.measured_current_bps;
  const measured_current_bps = (measured_current_bpsRaw !== undefined && measured_current_bpsRaw !== null && isFinite(Number(measured_current_bpsRaw)))
    ? Number(measured_current_bpsRaw)
    : null;
  const measured_intl_pctRaw = raw.measured_intl_pct;
  const measured_intl_pct = (measured_intl_pctRaw !== undefined && measured_intl_pctRaw !== null && isFinite(Number(measured_intl_pctRaw)) && Number(measured_intl_pctRaw) >= 0 && Number(measured_intl_pctRaw) <= 100)
    ? Number(measured_intl_pctRaw)
    : null;
  const measured_sample = (raw.measured_sample && typeof raw.measured_sample === "object")
    ? raw.measured_sample
    : null;
  return {
    ok: true,
    input: {
      monthly_gmv_eur,
      avg_ticket_eur,
      region,
      provider_slug,
      intl_pct,
      measured_current_bps,
      measured_intl_pct,
      measured_sample,
    },
  };
}

function validateRateTable(rows) {
  if (!Array.isArray(rows)) {
    return { ok: false, reason: "rate_table_not_array", missing: REQUIRED_FALLBACK_KEYS };
  }
  const activeByKey = new Map();
  for (const r of rows) {
    if (!r || r.active === false) continue;
    if (typeof r.cohort_key === "string") activeByKey.set(r.cohort_key, r);
  }
  const missing = REQUIRED_FALLBACK_KEYS.filter((k) => !activeByKey.has(k));
  if (missing.length > 0) {
    return { ok: false, reason: "rate_table_incomplete", missing };
  }
  return { ok: true };
}

function selectRow(rows, provider_slug, region) {
  const exactKey = KNOWN_PROVIDERS.has(provider_slug)
    ? `${provider_slug}|ANY|${region}`
    : null;
  const fallbackKey = `ANY|ANY|${region}`;
  let exact = null;
  let fallback = null;
  for (const r of rows) {
    if (!r || r.active === false) continue;
    if (exactKey && r.cohort_key === exactKey) exact = r;
    else if (r.cohort_key === fallbackKey) fallback = r;
  }
  if (exact) return { row: exact, matched: "exact" };
  if (fallback) return { row: fallback, matched: "fallback" };
  return { row: null, matched: "none" };
}

function computeEffectiveBps(
  { percent_bps, fixed_fee_minor_units },
  avg_ticket_eur,
  { intl_pct = 0, intl_uplift_bps = 0 } = {}
) {
  const fixedMajor = fixed_fee_minor_units / MINOR_PER_MAJOR;
  const amortizedBps = (fixedMajor / avg_ticket_eur) * BPS_PER_UNIT;
  const upliftBps = isFinite(intl_uplift_bps) ? intl_uplift_bps : 0;
  const intlBps = (intl_pct / 100) * upliftBps;
  return percent_bps + intlBps + amortizedBps;
}

function computeMonthlySavings({ current_bps, achievable_bps, monthly_gmv_eur }) {
  const gapBps = current_bps - achievable_bps;
  if (gapBps <= 0) return 0;
  return (gapBps / BPS_PER_UNIT) * monthly_gmv_eur;
}

function applyBand(point, band_pct) {
  const half = point * band_pct;
  return { lo: Math.max(0, point - half), point, hi: point + half };
}

const FALLBACK_ASSUMPTION = "Estimate based on regional averages, not provider-verified rates. Connect your PSP for exact figures.";

const INTL_UPLIFT_NOT_MODELED_ASSUMPTION = "Cross-border card uplift not modeled for this provider/region cohort — the published cross-border rate for this PSP is not seeded. Effective savings for the intl portion of GMV may be understated. Connect your PSP for exact figures.";

const AMORTIZATION_NOTE = (fixedMinor, currency, avgTicket) =>
  `Fixed fee of ${(fixedMinor / MINOR_PER_MAJOR).toFixed(2)} ${currency} amortized over an average ticket of €${avgTicket.toFixed(2)}.`;

const ACHIEVABLE_NOTE = (breakdown) => {
  if (!breakdown) return null;
  const { interchange_bps, scheme_fees_bps, processor_margin_bps, processor_margin_band_bps } = breakdown;
  return (
    `Achievable rate composition: interchange ${interchange_bps} bps + scheme fees ${scheme_fees_bps} bps + ` +
    `assumed processor margin ${processor_margin_bps} bps (±${processor_margin_band_bps} bps assumption).`
  );
};

const INTL_UPLIFT_NOTE = (intl_pct, current_uplift_bps, achievable_uplift_bps) =>
  `${intl_pct.toFixed(0)}% of GMV assumed cross-border: +${(current_uplift_bps / 100).toFixed(2)}% uplift on the current rate and +${(achievable_uplift_bps / 100).toFixed(2)}% on the achievable rate for that portion (schemes' cross-border interchange is not negotiable).`;

// v1.3.0 verified-path assumption. Emitted verbatim ONLY when the caller
// supplied measured_current_bps. The sample descriptor comes from the caller
// (measured_sample.charge_count / measured_sample.days_covered) — the engine
// only formats it, never invents counts. When the sample descriptor is absent,
// a shorter form is emitted so the assumption still ships alongside the number.
const MEASURED_CURRENT_NOTE = (measured_bps, sample) => {
  const rate = `${(measured_bps / 100).toFixed(2)}%`;
  if (sample && isFinite(Number(sample.charge_count)) && isFinite(Number(sample.days_covered))) {
    const n = Math.round(Number(sample.charge_count));
    const m = Math.round(Number(sample.days_covered));
    return `Current rate is your all-in measured rate (${rate}, fees ÷ net volume, ${n} charges over ${m} days). Achievable is composed from published floors.`;
  }
  return `Current rate is your all-in measured rate (${rate}, fees ÷ net volume from your synced PSP data). Achievable is composed from published floors.`;
};

function calculateGap(rawInput, rateTable) {
  const tableCheck = validateRateTable(rateTable);
  if (!tableCheck.ok) {
    return { ok: false, error: tableCheck.reason, missing: tableCheck.missing };
  }
  const parsed = normalizeInput(rawInput);
  if (!parsed.ok) {
    return { ok: false, error: parsed.reason };
  }
  const { input } = parsed;

  const { row, matched } = selectRow(rateTable, input.provider_slug, input.region);
  if (!row) {
    return { ok: false, error: "rate_table_incomplete", missing: [`ANY|ANY|${input.region}`] };
  }

  // Read intl uplifts DIRECTLY from the row. Missing → 0 (engine never fills
  // in a number from code). We track "modeled" separately so we can emit the
  // right assumption when the merchant has intl volume but the row doesn't
  // carry an uplift.
  const rowCurrentUplift = typeof row.intl_uplift_bps === "number" ? row.intl_uplift_bps : 0;
  const rowAchievableUplift = typeof row.achievable_intl_uplift_bps === "number" ? row.achievable_intl_uplift_bps : 0;
  const intlModeled = typeof row.intl_uplift_bps === "number";

  // v1.3.0 verified-path split.
  //
  // measured_current_bps present ("verified" mode):
  //   • current_effective_bps = measured_current_bps DIRECT (all-in by canonical
  //     definition — fees ÷ net volume from real PSP data). NO recomposition on
  //     top: no fixed amortization, no intl uplift added. This is the
  //     anti-double-counting lock — the caller must NEVER measure something
  //     that then has extras stacked on.
  //   • achievable side: composed from the table (published floors) using
  //     measured_intl_pct when the caller supplied it (real cross-border share
  //     over the measurement window), else the form input.intl_pct.
  //
  // measured_current_bps absent ("estimated" mode):
  //   • Byte-identical 1.2.0 behavior. Both sides composed from the row via
  //     computeEffectiveBps with input.intl_pct. Anti-regression lock for the
  //     anonymous submitPaymentsAnalysis path (Chunk 4 will start passing
  //     measured; Chunk 3 does not).
  const measured = input.measured_current_bps;
  const isMeasured = typeof measured === "number" && isFinite(measured);
  const achievableIntlPct = (isMeasured && typeof input.measured_intl_pct === "number")
    ? input.measured_intl_pct
    : input.intl_pct;

  const current_bps = isMeasured
    ? measured
    : computeEffectiveBps(
        { percent_bps: row.percent_bps, fixed_fee_minor_units: row.fixed_fee_minor_units },
        input.avg_ticket_eur,
        { intl_pct: input.intl_pct, intl_uplift_bps: rowCurrentUplift }
      );

  const hasAchievable =
    typeof row.achievable_percent_bps === "number" &&
    typeof row.achievable_fixed_fee_minor_units === "number";
  const achievable_bps = hasAchievable
    ? computeEffectiveBps(
        {
          percent_bps: row.achievable_percent_bps,
          fixed_fee_minor_units: row.achievable_fixed_fee_minor_units,
        },
        input.avg_ticket_eur,
        { intl_pct: achievableIntlPct, intl_uplift_bps: rowAchievableUplift }
      )
    : current_bps;

  const pointSavings = computeMonthlySavings({
    current_bps,
    achievable_bps,
    monthly_gmv_eur: input.monthly_gmv_eur,
  });
  const band_pct = typeof row.savings_band_pct === "number" ? row.savings_band_pct : 0.35;
  const monthly = applyBand(pointSavings, band_pct);
  const annual = {
    lo: monthly.lo * 12,
    point: monthly.point * 12,
    hi: monthly.hi * 12,
  };

  const assumptions = [];
  if (isMeasured) {
    // Verified path — mandatory assumption naming the measured rate and, when
    // provided, the sample descriptor. This is the audit trail: the user's
    // Results view must show WHY current is that exact number.
    assumptions.push(MEASURED_CURRENT_NOTE(measured, input.measured_sample));
    // Achievable side is still composed from the table (fixed fee is amortized
    // against the same avg_ticket_eur the caller passed — the merchant's real
    // ticket in the measurement window when going through Chunk 4). So the
    // amortization note stays, but it now describes ONLY the achievable side.
    assumptions.push(
      AMORTIZATION_NOTE(row.achievable_fixed_fee_minor_units ?? row.fixed_fee_minor_units, row.fixed_fee_currency, input.avg_ticket_eur)
    );
    // Achievable breakdown assumption unchanged.
    const achievableNote = ACHIEVABLE_NOTE(row.achievable_breakdown_json);
    if (achievableNote) assumptions.push(achievableNote);
    // Intl uplift on the ACHIEVABLE side only (the current side is verbatim).
    if (achievableIntlPct > 0) {
      if (intlModeled) {
        assumptions.push(INTL_UPLIFT_NOTE(achievableIntlPct, rowCurrentUplift, rowAchievableUplift));
      } else {
        assumptions.push(INTL_UPLIFT_NOT_MODELED_ASSUMPTION);
      }
    }
  } else {
    // Estimated path — 1.2.0 behavior verbatim.
    assumptions.push(
      AMORTIZATION_NOTE(row.fixed_fee_minor_units, row.fixed_fee_currency, input.avg_ticket_eur)
    );
    const achievableNote = ACHIEVABLE_NOTE(row.achievable_breakdown_json);
    if (achievableNote) assumptions.push(achievableNote);
    if (input.intl_pct > 0) {
      if (intlModeled) {
        assumptions.push(INTL_UPLIFT_NOTE(input.intl_pct, rowCurrentUplift, rowAchievableUplift));
      } else {
        assumptions.push(INTL_UPLIFT_NOT_MODELED_ASSUMPTION);
      }
    }
  }
  if (row.verified !== true) assumptions.push(FALLBACK_ASSUMPTION);

  return {
    ok: true,
    engine_version: ENGINE_VERSION,
    current_effective_bps: current_bps,
    achievable_effective_bps: achievable_bps,
    monthly_savings_eur: monthly,
    annual_savings_eur: annual,
    cohort: {
      key: row.cohort_key,
      verified: row.verified === true,
      matched,
    },
    // Engine mode — "verified" when current came from a real measurement,
    // "estimated" when both sides were composed from the table. Consumed by
    // Results.jsx (badge copy) and future benchmark aggregators (filter by
    // origin). Persisted verbatim on every session row.
    mode: isMeasured ? "verified" : "estimated",
    assumptions,
  };
}
// SYNC-END: paymentsGap

// ─── Tenant ownership (inline copy of _tenantGuard's pure helper) ──────────
// Same rule from Chunk 2: never re-implement per-function; use the shared
// helper. We inline the pure `checkOwnership` here rather than HTTP-invoking
// _tenantGuard because (a) same platform rule as above (no inter-function
// hop for pure logic), (b) `checkOwnership` has zero I/O and is byte-testable
// against src/lib/tenantGuard.js on the frontend suite. If this ever drifts
// it will show up in tenantGuard.test.js's next run against production data.

function normalizeEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function checkOwnership(user: { email?: string } | null, brand: { created_by?: string } | null): { ok: true; owner_email: string } | { ok: false; reason: string } {
  if (!user || !user.email) return { ok: false, reason: 'no_user' };
  if (!brand || !brand.created_by) return { ok: false, reason: 'no_brand' };
  const userEmail = normalizeEmail(user.email);
  const ownerEmail = normalizeEmail(brand.created_by);
  if (userEmail !== ownerEmail) return { ok: false, reason: 'not_owner' };
  return { ok: true, owner_email: ownerEmail };
}

// ─── Country → region (verbatim from submitPaymentsAnalysis) ───────────────
// Small helper that has to agree with the anonymous endpoint's mapping — if
// they drift, a merchant would land in a different cohort by connecting vs
// submitting. Copy is small enough that a SYNC pair is overkill; the shape
// is fully test-covered by paymentsGap.test.js's region tests.
const EU_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  'IS','LI','NO','CH',
]);
const UK_COUNTRIES = new Set(['GB']);
const US_COUNTRIES = new Set(['US']);

function countryToRegion(iso2: string): 'EU' | 'UK' | 'US' | 'RoW' {
  if (EU_COUNTRIES.has(iso2)) return 'EU';
  if (UK_COUNTRIES.has(iso2)) return 'UK';
  if (US_COUNTRIES.has(iso2)) return 'US';
  return 'RoW';
}

// ─── Stripe canonical aggregation (contract §3, matches Decision_Log 1b) ───
// This is the M3 signature computation. Same formula as stripeDataSync, but
// running in this endpoint's context so we own the raw charge IDs (needed
// for source_charges_hash idempotency, §6). See file header for why we
// don't call stripeDataSync over HTTP.
//
// CANONICAL_CATEGORIES: only balance_transaction rows in
// {charge, refund, partial_capture_reversal} count for the merchant's
// PROCESSING cost. Excludes application_fee, stripe_fee (SaaS-style), payout,
// transfer, adjustment, dispute — same set stripeDataSync uses.
//
// numerator_cents  = Σ fee    over CANONICAL_CATEGORIES rows
// denominator_cents = Σ amount over CANONICAL_CATEGORIES rows  (net volume)
// measured_current_bps = round(10000 × numerator / denominator)
const CANONICAL_CATEGORIES = new Set(['charge', 'refund', 'partial_capture_reversal']);
const WINDOW_DAYS = 90;
const STRIPE_PAGE_LIMIT = 100;
const STRIPE_MAX_PAGES = 20; // 2000 rows/window hard cap — bounds sync duration.

// Fetch Stripe with authorization headers. Returns { ok, data, error, status }.
async function stripeFetch(url: string, headers: Record<string, string>): Promise<{ ok: boolean; data?: any; error?: string; status: number }> {
  const res = await fetch(url, { headers });
  const status = res.status;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    // NEVER echo the token or any request header back. json.error.message is
    // Stripe's public error text, safe to surface.
    return { ok: false, error: json?.error?.message || `stripe_${status}`, status };
  }
  return { ok: true, data: json, status };
}

// Paginate Stripe list endpoints via starting_after. Returns the accumulated
// items array. Caps at STRIPE_MAX_PAGES to bound execution — if we hit the
// cap, the caller sees `pagination_capped: true` in sample_metrics for audit.
async function stripePaginate(baseUrl: string, headers: Record<string, string>, extraParams: URLSearchParams): Promise<{ ok: boolean; items?: any[]; error?: string; status?: number; capped: boolean }> {
  const items: any[] = [];
  let startingAfter: string | null = null;
  for (let page = 0; page < STRIPE_MAX_PAGES; page++) {
    const params = new URLSearchParams(extraParams);
    params.set('limit', String(STRIPE_PAGE_LIMIT));
    if (startingAfter) params.set('starting_after', startingAfter);
    const res = await stripeFetch(`${baseUrl}?${params}`, headers);
    if (!res.ok) return { ok: false, error: res.error, status: res.status, capped: false };
    const batch = res.data?.data || [];
    items.push(...batch);
    if (!res.data?.has_more || !batch.length) return { ok: true, items, capped: false };
    startingAfter = batch[batch.length - 1].id;
  }
  return { ok: true, items, capped: true };
}

// SHA-256 hex of an input string. Deno SubtleCrypto is async — no synchronous
// alternative available in this runtime.
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Read the canonical Stripe data for the window. Returns everything the
// verified row and downstream engine need. Assumes headers are correct (test
// vs live) — resolveStripeAuth() handles that upstream.
async function fetchAndAggregate(
  headers: Record<string, string>,
  acctCountry: string,
): Promise<
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      window: { from: string; to: string; days_covered: number };
      measured_current_bps: number;
      numerator_cents: number;
      denominator_cents: number;
      counts: { charge: number; refund: number; partial_capture_reversal: number };
      avg_ticket_eur: number;
      currency: string;
      monthly_gmv_eur: number;
      intl: { identified: number; intl_charges: number; domestic_charges: number; intl_share_pct: number | null };
      source_charge_ids: string[];   // sorted, canonical
      pagination_capped: boolean;
      raw_counts: { charges_fetched: number; balance_txns_fetched: number };
    }
> {
  const untilTs = Math.floor(Date.now() / 1000);
  const sinceTs = untilTs - WINDOW_DAYS * 24 * 60 * 60;

  // ── Charges (for intl.country enrichment + source_charge_ids) ───────────
  const chargesParams = new URLSearchParams({ 'created[gte]': String(sinceTs), 'expand[]': 'data.payment_method_details' });
  const chargesRes = await stripePaginate('https://api.stripe.com/v1/charges', headers, chargesParams);
  if (!chargesRes.ok) return { ok: false, error: chargesRes.error!, status: chargesRes.status || 502 };

  // ── Balance transactions (for the canonical fees + volumes) ─────────────
  const btParams = new URLSearchParams({ 'created[gte]': String(sinceTs) });
  const btRes = await stripePaginate('https://api.stripe.com/v1/balance_transactions', headers, btParams);
  if (!btRes.ok) return { ok: false, error: btRes.error!, status: btRes.status || 502 };

  const charges = chargesRes.items!;
  const balanceTxns = btRes.items!;

  // Canonical rows only.
  const canonicalRows = balanceTxns.filter(t => CANONICAL_CATEGORIES.has(t.reporting_category));
  let numeratorCents = 0;
  let denominatorCents = 0;
  let countCharge = 0, countRefund = 0, countPartial = 0;
  for (const t of canonicalRows) {
    numeratorCents += Number(t.fee || 0);
    denominatorCents += Number(t.amount || 0);
    if (t.reporting_category === 'charge') countCharge++;
    else if (t.reporting_category === 'refund') countRefund++;
    else if (t.reporting_category === 'partial_capture_reversal') countPartial++;
  }
  const measured_current_bps = denominatorCents > 0
    ? Math.round((numeratorCents / denominatorCents) * 10000)
    : 0;

  // Avg ticket = mean charge amount over the CANONICAL charge rows only.
  // Refund/partial rows carry negative amounts and don't reflect a ticket.
  const chargeAmounts = canonicalRows
    .filter(t => t.reporting_category === 'charge')
    .map(t => Number(t.amount || 0));
  const avgTicketCents = chargeAmounts.length > 0
    ? chargeAmounts.reduce((s, a) => s + a, 0) / chargeAmounts.length
    : 0;

  // Currency: majority currency of the canonical rows (or default to EUR when
  // we can't tell). Not FX-converting anything — the engine treats EUR/GBP/USD
  // as ~1:1 at these magnitudes, same policy as Chunk 3.
  const currency = String(canonicalRows[0]?.currency || 'eur').toUpperCase();

  // Monthly GMV in major units. We compute over the actual window and scale
  // to a 30-day proxy so the engine's savings math has a "monthly rate" input.
  const gmvMajor = denominatorCents / MINOR_PER_MAJOR;
  const monthly_gmv = gmvMajor * (30 / WINDOW_DAYS);

  // ── Intl share (contract §3 fallback policy) ────────────────────────────
  // Only successful charges contribute. Charges without a card_country →
  // EXCLUDED from the denominator, not silently counted as domestic. This
  // is transparent: `identified` = 0 emits null intl_share_pct upstream so
  // the engine treats it as "not measured" (its DEFAULT_INTL_PCT policy).
  let intlCharges = 0;
  let domesticCharges = 0;
  const acctCountryUpper = String(acctCountry || 'US').toUpperCase();
  for (const c of charges) {
    if (c.status !== 'succeeded') continue;
    const cardCountry = c.payment_method_details?.card?.country;
    if (!cardCountry) continue;
    if (String(cardCountry).toUpperCase() === acctCountryUpper) domesticCharges++;
    else intlCharges++;
  }
  const identified = intlCharges + domesticCharges;
  const intl_share_pct = identified > 0
    ? Math.round((intlCharges / identified) * 10000) / 100
    : null;

  // ── Source charge IDs for idempotency (contract §6) ─────────────────────
  // The canonical set is what the engine consumed → hash the set of Stripe
  // charge IDs *that produced canonical fees* (i.e. the `source` of each
  // canonical row when it's a charge or refund pointing back to a charge).
  // We use balance_transaction.source when available — that's the FK to the
  // charge (or refund → charge). Sorted lexicographically for deterministic
  // hashing across runs.
  const sourceIdSet = new Set<string>();
  for (const t of canonicalRows) {
    const src = t.source;
    if (typeof src === 'string' && src) sourceIdSet.add(src);
  }
  const source_charge_ids = Array.from(sourceIdSet).sort();

  return {
    ok: true,
    window: {
      from: new Date(sinceTs * 1000).toISOString(),
      to: new Date(untilTs * 1000).toISOString(),
      days_covered: WINDOW_DAYS,
    },
    measured_current_bps,
    numerator_cents: numeratorCents,
    denominator_cents: denominatorCents,
    counts: { charge: countCharge, refund: countRefund, partial_capture_reversal: countPartial },
    avg_ticket_eur: Math.round(avgTicketCents) / MINOR_PER_MAJOR,
    currency,
    monthly_gmv_eur: Math.round(monthly_gmv * 100) / 100,
    intl: { identified, intl_charges: intlCharges, domestic_charges: domesticCharges, intl_share_pct },
    source_charge_ids,
    pagination_capped: chargesRes.capped || btRes.capped,
    raw_counts: { charges_fetched: charges.length, balance_txns_fetched: balanceTxns.length },
  };
}

// Fee decomposition for measured_fixed_fee_minor. Stripe balance_transactions
// carry fee_details. We aggregate by type to expose the "stripe_fee" component
// which is the per-transaction fixed fee. When the sync can't decompose
// reliably (empty fee_details), we return null — the schema explicitly says
// "downstream reads must treat null as 'not measured' rather than 0".
function extractFixedFeePerCharge(canonicalCharges: any[]): number | null {
  const chargeRows = canonicalCharges.filter(t => t.reporting_category === 'charge');
  if (chargeRows.length === 0) return null;
  // Sum the "stripe_fee" component (or fallback to whatever component looks
  // like a per-tx fixed fee). Stripe's fee_details type values include
  // "stripe_fee" and "application_fee" — we want stripe_fee only.
  let totalFixedCents = 0;
  let rowsWithDetail = 0;
  for (const t of chargeRows) {
    const details = Array.isArray(t.fee_details) ? t.fee_details : [];
    // Per-transaction fixed fee is embedded in the total fee. Without a
    // reliable way to decompose across all Stripe locales/products, we treat
    // decomposition as best-effort and return null when uncertain.
    const fixedItem = details.find((d: any) => d?.type === 'stripe_fee_fixed' || d?.type === 'stripe_fixed_fee');
    if (fixedItem && isFinite(Number(fixedItem.amount))) {
      totalFixedCents += Number(fixedItem.amount);
      rowsWithDetail++;
    }
  }
  if (rowsWithDetail === 0) return null;
  return Math.round(totalFixedCents / rowsWithDetail);
}

// ─── Stripe auth resolver (Integration → headers) ──────────────────────────
// Handles the test-mode bridge policy from Decision_Log 2026-07-10 M3-1b:
//   - provider == 'stripe_self_test' → STRIPE_TEST_SECRET_KEY (no Stripe-Account header)
//   - provider == 'stripe_self' → STRIPE_SECRET_KEY (platform live key, no Stripe-Account)
//   - provider == 'stripe' → STRIPE_SECRET_KEY + Stripe-Account: <acct_id> (Connect OAuth path)
//
// We do NOT decrypt Integration.access_token in this chunk. Real Connect
// OAuth ships in a later phase; today the only two Stripe modes in prod are
// (a) the self-test brand pointing at Stripe test-mode, and (b) the CAMBRA
// operational account. Both use env keys, not per-merchant tokens.
async function resolveStripeAuth(integration: any): Promise<
  | { ok: true; headers: Record<string, string>; is_test: boolean; acct_country_hint: string }
  | { ok: false; error: string; setup_required?: boolean }
> {
  const liveKey = Deno.env.get('STRIPE_SECRET_KEY');
  const testKey = Deno.env.get('STRIPE_TEST_SECRET_KEY');
  const provider = integration?.provider;

  if (provider === 'stripe_self_test') {
    if (!testKey) return { ok: false, error: 'STRIPE_TEST_SECRET_KEY not configured', setup_required: true };
    return {
      ok: true,
      headers: { 'Authorization': `Bearer ${testKey}` },
      is_test: true,
      acct_country_hint: (integration?.metadata_json?.country || 'US').toUpperCase(),
    };
  }
  if (provider === 'stripe_self') {
    if (!liveKey) return { ok: false, error: 'STRIPE_SECRET_KEY not configured', setup_required: true };
    return {
      ok: true,
      headers: { 'Authorization': `Bearer ${liveKey}` },
      is_test: false,
      acct_country_hint: (integration?.metadata_json?.country || 'FR').toUpperCase(),
    };
  }
  if (provider === 'stripe') {
    if (!liveKey) return { ok: false, error: 'STRIPE_SECRET_KEY not configured', setup_required: true };
    const acctId = integration?.provider_account_id;
    if (!acctId) return { ok: false, error: 'integration_missing_stripe_account_id' };
    return {
      ok: true,
      headers: { 'Authorization': `Bearer ${liveKey}`, 'Stripe-Account': acctId },
      is_test: false,
      acct_country_hint: (integration?.metadata_json?.country || 'FR').toUpperCase(),
    };
  }
  return { ok: false, error: `unsupported_stripe_provider:${provider}` };
}

// ─── Rate table loader (same eventual-consistency policy as Chunk 3) ───────
async function loadRateTable(base44: any): Promise<{ ok: boolean; rows?: any[]; error?: string; missing?: string[] }> {
  let rows = await base44.asServiceRole.entities.PaymentsRateTable.list('-created_date', 500);
  let check = validateRateTable(rows);
  if (!check.ok) {
    await new Promise((r) => setTimeout(r, 400));
    rows = await base44.asServiceRole.entities.PaymentsRateTable.list('-created_date', 500);
    check = validateRateTable(rows);
  }
  if (!check.ok) return { ok: false, error: check.reason, missing: check.missing };
  return { ok: true, rows };
}

// ─── HTTP handler ──────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth guard (contract §1).
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Parse body.
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'invalid_json_body' }, { status: 400 });
    }
    const brand_id = body?.brand_id;
    if (typeof brand_id !== 'string' || !brand_id) {
      return Response.json({ error: 'brand_id_required' }, { status: 400 });
    }

    // Tenant guard (contract §1). Uses the same rule as _tenantGuard: admins
    // resolve to the brand's REAL owner_email (needed to populate the row
    // correctly), non-owners get 404 (not 403 — never leak existence).
    const brand = await base44.asServiceRole.entities.Brand.get(brand_id).catch(() => null);
    if (!brand) return Response.json({ error: 'brand_not_found' }, { status: 404 });
    const isAdmin = user.role === 'admin';
    let owner_email: string;
    if (isAdmin) {
      owner_email = normalizeEmail(brand.created_by);
    } else {
      const check = checkOwnership(user, brand);
      if (!check.ok) return Response.json({ error: 'brand_not_found' }, { status: 404 });
      owner_email = check.owner_email;
    }
    // owner_email MUST be a real address for the read RLS to have anything to
    // match. If Brand.created_by is somehow empty (shouldn't happen, but the
    // schema doesn't enforce it), refuse rather than write a row nobody can
    // read.
    if (!owner_email) return Response.json({ error: 'brand_owner_email_missing' }, { status: 409 });

    // Resolve the target Integration. If integration_id is supplied, validate
    // it belongs to this brand; otherwise pick the most-recent connected
    // stripe-family integration for the brand.
    let integration: any = null;
    if (body?.integration_id) {
      integration = await base44.asServiceRole.entities.Integration.get(body.integration_id).catch(() => null);
      if (!integration || integration.brand_id !== brand_id) {
        return Response.json({ error: 'integration_not_found' }, { status: 404 });
      }
    } else {
      const candidates = await base44.asServiceRole.entities.Integration.filter(
        { brand_id, status: 'connected' },
        '-last_sync_at',
        20,
      ).catch(() => []);
      integration = candidates.find((i: any) =>
        i.provider === 'stripe' || i.provider === 'stripe_self' || i.provider === 'stripe_self_test'
      );
      if (!integration) {
        return Response.json({ error: 'no_stripe_integration' }, { status: 404 });
      }
    }
    // Explicit refusal for non-Stripe providers routed here by mistake — a
    // future chunk generalizes this to PayPal/Shopify Payments.
    if (
      integration.provider !== 'stripe' &&
      integration.provider !== 'stripe_self' &&
      integration.provider !== 'stripe_self_test'
    ) {
      return Response.json({ error: `unsupported_provider:${integration.provider}` }, { status: 400 });
    }

    // Resolve Stripe auth headers.
    const auth = await resolveStripeAuth(integration);
    if (!auth.ok) {
      return Response.json({ ok: false, error: auth.error, ...(auth.setup_required ? { setup_required: true } : {}) }, { status: 400 });
    }

    // Fetch + aggregate.
    const agg = await fetchAndAggregate(auth.headers, auth.acct_country_hint);
    if (!agg.ok) {
      // upstream Stripe error — surface the public message, never headers.
      return Response.json({ ok: false, error: agg.error }, { status: agg.status || 502 });
    }

    // Idempotency (contract §6). Compute the source_charges_hash and look for
    // an existing verified row with the exact same (brand_id, integration_id,
    // source_charges_hash). Match → return existing untouched.
    const idsBlob = agg.source_charge_ids.join('\n');
    const source_charges_hash = await sha256Hex(`v1:${brand_id}:${integration.id}:${idsBlob}`);

    const existing = await base44.asServiceRole.entities.PaymentsAnalysisVerified.filter({
      brand_id,
      integration_id: integration.id,
      source_charges_hash,
    }, '-created_date', 1).catch(() => []);
    if (Array.isArray(existing) && existing[0]) {
      return Response.json({
        ok: true,
        reused: true,
        verified_id: existing[0].id,
        engine_result: existing[0].engine_result,
        measured: {
          current_bps: existing[0].measured_current_bps,
          fixed_fee_minor: existing[0].measured_fixed_fee_minor ?? null,
          intl_pct_of_gmv: existing[0].measured_intl_pct ?? null,
        },
        window: existing[0].measurement_window,
        // Historical rows may carry legacy unit labels (gmv_eur, tx_count,
        // intl_pct). Return them unchanged — the schema doesn't force
        // migration of past rows and the new labels are additive.
        sample_metrics: existing[0].sample_metrics,
        source_charges_hash,
      });
    }

    // Guard: no data → nothing to verify. Return a clean 200-not-ok so the
    // caller UI can render "connect + wait" rather than an error toast.
    if (agg.denominator_cents <= 0 || agg.counts.charge === 0) {
      return Response.json({
        ok: false,
        error: 'no_stripe_activity_in_window',
        window: agg.window,
        sample_metrics: {
          gmv_eur_monthly: agg.monthly_gmv_eur,
          tx_count_charges_90d: agg.counts.charge,
          avg_ticket_eur: agg.avg_ticket_eur,
          intl_pct_of_gmv: agg.intl.intl_share_pct,
          identified_charges_for_intl: agg.intl.identified,
          window_days: WINDOW_DAYS,
        },
      });
    }

    // Load rate table + run engine.
    const table = await loadRateTable(base44);
    if (!table.ok) {
      console.error('computeStripeVerifiedGap rate table error:', table.error, table.missing);
      return Response.json({ ok: false, error: 'engine_unavailable' }, { status: 503 });
    }

    // Derive the engine input. Region derived from the account country hint
    // (Integration.metadata_json.country) — same source of truth for both the
    // Stripe-Account country and the region-cohort lookup.
    const region = countryToRegion(auth.acct_country_hint);
    // provider_slug: 'stripe_self_test' and 'stripe_self' route to the 'stripe'
    // cohort (they ARE Stripe, just via env keys instead of Connect OAuth).
    const provider_slug = 'stripe';

    const measured_fixed_fee_minor = extractFixedFeePerCharge(
      // Only send canonical CHARGE rows (not refunds/partial) to fixed-fee
      // extraction — refund/partial reporting_categories don't reflect
      // per-transaction fixed fees. Recovering this requires touching the raw
      // canonicalRows array which is inside fetchAndAggregate — for now we
      // pass a marker null and the schema treats null as "not measured".
      []
    );

    const engineInput = {
      monthly_gmv_eur: agg.monthly_gmv_eur,
      avg_ticket_eur: agg.avg_ticket_eur,
      region,
      provider_slug,
      intl_pct: 0, // ignored when measured_intl_pct is passed
      measured_current_bps: agg.measured_current_bps,
      measured_intl_pct: agg.intl.intl_share_pct, // null when unknown → engine emits not-modeled note
      measured_sample: { charge_count: agg.counts.charge, days_covered: WINDOW_DAYS },
    };
    const engineResult = calculateGap(engineInput, table.rows!);
    if (!engineResult.ok) {
      console.error('computeStripeVerifiedGap engine returned not-ok:', engineResult);
      return Response.json({ ok: false, error: 'engine_error' }, { status: 502 });
    }

    // Persist via service role. owner_email is what makes this row readable
    // by the human owner through RLS (see PaymentsAnalysisVerified schema).
    // sample_metrics with EXPLICIT UNIT LABELS. Rationale (Chunk 4 review):
    // "44,682 EUR monthly" next to "avg_ticket_eur computed over 90d gross"
    // invites confusion. Every numeric field now carries a suffix that names
    // its unit + time basis. `gmv_eur_monthly` = the value fed to the engine
    // (the 30d proxy) — this is what the engine's savings math consumed.
    // `gross_volume_eur_90d` = the raw sum from Stripe over the window (no
    // scaling). `avg_ticket_eur` is a per-charge mean, no time basis.
    const gross_volume_eur_90d = Math.round((agg.denominator_cents / MINOR_PER_MAJOR) * 100) / 100;
    const sampleMetricsCommon = {
      gmv_eur_monthly: agg.monthly_gmv_eur,
      gross_volume_eur_90d,
      tx_count_charges_90d: agg.counts.charge,
      avg_ticket_eur: agg.avg_ticket_eur,
      intl_pct_of_gmv: agg.intl.intl_share_pct,
      identified_charges_for_intl: agg.intl.identified,
      canonical_rows_90d: agg.counts.charge + agg.counts.refund + agg.counts.partial_capture_reversal,
      raw_counts: agg.raw_counts,
      currency: agg.currency,
      pagination_capped: agg.pagination_capped,
      window_days: WINDOW_DAYS,
    };
    const created = await base44.asServiceRole.entities.PaymentsAnalysisVerified.create({
      brand_id,
      owner_email,
      integration_id: integration.id,
      engine_version: engineResult.engine_version,
      measurement_window: agg.window,
      measured_current_bps: agg.measured_current_bps,
      measured_fixed_fee_minor,
      measured_intl_pct: agg.intl.intl_share_pct,
      engine_result: engineResult,
      sample_metrics: sampleMetricsCommon,
      source_charges_hash,
    });

    return Response.json({
      ok: true,
      reused: false,
      verified_id: created.id,
      engine_result: engineResult,
      measured: {
        current_bps: agg.measured_current_bps,
        fixed_fee_minor: measured_fixed_fee_minor,
        intl_pct_of_gmv: agg.intl.intl_share_pct,
      },
      window: agg.window,
      sample_metrics: sampleMetricsCommon,
      source_charges_hash,
    });
  } catch (error) {
    console.error('computeStripeVerifiedGap:', (error as any)?.message, (error as any)?.stack);
    return Response.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
});