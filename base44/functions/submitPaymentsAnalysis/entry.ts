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
  return { lo: Math.max(0, point - half), point, hi: point + half };
}

const FALLBACK_ASSUMPTION = "Estimate based on regional averages, not provider-verified rates. Connect your PSP for exact figures.";

const INTL_UPLIFT_NOT_MODELED_ASSUMPTION = "Cross-border card uplift not modeled for this provider/region cohort — the published cross-border rate for this PSP is not seeded. Effective savings for the intl portion of GMV may be understated. Connect your PSP for exact figures.";

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