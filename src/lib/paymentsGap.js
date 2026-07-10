// ─────────────────────────────────────────────────────────────────────────────
// paymentsGap — pure ES6 engine for the payments savings calculation.
//
// SINGLE SOURCE OF TRUTH for how a merchant's payments gap is computed.
// This file has NO Base44 SDK imports and NO backend dependencies. It exports
// pure functions that operate on plain inputs and a plain rate-table array.
//
// The Deno backend function (base44/functions/submitPaymentsAnalysis) contains
// a verbatim copy of the block between SYNC-START/SYNC-END markers. The
// `paymentsGap` pair in src/lib/syncEngine/__sync_check__.test.js enforces
// that the two copies stay in sync. When you edit logic here, edit the Deno
// copy too — the test will fail loud if you don't.
//
// KEY STRUCTURAL DECISIONS
//   Chunk 1b: Rate rows store ATOMIC components (percent_bps + fixed_fee_minor_units).
//             The engine amortizes the fixed fee against the merchant's REAL
//             avg_ticket at runtime.
//   Enmienda 1 (Chunk 1.2.0): ZERO tariff constants in the engine. Every rate
//             — including the international (cross-border) uplift — lives on
//             the PaymentsRateTable row with its own source_url + source_quote
//             (or an intl_uplift_assumption_notes when derived). If a row does
//             not carry intl_uplift_bps, the engine treats it as 0 and emits
//             an assumption "intl uplift not modeled for this cohort". The
//             engine NEVER invents a rate at runtime.
// ─────────────────────────────────────────────────────────────────────────────

// SYNC-START: paymentsGap

// Engine version. Bumped when the SYNC block's arithmetic/logic changes.
// Persisted verbatim on every session by callers — the session reflects what
// the engine said, never a caller-side constant. Keep in one place inside the
// SYNC block so both the src copy and the Deno copy agree by construction.
//
// Version history:
//   payments-gap-1.0.0 (Chunk 2)  — atomic components + runtime amortization.
//   payments-gap-1.1.0 (bumped 2026-07-09, later reverted architecturally in
//                       1.2.0) — first attempt at intl uplift, incorrectly
//                       hardcoded as engine constants (+150/+90 bps). Violated
//                       Enmienda 1 and the numbers themselves were wrong for
//                       Stripe EU/UK (published cross-border is +175 bps, not
//                       +150; +150 is Stripe US). Superseded by 1.2.0.
//   payments-gap-1.2.0 — intl uplift lives on the RATE-TABLE ROW, not in code.
//                       Engine reads intl_uplift_bps and achievable_intl_uplift_bps
//                       from the selected row. Missing values are treated as 0
//                       with an explicit assumption ("intl uplift not modeled
//                       for this cohort") — the engine never fills in a number
//                       the seeder didn't provide.
//   payments-gap-1.3.0 (this bump) — VERIFIED path. When the caller supplies a
//                       measured_current_bps (all-in effective rate computed
//                       from real PSP data, e.g. fees ÷ net volume over the
//                       last N charges), the engine takes it VERBATIM as
//                       current_effective_bps. NO composition on top — no fixed
//                       amortization, no intl uplift added. The measured rate
//                       is by canonical definition already all-in. The
//                       achievable side stays COMPOSED FROM THE TABLE
//                       (percent_bps + amortize(fixed, ticket) + measured_intl_pct
//                       × achievable_intl_uplift_bps) — because the table is
//                       still the only source of truth for "what could be
//                       negotiated". A verified-path assumption is emitted
//                       verbatim, naming the N charges over M days that
//                       produced measured_current_bps. When measured_current_bps
//                       is ABSENT (undefined / null / non-finite), behavior is
//                       BYTE-IDENTICAL to 1.2.0 — this is the anti-regression
//                       lock for the anonymous submitPaymentsAnalysis path,
//                       which will not start passing measured until Chunk 4.
const ENGINE_VERSION = "payments-gap-1.3.0";

// Currency minor-unit divisor. All PaymentsRateTable rows store fixed fees
// in minor units (cents / pence). 100 minor units = 1 major (EUR / GBP / USD).
const MINOR_PER_MAJOR = 100;

// Basis-point divisor. 10000 bps = 100%. All rates in the table live in bps
// so integer arithmetic stays honest; conversion to percentage happens only
// at output boundaries.
const BPS_PER_UNIT = 10000;

// Regional fallback cohort keys the engine falls back to when the exact
// (provider|tier|region) cohort is not seeded. The rate-table cache validates
// that ALL FOUR of these are present before considering itself warm — this is
// the defense against the eventual-consistency issue we hit in Chunk 1b
// (list() immediately after write returned 8 of 11 rows).
const REQUIRED_FALLBACK_KEYS = [
  "ANY|ANY|EU",
  "ANY|ANY|UK",
  "ANY|ANY|US",
  "ANY|ANY|RoW",
];

