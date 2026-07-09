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

const ENGINE_VERSION = "v1";

const MINOR_PER_MAJOR = 100;

const BPS_PER_PCT = 100;
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
  return {
    ok: true,
    input: {
      monthly_gmv_eur,
      avg_ticket_eur,
      region,
      provider_slug,
      intl_pct,
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

function computeEffectiveBps({ percent_bps, fixed_fee_minor_units }, avg_ticket_eur) {
  const fixedMajor = fixed_fee_minor_units / MINOR_PER_MAJOR;
  const amortizedBps = (fixedMajor / avg_ticket_eur) * BPS_PER_UNIT;
  return percent_bps + amortizedBps;
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

  const current_bps = computeEffectiveBps(
    { percent_bps: row.percent_bps, fixed_fee_minor_units: row.fixed_fee_minor_units },
    input.avg_ticket_eur
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
        input.avg_ticket_eur
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
  assumptions.push(
    AMORTIZATION_NOTE(row.fixed_fee_minor_units, row.fixed_fee_currency, input.avg_ticket_eur)
  );
  const achievableNote = ACHIEVABLE_NOTE(row.achievable_breakdown_json);
  if (achievableNote) assumptions.push(achievableNote);
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
};

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
  'stripe',
  'paypal',
  'shopify_payments',
  'adyen',
  'mollie',
  'checkout_com',
  'sumup',
  'other',
] as const;
const ALLOWED_PROVIDER_SET = new Set<string>(ALLOWED_PROVIDER_SLUGS);

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

  // card_mix_debit_pct — optional
  let card_mix_debit_pct: number | undefined = undefined;
  if (raw.card_mix_debit_pct !== undefined && raw.card_mix_debit_pct !== null && raw.card_mix_debit_pct !== '') {
    const debit = Number(raw.card_mix_debit_pct);
    if (!isFinite(debit)) return { ok: false, failure: { field: 'card_mix_debit_pct', reason: 'invalid_type' } };
    if (debit < VALIDATION.card_mix_debit_pct.min || debit > VALIDATION.card_mix_debit_pct.max) return { ok: false, failure: { field: 'card_mix_debit_pct', reason: 'out_of_range' } };
    card_mix_debit_pct = debit;
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
      ...(card_mix_debit_pct !== undefined ? { card_mix_debit_pct } : {}),
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
    const engineInput = {
      monthly_gmv_eur: v.clean.monthly_gmv_eur,
      avg_ticket_eur: v.clean.avg_ticket_eur,
      region: v.clean.region,
      provider_slug: v.clean.provider_slug,
      intl_pct: v.clean.intl_pct,
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