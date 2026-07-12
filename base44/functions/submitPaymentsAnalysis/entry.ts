// submitPaymentsAnalysis — public anonymous endpoint that runs the payments
// gap engine for a merchant, without requiring authentication.
//
// Chunk 3 scope (as approved):
//   - Anonymous POST — no auth required.
//   - Rate-limit 10/hour/IP via RateLimitCounter (principal_id per-endpoint,
//     ip_hashed with a DERIVED salt — see IP_SALT below). Env override:
//     PAYMENTS_ANALYSIS_RATE_LIMIT_PER_HOUR.
//   - Hard-range validation per contract §2.1. No silent clamping — out of
//     range → 400 with { error, field, reason } naming the offending field.
//   - Runs the engine IN-PROCESS via a verbatim SYNC-block copy of
//     src/lib/paymentsGap.js (see block below). The former HTTP endpoint
//     calculatePaymentsGap was DELETED on 2026-07-09: Base44 functions don't
//     share a service token, so an anonymous public endpoint couldn't
//     legitimately pass LOCK #1 to reach it. In this platform, shared engine
//     logic across functions = inline copy + sync-check test enforcement,
//     NOT inter-function HTTP calls. This is the pattern the future Fase 6
//     bridge (verified path) must follow too.
//   - Persists a PaymentsAnalysisSession row so Chunk 5's teaser can recover
//     the result later by anon_session_id (URL-shareable).
//
// Explicitly OUT OF SCOPE for Chunk 3: claim flow, email capture, frontend,
// TTL purge job (deferred to Chunk 6 as agreed).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── SYNC block — verbatim copy of src/lib/paymentsGap.js ───────────────────
// Base44 functions cannot share code via imports and do not share a service
// token across functions. Consequences:
//   1. Anonymous callers have no bearer token, so an inter-function fetch
//      would die at any auth gate on the callee side (LOCK #1 pattern).
//   2. Even authenticated callers gain nothing from inter-function HTTP for
//      pure math: extra latency, extra failure surface, no isolation benefit.
// So the platform-supported pattern for sharing engine logic across functions
// is: INLINE COPY + sync-check test enforcement. The former HTTP endpoint
// calculatePaymentsGap was deleted on 2026-07-09 for this reason. The
// sync-check pair in src/lib/syncEngine/__sync_check__.test.js guarantees the
// two remaining copies (src/lib/paymentsGap.js + this file) stay byte-normalized
// identical between edits.

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
// payments-gap-1.4.0 (Fase 2A-redo, 2026-07-12) — IN-STORE CHANNEL. Adds
// `channel` dimension to cohort selection ("online" | "in_store"). Every
// rate-table row now carries a channel. selectRow cascade: exact online
// stays byte-identical for pre-1.4.0 callers (no `channel` in input →
// default 'online', 3-segment legacy keys still recognized as online).
// in_store adds terminal-rental amortization (fixed monthly rental spread
// over monthly_gmv), a distinct MEASURED note (invoices/months vs
// charges/days), and 4 new required fallback keys for the in-store side.
// Retrocompat oracle: FR/EU/Stripe/GMV€1M/ticket€50/intl15% (no channel)
// must produce 2.26%/1.50%/€6140-€9210 on 1.4.0 too (verified empirically
// in Decision_Log 2026-07-12 Fase 2A-redo entry).
const ENGINE_VERSION = "payments-gap-1.4.0";

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
  // Online fallbacks — 3-segment legacy shape kept verbatim. Every seeded row
  // for these keys carries channel='online', but validateRateTable checks by
  // literal cohort_key equality so the 3-segment key stays canonical for the
  // online path (byte-identical to pre-1.4.0). NEVER migrate these to the
  // 4-segment shape "ANY|ANY|<region>|online" — you'd break every historical
  // session that was persisted with these keys.
  "ANY|ANY|EU",
  "ANY|ANY|UK",
  "ANY|ANY|US",
  "ANY|ANY|RoW",
  // In-store fallbacks — 4-segment. Introduced in 1.4.0 with the channel
  // dimension. Their absence means the engine refuses (rate_table_incomplete)
  // for any in-store lookup, which is the safe behavior — no silent fallback
  // to an online rate for a physical-terminal cohort.
  "ANY|ANY|EU|in_store",
  "ANY|ANY|UK|in_store",
  "ANY|ANY|US|in_store",
  "ANY|ANY|RoW|in_store",
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
const KNOWN_PROVIDERS = new Set([
  // Online (pre-M4)
  "stripe", "paypal", "shopify_payments",
  // In-store (M4-TPV Fase 2A-redo, 2026-07-12) — slugs that have a verified
  // in-store row seeded in PaymentsRateTable. 'sumup' is DUAL-CHANNEL: the
  // engine segments by (provider_slug, channel), so sumup+online resolves to
  // the regional fallback (no verified online sumup row exists) and
  // sumup+in_store hits the verified in-store row. No cross-channel leakage.
  "sumup", "stripe_terminal", "smile_and_pay", "zettle",
]);