// Card-mix defaults. When the input doesn't provide a card mix, we assume
// 100% domestic (0% intl). This is conservative — intl uplift only widens
// the effective rate, so assuming 0 keeps estimates from over-selling savings.
const DEFAULT_INTL_PCT = 0;

// Regions we understand. Anything else routes to RoW fallback.
const KNOWN_REGIONS = new Set(["EU", "UK", "US", "RoW"]);

// Provider slugs we treat as first-class (i.e. eligible for a verified row
// lookup). Everything else routes straight to the regional fallback. This
// list mirrors the seeded verified rows in PaymentsRateTable — keep in sync
// when a new provider is seeded.
const KNOWN_PROVIDERS = new Set(["stripe", "paypal", "shopify_payments"]);

// ─── Input normalization ─────────────────────────────────────────────────────

// Normalize a caller-provided input into the shape the engine expects.
// Rejects malformed inputs by returning { ok: false, reason }. On success
// returns { ok: true, input: <normalized> } where every downstream-consumed
// field has a defensible value.
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

// ─── Rate table cache validation ─────────────────────────────────────────────

// Validate a candidate rate-table snapshot before it becomes the warm cache.
// Returns { ok: true } if all four regional fallback keys are present and
// active; otherwise { ok: false, reason, missing }.
// The engine NEVER calculates against a partial table — it either has all the
// fallbacks or it refuses to answer with rate_table_incomplete.
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

// ─── Row selection with cascade fallback ─────────────────────────────────────

// Look up the best rate-table row for (provider_slug, region).
// Cascade:
//   1. exact:    "<provider>|ANY|<region>"           (verified when seeded)
//   2. fallback: "ANY|ANY|<region>"                  (always seeded, verified=false)
// Never returns null when the table passed validateRateTable — the regional
// fallback is guaranteed to exist.
function selectRow(rows, provider_slug, region) {
  // Only look up first-class providers by exact cohort. Anything else routes
  // straight to the regional fallback — a merchant on Adyen must NOT match
  // the stripe row just because both are on EU.
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
  // Should be impossible after validateRateTable; guard anyway.
  return { row: null, matched: "none" };
}

// ─── Effective-rate calculation ──────────────────────────────────────────────

// Given atomic components + the merchant's real avg_ticket, compute the
// effective rate in bps. This is the CORE of the runtime amortization
// correction: fixed fee is amortized against the actual ticket, not baked in.
//
//   effective_bps = (percent_bps + intl_uplift) + (fixed_fee_major / avg_ticket_eur) * 10000
//
// where fixed_fee_major = fixed_fee_minor_units / 100 and
//   intl_uplift = (intl_pct / 100) * uplift_bps
//
// The caller passes uplift_bps read directly from the selected row (either
// intl_uplift_bps for the current side or achievable_intl_uplift_bps for the
// achievable side). Missing → 0. When both sides are 0 the function reduces
// to the pre-1.1.0 behavior. The engine does NOT own a default uplift
// constant — every value must come from the row (Enmienda 1).
//
// The caller is responsible for currency alignment. We do NOT do FX here:
// PaymentsRateTable stores the fixed fee in the provider's native currency,
// but for a first-pass gap estimate we treat EUR/GBP/USD as ~1:1 at the
// magnitudes involved (fees under €0.50). FX-precise treatment is deferred
// to when we have live sync data.
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

// ─── Savings computation ─────────────────────────────────────────────────────

// Compute the monthly EUR savings implied by (current_bps - achievable_bps)
// applied to the merchant's GMV. Clamped at zero: if the merchant already
// beats the achievable rate, savings are 0 (never negative).
function computeMonthlySavings({ current_bps, achievable_bps, monthly_gmv_eur }) {
  const gapBps = current_bps - achievable_bps;
  if (gapBps <= 0) return 0;
  return (gapBps / BPS_PER_UNIT) * monthly_gmv_eur;
}

// Apply the row's savings band to a point estimate to yield lo/hi.
//
// TWO INDEPENDENT ± IN THIS ENGINE — do not conflate them.
//
//   1. `savings_band_pct` (this function's input) — RELATIVE band on the
//      point ahorro, editorial per cohort. Reflects overall confidence in
//      the achievable BENCHMARK for that (provider|region) — table drift,
//      mix of card types, tickets, cross-border modeling gaps, all rolled
//      into one number. Verified rows carry 0.20 (±20% relative). Fallback
//      rows carry 0.35 (±35%). This is the band the UI shows around the
//      point savings.
//
//   2. `processor_margin_band_bps` (lives inside `achievable_breakdown_json`,
//      formatted by ACHIEVABLE_NOTE) — ABSOLUTE band on the processor-margin
//      COMPONENT of the achievable rate composition, in bps. Reflects how
//      much a well-negotiated processor margin varies for that cohort.
//      Only meaningful ABOUT the achievable breakdown; NEVER used to scale
//      savings.
//
// The two bands measure different quantities and are not designed to
// reconcile. The engine emits both, the UI shows both, and the copy in
// ACHIEVABLE_NOTE plus the contextual line rendered under the assumptions
// list in AssumptionsFootnote.jsx makes the distinction explicit for the
// merchant. Any future attempt to derive one from the other should first
// revisit Decision_Log 2026-07-10 M3.6 — the trade-offs were argued once
// and this is the sealed outcome.
function applyBand(point, band_pct) {
  const half = point * band_pct;
  return {
    lo: Math.max(0, point - half),
    point,
    hi: point + half,
  };
}