// M4-TPV Fase 2A-redo — channels the engine understands. Default 'online'
// preserves pre-M4 behavior byte-identically: normalizeInput assigns 'online'
// when input.channel is missing/unknown, and selectRow's cascade recognizes
// legacy 3-segment cohort_keys ("<provider>|ANY|<region>") as online rows.
const KNOWN_CHANNELS = new Set(["online", "in_store"]);

// M4-TPV Fase 2A-redo — default channel when input omits it. Kept as a named
// const rather than an inline literal so a future migration to a different
// default (unlikely, but auditable) touches one place, not scattered branches.
const DEFAULT_CHANNEL = "online";

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
  // M4-TPV Fase 2A-redo — channel normalization. Missing/unknown → DEFAULT_CHANNEL
  // ('online'). This is the retrocompat lock: pre-1.4.0 callers that don't send
  // `channel` land on the exact same 'online' branch as before.
  const channelRaw = typeof raw.channel === "string" ? raw.channel.trim().toLowerCase() : "";
  const channel = KNOWN_CHANNELS.has(channelRaw) ? channelRaw : DEFAULT_CHANNEL;
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
      channel,
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

// Look up the best rate-table row for (provider_slug, region, channel).
//
// M4-TPV Fase 2A-redo — channel-aware cascade. Two shapes coexist:
//
//   ONLINE (channel='online', or channel omitted → DEFAULT_CHANNEL):
//     1. exact:    "<provider>|ANY|<region>"                (3-segment, LEGACY)
//     2. exact_v4: "<provider>|ANY|<region>|online"         (4-segment, NEW)
//     3. fallback: "ANY|ANY|<region>"                       (3-segment, LEGACY)
//     4. fallback_v4: "ANY|ANY|<region>|online"             (4-segment, NEW)
//
//   IN-STORE (channel='in_store'):
//     1. exact:    "<provider>|ANY|<region>|in_store"       (4-segment)
//     2. fallback: "ANY|ANY|<region>|in_store"              (4-segment)
//
// Retrocompat lock: online lookups still match the LEGACY 3-segment keys
// FIRST. Every existing online row keeps working byte-identically without
// any migration of cohort_key. If someone later seeds a 4-segment online
// row for the same provider/region, THAT is a data-drift bug (would cause
// non-determinism), not something the engine needs to reconcile — the
// seeder is the single source of truth for cohort_key uniqueness.
//
// Never returns null when the table passed validateRateTable — the regional
// fallback for the requested channel is guaranteed to exist (validateRateTable
// enforces all 8 REQUIRED_FALLBACK_KEYS in 1.4.0).
function selectRow(rows, provider_slug, region, channel) {
  const ch = KNOWN_CHANNELS.has(channel) ? channel : DEFAULT_CHANNEL;
  const isOnline = ch === "online";

  // Build the ordered list of candidate keys (highest-priority first).
  const candidates = [];
  if (isOnline) {
    // Prefer LEGACY 3-segment keys so pre-1.4.0 seeded rows match verbatim
    // (retrocompat lock — never reorder these first two).
    if (KNOWN_PROVIDERS.has(provider_slug)) {
      candidates.push({ key: `${provider_slug}|ANY|${region}`,          matched: "exact" });
      candidates.push({ key: `${provider_slug}|ANY|${region}|online`,   matched: "exact" });
    }
    candidates.push({ key: `ANY|ANY|${region}`,                          matched: "fallback" });
    candidates.push({ key: `ANY|ANY|${region}|online`,                   matched: "fallback" });
  } else {
    // in_store: only 4-segment keys. No legacy path — the channel didn't
    // exist before 1.4.0, so there's nothing to be retrocompatible with.
    if (KNOWN_PROVIDERS.has(provider_slug)) {
      candidates.push({ key: `${provider_slug}|ANY|${region}|in_store`, matched: "exact" });
    }
    candidates.push({ key: `ANY|ANY|${region}|in_store`,                 matched: "fallback" });
  }

  // Index the table once, then walk candidates in priority order.
  const byKey = new Map();
  for (const r of rows) {
    if (!r || r.active === false) continue;
    if (typeof r.cohort_key === "string") byKey.set(r.cohort_key, r);
  }
  for (const cand of candidates) {
    const row = byKey.get(cand.key);
    if (row) return { row, matched: cand.matched };
  }
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
  { percent_bps, fixed_fee_minor_units, terminal_rental_monthly_minor },
  avg_ticket_eur,
  { intl_pct = 0, intl_uplift_bps = 0, monthly_gmv_eur = 0 } = {}
) {
  const fixedMajor = fixed_fee_minor_units / MINOR_PER_MAJOR;
  const amortizedBps = (fixedMajor / avg_ticket_eur) * BPS_PER_UNIT;
  const upliftBps = isFinite(intl_uplift_bps) ? intl_uplift_bps : 0;
  const intlBps = (intl_pct / 100) * upliftBps;
  // M4-TPV Fase 2A-redo — terminal-rental amortization for in-store rows.
  // Traditional bank acquirers charge a fixed monthly rental (€15-40) that
  // sits on top of the per-transaction fees. Modern TPVs (SumUp, Zettle,
  // Stripe Terminal, Smile&Pay) sell hardware one-off with no rental → 0.
  // We amortize monthly rental over monthly GMV to express it in bps:
  //   rental_bps = (rental_major / monthly_gmv_eur) × 10000
  //
  // Retrocompat lock: online rows do NOT carry terminal_rental_monthly_minor,
  // so the field is undefined and rentalBps stays 0 → byte-identical to
  // pre-1.4.0 for every online caller. Even if a future online row
  // accidentally seeds a non-null rental, monthly_gmv_eur=0 (the default
  // when the caller omits it, which happens on every online path today)
  // ALSO produces rentalBps=0 (division-by-zero guarded below). Belt AND
  // suspenders — the retrocompat oracle depends on this line.
  const rentalMinor = isFinite(Number(terminal_rental_monthly_minor)) ? Number(terminal_rental_monthly_minor) : 0;
  const rentalMajor = rentalMinor / MINOR_PER_MAJOR;
  const rentalBps = (rentalMajor > 0 && monthly_gmv_eur > 0)
    ? (rentalMajor / monthly_gmv_eur) * BPS_PER_UNIT
    : 0;
  return percent_bps + intlBps + amortizedBps + rentalBps;
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

// M4-TPV Fase 2A-redo — in-store only. Emitted when a rate row carries a
// non-zero terminal_rental_monthly_minor AND the merchant has monthly GMV
// present. The rental (fixed €/month) is spread across GMV, so the note
// makes the merchant's own volume visible in the rate — otherwise a low-GMV
// in-store merchant sees a surprisingly high effective rate with no
// explanation.
const TERMINAL_RENTAL_NOTE = (rentalMinor, currency, monthlyGmv) =>
  `Monthly terminal rental of ${(rentalMinor / MINOR_PER_MAJOR).toFixed(2)} ${currency} amortized over €${monthlyGmv.toFixed(2)} of monthly card volume.`;

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

  const { row, matched } = selectRow(rateTable, input.provider_slug, input.region, input.channel);
  if (!row) {
    // Defensive — validateRateTable already guarantees the regional fallback.
    // The missing-key hint uses the 4-segment shape only for in_store lookups
    // (where 4-segment is the canonical shape); online falls back to the
    // 3-segment legacy shape it always used.
    const missKey = input.channel === "in_store"
      ? `ANY|ANY|${input.region}|in_store`
      : `ANY|ANY|${input.region}`;
    return { ok: false, error: "rate_table_incomplete", missing: [missKey] };
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
        {
          percent_bps: row.percent_bps,
          fixed_fee_minor_units: row.fixed_fee_minor_units,
          // M4-TPV Fase 2A-redo — undefined on online rows → rentalBps=0
          // inside computeEffectiveBps → byte-identical to pre-1.4.0.
          terminal_rental_monthly_minor: row.terminal_rental_monthly_minor,
        },
        input.avg_ticket_eur,
        {
          intl_pct: input.intl_pct,
          intl_uplift_bps: rowCurrentUplift,
          monthly_gmv_eur: input.monthly_gmv_eur,
        }
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
          // Achievable rental — on all seeded in-store rows this is 0
          // (assumes migration to a modern TPV with no rental). Field is
          // OPTIONAL on the schema — future negotiated tiers may set a
          // non-zero achievable rental. Missing → 0 → byte-identical online.
          terminal_rental_monthly_minor: row.achievable_terminal_rental_monthly_minor,
        },
        input.avg_ticket_eur,
        {
          intl_pct: achievableIntlPct,
          intl_uplift_bps: rowAchievableUplift,
          monthly_gmv_eur: input.monthly_gmv_eur,
        }
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
    // M4-TPV Fase 2A-redo — mirror the estimated-path rental note. On the
    // verified path the achievable side is still composed from the table,
    // so if the row's ACHIEVABLE rental is set (rare — all seeded rows are
    // 0), we amortize it and emit a note. Same gate as estimated: rental > 0
    // AND monthly_gmv_eur > 0.
    const rentalMinorAch = Number(row.achievable_terminal_rental_monthly_minor);
    if (isFinite(rentalMinorAch) && rentalMinorAch > 0 && input.monthly_gmv_eur > 0) {
      assumptions.push(TERMINAL_RENTAL_NOTE(rentalMinorAch, row.fixed_fee_currency, input.monthly_gmv_eur));
    }
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
    // Estimated path — 1.2.0 behavior verbatim for online rows (rental fields
    // absent → no rental note emitted). In-store rows may carry a non-zero
    // terminal_rental_monthly_minor → emit a dedicated rental note so the
    // merchant sees where that portion of the rate comes from.
    assumptions.push(
      AMORTIZATION_NOTE(row.fixed_fee_minor_units, row.fixed_fee_currency, input.avg_ticket_eur)
    );
    // M4-TPV Fase 2A-redo — emit rental note when the row carries a non-zero
    // monthly rental AND the merchant declared monthly GMV. This gates the
    // note on both signals to avoid a nonsensical amortization message on
    // rows where rental is null/0 or GMV is 0.
    const rentalMinor = Number(row.terminal_rental_monthly_minor);
    if (isFinite(rentalMinor) && rentalMinor > 0 && input.monthly_gmv_eur > 0) {
      assumptions.push(TERMINAL_RENTAL_NOTE(rentalMinor, row.fixed_fee_currency, input.monthly_gmv_eur));
    }
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
      // M4-TPV Fase 2A-redo — surface the channel to the UI (Results pill).
      // Derived from the row itself when present (canonical), else from the
      // input (which normalizeInput already defaulted to 'online'). Legacy
      // 3-segment rows have row.channel undefined → we fall to input.channel,
      // which is 'online'. Retrocompat lock: an online caller reading the
      // output on 1.4.0 sees channel='online' — no undefined leaking to UI.
      channel: (typeof row.channel === "string" && KNOWN_CHANNELS.has(row.channel))
        ? row.channel
        : input.channel,
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

// ─── Validation constants — hard contract §2.1, no silent clamping ──────────
// The engine's own normalizeInput() is more permissive (it accepts any
// positive number) because the engine is a pure math box. Endpoint-level
// validation enforces the PRODUCT contract: the ranges below are the ones
// the UI (Chunk 4) will bound sliders to. Anything outside means the caller
// bypassed the UI — refuse rather than compute a nonsense figure.

const VALIDATION = {
  monthly_gmv_eur: { min: 500,      max: 10_000_000 },
  avg_ticket_eur:  { min: 5,        max: 5_000 },
  intl_pct:        { min: 0,        max: 100 },
  card_mix_debit_pct: { min: 0,     max: 100 }, // optional; validated only when present
  brand_name:      { minLen: 2,     maxLen: 80 },
  website:         { maxLen: 200 },              // optional
};

// Sector enum — VERBATIM copy of BRAND_SECTOR_SLUGS in
// src/components/paymentsAnalyzer/BrandBlock.jsx. Kept in sync by the contract
// test in src/pages/__contracts__/analyzerResultsHandoff.test.js.
const ALLOWED_SECTOR_SLUGS = [
  'fashion',
  'beauty',
  'food_beverage',
  'home_living',
  'electronics',
  'health_wellness',
  'other',
] as const;
const ALLOWED_SECTOR_SET = new Set<string>(ALLOWED_SECTOR_SLUGS);

// Provider slug enum — SINGLE SOURCE for the Chunk 4 form selector.
// Order + slugs must be reproduced verbatim in the UI (do NOT reorder or
// rename in the frontend). Slugs with no verified row in PaymentsRateTable
// (adyen, mollie, checkout_com, sumup, other) fall cleanly to the regional
// fallback inside selectRow() — confirmed empirically against the seeded
// table on 2026-07-09: seeded verified rows exist only for stripe, paypal,
// shopify_payments; the engine's KNOWN_PROVIDERS set gates exactly these
// three, so every other slug in this enum matches ANY|ANY|<region> without
// ever accidentally borrowing a stripe/paypal/shopify_payments row.
const ALLOWED_PROVIDER_SLUGS = [
  // Online providers (unchanged from pre-M4).
  'stripe',
  'paypal',
  'shopify_payments',
  'adyen',
  'mollie',
  'checkout_com',
  'sumup',
  // M4-TPV Fase 2B — in-store TPV providers. Mirror the 4 verified in-store
  // seed rows. 'sumup' is DUAL-CHANNEL (already listed above): the engine
  // segments by (provider_slug, channel), so sumup online resolves to the
  // regional fallback (no verified online sumup row exists) and sumup in_store
  // hits the verified in-store row. This is safe — no cross-channel leakage.
  'stripe_terminal',
  'smile_and_pay',
  'zettle',
  'other',
] as const;
const ALLOWED_PROVIDER_SET = new Set<string>(ALLOWED_PROVIDER_SLUGS);

// M4-TPV Fase 2B — channel enum. Default 'online' preserves pre-M4 behavior:
// callers that omit the field get byte-identical results to v1.3.0.
const ALLOWED_CHANNELS = new Set<string>(['online', 'in_store']);

// Country → region mapping. Region is DERIVED server-side from country; the
// caller only provides country. This prevents the client from picking a region
// that mismatches their country and cherry-picking a friendlier fallback row.
const EU_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
  // Included as EU-adjacent for payments purposes (EEA / SEPA):
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

// ─── Website normalization ──────────────────────────────────────────────────
// Accepts inputs like "aimestudio.com", "www.aimestudio.com",
// "https://aimestudio.com/shop", "http://…" and reduces to a bare hostname
// (lowercase, no protocol, no path, no www.). We normalize server-side so:
//   1. Lead intelligence has a stable join key across sessions.
//   2. The stored value never leaks a full URL with query params/PII.
//   3. Downstream auto-detection can hit `https://<hostname>` deterministically.
// Returns null on unrecoverable garbage (spaces, no dot, no host).
function normalizeWebsite(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (s === '') return null;
  if (/\s/.test(s)) return null;
  // Strip protocol if present.
  s = s.replace(/^https?:\/\//i, '');
  // Strip path / query / fragment.
  s = s.split('/')[0].split('?')[0].split('#')[0];
  // Strip leading www.
  s = s.replace(/^www\./i, '');
  s = s.toLowerCase();
  // Sanity: needs at least one dot, at least 3 chars total, only URL-safe host chars.
  if (s.length < 3) return null;
  if (!s.includes('.')) return null;
  if (!/^[a-z0-9.-]+$/.test(s)) return null;
  // Reject leading/trailing dot or hyphen.
  if (/^[-.]|[-.]$/.test(s)) return null;
  return s;
}

// ─── IP salt derivation — decoupled from BENCHMARK_ANON_SALT ────────────────
// We derive a per-domain salt from the raw benchmark salt with a fixed suffix.
// Rotating the benchmark salt would break historical benchmark pseudonyms
// (permanent, on purpose). We do NOT want that same immutability to bind
// rate-limit hashes: those are transient. Deriving IP_SALT once at boot,
// keyed by ':ip-hashing', gives us a stable-during-runtime salt for IP hashing
// that lives in a separate domain from benchmarks. Both salts can rotate
// independently in the future without touching each other's history.
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let _ipSaltCache: string | null = null;
async function getIpSalt(): Promise<string> {
  if (_ipSaltCache) return _ipSaltCache;
  const raw = Deno.env.get('BENCHMARK_ANON_SALT') || '';
  if (!raw) throw new Error('missing_benchmark_anon_salt');
  _ipSaltCache = await sha256Hex(raw + ':ip-hashing');
  return _ipSaltCache;
}

async function hashIp(ip: string): Promise<string> {
  const salt = await getIpSalt();
  return sha256Hex(salt + ':' + ip);
}

function extractClientIp(req: Request): string {
  // Trust the standard forwarding chain the platform sets. Falls back to a
  // literal 'unknown' bucket so rate-limiting still applies (all unknowns
  // share a bucket — that's the point; better than letting them bypass).
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

// ─── Rate limit — hourly bucket via RateLimitCounter ────────────────────────
// principal_id namespacing: 'submitPaymentsAnalysis:<ip_hash>'. The ip_hash
// uses the DERIVED IP_SALT (see above). We reuse the existing RateLimitCounter
// entity (originally designed for per-minute buckets, but its shape —
// principal_id + window_start + count — works fine for hourly buckets: we
// simply set window_start to the top of the current UTC hour, and filter on
// (principal_id, window_start) to find/increment the row for this bucket.
async function checkAndIncrementRateLimit(
  base44: any,
  ipHash: string,
  limitPerHour: number,
): Promise<{ ok: boolean; remaining: number; retry_after_seconds?: number }> {
  const now = new Date();
  const hourStart = new Date(now);
  hourStart.setUTCMinutes(0, 0, 0);
  const window_start = hourStart.toISOString();
  const principal_id = `submitPaymentsAnalysis:${ipHash}`;

  const existing = await base44.asServiceRole.entities.RateLimitCounter.filter({ principal_id, window_start });
  const current = existing?.[0];
  const count = current ? (current.count || 0) : 0;

  if (count >= limitPerHour) {
    const nextHour = new Date(hourStart);
    nextHour.setUTCHours(hourStart.getUTCHours() + 1);
    return { ok: false, remaining: 0, retry_after_seconds: Math.ceil((nextHour.getTime() - now.getTime()) / 1000) };
  }

  if (current) {
    await base44.asServiceRole.entities.RateLimitCounter.update(current.id, { count: count + 1 });
  } else {
    await base44.asServiceRole.entities.RateLimitCounter.create({
      principal_id,
      principal_type: 'ip',
      window_start,
      count: 1,
      limit_per_minute: limitPerHour,
    });
  }
  return { ok: true, remaining: limitPerHour - (count + 1) };
}

// ─── Input validation — hard ranges, no clamp ───────────────────────────────
type ValidationFailure = { field: string; reason: 'missing' | 'out_of_range' | 'not_in_enum' | 'invalid_type' };

function validateInput(raw: any): { ok: true; clean: any } | { ok: false; failure: ValidationFailure } {
  if (!raw || typeof raw !== 'object') return { ok: false, failure: { field: 'body', reason: 'invalid_type' } };

  // monthly_gmv_eur — required
  const gmv = Number(raw.monthly_gmv_eur);
  if (raw.monthly_gmv_eur === undefined || raw.monthly_gmv_eur === null || raw.monthly_gmv_eur === '') return { ok: false, failure: { field: 'monthly_gmv_eur', reason: 'missing' } };
  if (!isFinite(gmv)) return { ok: false, failure: { field: 'monthly_gmv_eur', reason: 'invalid_type' } };
  if (gmv < VALIDATION.monthly_gmv_eur.min || gmv > VALIDATION.monthly_gmv_eur.max) return { ok: false, failure: { field: 'monthly_gmv_eur', reason: 'out_of_range' } };

  // avg_ticket_eur — required
  const ticket = Number(raw.avg_ticket_eur);
  if (raw.avg_ticket_eur === undefined || raw.avg_ticket_eur === null || raw.avg_ticket_eur === '') return { ok: false, failure: { field: 'avg_ticket_eur', reason: 'missing' } };
  if (!isFinite(ticket)) return { ok: false, failure: { field: 'avg_ticket_eur', reason: 'invalid_type' } };
  if (ticket < VALIDATION.avg_ticket_eur.min || ticket > VALIDATION.avg_ticket_eur.max) return { ok: false, failure: { field: 'avg_ticket_eur', reason: 'out_of_range' } };

  // intl_pct — required (0 is a valid input, so we require the field but accept 0)
  if (raw.intl_pct === undefined || raw.intl_pct === null || raw.intl_pct === '') return { ok: false, failure: { field: 'intl_pct', reason: 'missing' } };
  const intl = Number(raw.intl_pct);
  if (!isFinite(intl)) return { ok: false, failure: { field: 'intl_pct', reason: 'invalid_type' } };
  if (intl < VALIDATION.intl_pct.min || intl > VALIDATION.intl_pct.max) return { ok: false, failure: { field: 'intl_pct', reason: 'out_of_range' } };

  // provider_slug — required, enum
  const provider = typeof raw.provider_slug === 'string' ? raw.provider_slug.trim().toLowerCase() : '';
  if (!provider) return { ok: false, failure: { field: 'provider_slug', reason: 'missing' } };
  if (!ALLOWED_PROVIDER_SET.has(provider)) return { ok: false, failure: { field: 'provider_slug', reason: 'not_in_enum' } };

  // country — required, ISO-3166-1 alpha-2
  const country = typeof raw.country === 'string' ? raw.country.trim().toUpperCase() : '';
  if (!country) return { ok: false, failure: { field: 'country', reason: 'missing' } };
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, failure: { field: 'country', reason: 'invalid_type' } };

  // channel — optional, default 'online'. When present must be in the enum.
  // Reserving 'online' as the default ensures pre-M4 callers (no channel in
  // payload) produce byte-identical results to v1.3.0 for the online cohort.
  let channel: 'online' | 'in_store' = 'online';
  if (raw.channel !== undefined && raw.channel !== null && raw.channel !== '') {
    const chRaw = typeof raw.channel === 'string' ? raw.channel.trim().toLowerCase() : '';
    if (!ALLOWED_CHANNELS.has(chRaw)) return { ok: false, failure: { field: 'channel', reason: 'not_in_enum' } };
    channel = chRaw as 'online' | 'in_store';
  }

  // card_mix_debit_pct — optional
  let card_mix_debit_pct: number | undefined = undefined;
  if (raw.card_mix_debit_pct !== undefined && raw.card_mix_debit_pct !== null && raw.card_mix_debit_pct !== '') {
    const debit = Number(raw.card_mix_debit_pct);
    if (!isFinite(debit)) return { ok: false, failure: { field: 'card_mix_debit_pct', reason: 'invalid_type' } };
    if (debit < VALIDATION.card_mix_debit_pct.min || debit > VALIDATION.card_mix_debit_pct.max) return { ok: false, failure: { field: 'card_mix_debit_pct', reason: 'out_of_range' } };
    card_mix_debit_pct = debit;
  }

  // brand_name — required (2-80 chars after trim).
  const brand_name_raw = typeof raw.brand_name === 'string' ? raw.brand_name.trim() : '';
  if (!brand_name_raw) return { ok: false, failure: { field: 'brand_name', reason: 'missing' } };
  if (brand_name_raw.length < VALIDATION.brand_name.minLen || brand_name_raw.length > VALIDATION.brand_name.maxLen) {
    return { ok: false, failure: { field: 'brand_name', reason: 'out_of_range' } };
  }

  // website — optional; normalized to bare hostname. Non-empty garbage is
  // rejected rather than silently dropped so the client can course-correct.
  let website: string | undefined = undefined;
  if (raw.website !== undefined && raw.website !== null && raw.website !== '') {
    if (typeof raw.website !== 'string') return { ok: false, failure: { field: 'website', reason: 'invalid_type' } };
    if (raw.website.length > VALIDATION.website.maxLen) return { ok: false, failure: { field: 'website', reason: 'out_of_range' } };
    const normalized = normalizeWebsite(raw.website);
    if (!normalized) return { ok: false, failure: { field: 'website', reason: 'invalid_type' } };
    website = normalized;
  }

  // sector — optional; must be in the shared enum when present.
  let sector: string | undefined = undefined;
  if (raw.sector !== undefined && raw.sector !== null && raw.sector !== '') {
    if (typeof raw.sector !== 'string') return { ok: false, failure: { field: 'sector', reason: 'invalid_type' } };
    const s = raw.sector.trim().toLowerCase();
    if (!ALLOWED_SECTOR_SET.has(s)) return { ok: false, failure: { field: 'sector', reason: 'not_in_enum' } };
    sector = s;
  }

  const region = countryToRegion(country);

  return {
    ok: true,
    clean: {
      monthly_gmv_eur: gmv,
      avg_ticket_eur: ticket,
      intl_pct: intl,
      provider_slug: provider,
      country,
      region,
      channel,
      brand_name: brand_name_raw,
      ...(card_mix_debit_pct !== undefined ? { card_mix_debit_pct } : {}),
      ...(website !== undefined ? { website } : {}),
      ...(sector !== undefined ? { sector } : {}),
    },
  };
}

// ─── Rate table loader ──────────────────────────────────────────────────────
// Anonymous callers can't invoke calculatePaymentsGap over HTTP (no bearer to
// forward), so we run the engine in-process using the SYNC-block copy above
// and load the rate table directly with asServiceRole (the anonymous request
// path here doesn't need per-user RLS because PaymentsRateTable rows are
// public knowledge — verified pricing pages).
async function loadRateTable(base44: any): Promise<{ ok: boolean; rows?: any[]; error?: string; missing?: string[] }> {
  let rows = await base44.asServiceRole.entities.PaymentsRateTable.list('-created_date', 500);
  let check = validateRateTable(rows);
  if (!check.ok) {
    // Same eventual-consistency retry as the HTTP endpoint uses.
    await new Promise((r) => setTimeout(r, 400));
    rows = await base44.asServiceRole.entities.PaymentsRateTable.list('-created_date', 500);
    check = validateRateTable(rows);
  }
  if (!check.ok) return { ok: false, error: check.reason, missing: check.missing };
  return { ok: true, rows };
}

// ─── HTTP handler ───────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Parse body first — cheap rejection before any DB call.
    let raw: any = null;
    try {
      raw = await req.json();
    } catch {
      return Response.json({ error: 'invalid_json_body' }, { status: 400 });
    }

    // Validate.
    const v = validateInput(raw);
    if (!v.ok) {
      return Response.json({ error: 'invalid_input', field: v.failure.field, reason: v.failure.reason }, { status: 400 });
    }

    // IP → hash → rate limit.
    const ip = extractClientIp(req);
    const ipHash = await hashIp(ip);
    const limitPerHour = Number(Deno.env.get('PAYMENTS_ANALYSIS_RATE_LIMIT_PER_HOUR') || 10);
    const rl = await checkAndIncrementRateLimit(base44, ipHash, limitPerHour);
    if (!rl.ok) {
      return Response.json({ error: 'rate_limited', retry_after_seconds: rl.retry_after_seconds }, { status: 429 });
    }

    // Load rate table + run engine in-process.
    const table = await loadRateTable(base44);
    if (!table.ok) {
      console.error('submitPaymentsAnalysis rate table error:', table.error, table.missing);
      return Response.json({ error: 'engine_unavailable' }, { status: 503 });
    }
    // Engine input is a strict subset of v.clean — brand_name / website /
    // sector are session metadata for lead intelligence, NEVER engine inputs
    // (they don't affect the savings calculation, and mixing them in would
    // silently drift the sync-check block from src/lib/paymentsGap.js).
    const engineInput = {
      monthly_gmv_eur: v.clean.monthly_gmv_eur,
      avg_ticket_eur: v.clean.avg_ticket_eur,
      region: v.clean.region,
      provider_slug: v.clean.provider_slug,
      intl_pct: v.clean.intl_pct,
      // M4-TPV Fase 2B — channel threads through to the engine (v1.4.0).
      // Default 'online' when the caller omits it is set in validateInput.
      channel: v.clean.channel,
    };
    const engineResult = calculateGap(engineInput, table.rows!);
    if (!engineResult.ok) {
      console.error('submitPaymentsAnalysis engine returned not-ok:', engineResult);
      return Response.json({ error: 'engine_error' }, { status: 502 });
    }

    // Persist session.
    const anon_session_id = crypto.randomUUID();
    await base44.asServiceRole.entities.PaymentsAnalysisSession.create({
      anon_session_id,
      input_snapshot: v.clean,
      engine_result: engineResult,
      engine_version: engineResult.engine_version,
      ip_hash: ipHash,
    });

    return Response.json({
      ok: true,
      anon_session_id,
      engine_result: engineResult,
    });
  } catch (error) {
    console.error('submitPaymentsAnalysis:', (error as any)?.message, (error as any)?.stack);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
});