// ─── Assumption strings ──────────────────────────────────────────────────────

// The assumption strings are part of the engine's OUTPUT contract — the UI
// renders them verbatim in the results screen. Keep the wording auditable:
// no marketing claims, no numbers that aren't derived from the input or the
// verified row.
const FALLBACK_ASSUMPTION =
  "Estimate based on regional averages, not provider-verified rates. Connect your PSP for exact figures.";

// Emitted when the selected row lacks a modeled intl uplift and the merchant
// has intl_pct > 0 — makes it explicit that cross-border volume is present
// but the cohort has no source-quoted uplift, so the engine leaves it out
// rather than inventing a rate.
const INTL_UPLIFT_NOT_MODELED_ASSUMPTION =
  "Cross-border card uplift not modeled for this provider/region cohort — the published cross-border rate for this PSP is not seeded. Effective savings for the intl portion of GMV may be understated. Connect your PSP for exact figures.";

const AMORTIZATION_NOTE = (fixedMinor, currency, avgTicket) =>
  `Fixed fee of ${(fixedMinor / MINOR_PER_MAJOR).toFixed(2)} ${currency} amortized over an average ticket of €${avgTicket.toFixed(2)}.`;

const ACHIEVABLE_NOTE = (breakdown) => {
  if (!breakdown) return null;
  const { interchange_bps, scheme_fees_bps, processor_margin_bps, processor_margin_band_bps } = breakdown;
  // The trailing "(±N bps assumption)" pattern MUST be preserved — it is
  // parsed by FeeBreakdownCard.parseAchievableBreakdown() with a regex that
  // matches this exact shape. The clarifying sentence that follows is FREE
  // text (not parsed) and is what separates the two ± in the product
  // (see applyBand docstring). If you rewrite this string, run the
  // "ACHIEVABLE_NOTE stays parseable by FeeBreakdownCard" contract test.
  return (
    `Achievable rate composition: interchange ${interchange_bps} bps + scheme fees ${scheme_fees_bps} bps + ` +
    `assumed processor margin ${processor_margin_bps} bps (±${processor_margin_band_bps} bps assumption). ` +
    `The ± applies to that component of the achievable rate only — separate from the savings range, which reflects overall confidence in the benchmark for this cohort.`
  );
};

// Emitted only when intl_pct > 0 AND the row carries a modeled uplift. Both
// numbers come from the row (never from code) — the engine only formats them.
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

// ─── Public entry point ──────────────────────────────────────────────────────

// calculateGap — the single function the backend endpoint wraps.
//
// Contract:
//   input: {
//     monthly_gmv_eur: number > 0,
//     avg_ticket_eur:  number > 0,
//     region:          'EU' | 'UK' | 'US' | 'RoW',    (unknown → 'RoW')
//     provider_slug:   'stripe' | 'paypal' | 'shopify_payments' | ...,
//     intl_pct:        0..100                          (default 0)
//   }
//   rateTable: array of PaymentsRateTable rows (as returned by base44 SDK)
//
// Returns:
//   { ok: false, error: 'rate_table_incomplete', missing: [...] }  // caller must refuse
//   { ok: false, error: '<validation_reason>' }                     // input malformed
//   { ok: true,
//     current_effective_bps, achievable_effective_bps,
//     monthly_savings_eur:  { lo, point, hi },
//     annual_savings_eur:   { lo, point, hi },
//     cohort: { key, verified, matched },
//     assumptions: [ ...strings... ]
//   }
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
    // Defensive — validateRateTable already guarantees the regional fallback.
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
  // Achievable-side intl_pct: prefer measured when present, else form value.
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

  // Achievable — use row's achievable components if present, else fall back
  // to the current row's own atomic components (i.e. "no measurable gap").
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

// Exports used by tests and by the Deno endpoint's parity layer.
export {
  calculateGap,
  validateRateTable,
  normalizeInput,
  selectRow,
  computeEffectiveBps,
  computeMonthlySavings,
  applyBand,
  REQUIRED_FALLBACK_KEYS,
  KNOWN_PROVIDERS,
  FALLBACK_ASSUMPTION,
  INTL_UPLIFT_NOT_MODELED_ASSUMPTION,
  ENGINE_VERSION,
};