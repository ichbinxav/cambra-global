// calculatePaymentsGap — internal-only engine endpoint.
//
// DOUBLE-LOCK access control (Chunk 2 design):
//   1. base44.auth.me() must return a user → external anonymous callers hit 401
//   2. Request header X-Cambra-Internal-Call must equal env INTERNAL_CALL_SECRET
//      → even authenticated users cannot probe the engine from the browser;
//      only submitPaymentsAnalysis (running with asServiceRole) sends the
//      header when it invokes this function server-side.
//
// The block between SYNC-START/SYNC-END markers is a verbatim copy of
// src/lib/paymentsGap.js — enforced by the paymentsGap pair in
// src/lib/syncEngine/__sync_check__.test.js. When you edit logic there,
// edit it here too, or the sync-check test will fail loud.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// SYNC-START: paymentsGap

// Engine version. Bumped when the SYNC block's arithmetic/logic changes.
// Persisted verbatim on every session by callers — the session reflects what
// the engine said, never a caller-side constant. Keep in one place inside the
// SYNC block so both the src copy and the Deno copy agree by construction.
const ENGINE_VERSION = "v1";

// Currency minor-unit divisor. All PaymentsRateTable rows store fixed fees
// in minor units (cents / pence). 100 minor units = 1 major (EUR / GBP / USD).
const MINOR_PER_MAJOR = 100;

// Basis-point divisor. 10000 bps = 100%. All rates in the table live in bps
// so integer arithmetic stays honest; conversion to percentage happens only
// at output boundaries.
const BPS_PER_PCT = 100;
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
//   effective_bps = percent_bps + (fixed_fee_major / avg_ticket_eur) * 10000
//
// where fixed_fee_major = fixed_fee_minor_units / 100.
//
// The caller is responsible for currency alignment. We do NOT do FX here:
// PaymentsRateTable stores the fixed fee in the provider's native currency,
// but for a first-pass gap estimate we treat EUR/GBP/USD as ~1:1 at the
// magnitudes involved (fees under €0.50). FX-precise treatment is deferred
// to when we have live sync data.
function computeEffectiveBps({ percent_bps, fixed_fee_minor_units }, avg_ticket_eur) {
  const fixedMajor = fixed_fee_minor_units / MINOR_PER_MAJOR;
  const amortizedBps = (fixedMajor / avg_ticket_eur) * BPS_PER_UNIT;
  return percent_bps + amortizedBps;
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

// ─── Public entry point ──────────────────────────────────────────────────────

// calculateGap — the single function the backend endpoint wraps.
//
// Contract:
//   input: {
//     monthly_gmv_eur: number > 0,
//     avg_ticket_eur:  number > 0,
//     region:          'EU' | 'UK' | 'US' | 'RoW',    (unknown → 'RoW')
//     provider_slug:   'stripe' | 'paypal' | 'shopify_payments' | ...,
//     intl_pct:        0..100                          (default 0, reserved for future intl uplift)
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

  const current_bps = computeEffectiveBps(
    { percent_bps: row.percent_bps, fixed_fee_minor_units: row.fixed_fee_minor_units },
    input.avg_ticket_eur
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

// ─── Module-level rate-table cache ───────────────────────────────────────────
//
// Keeps a warm copy of the PaymentsRateTable rows so we don't hit the DB on
// every invoke. Cache is populated on first use and shared across warm
// invocations of the same isolate. If validateRateTable rejects the fetched
// snapshot (missing fallback row → eventual-consistency), we retry with a
// short backoff before giving up. We NEVER cache a partial table.

let _rateTableCache: any[] | null = null;
let _rateTableCachedAt = 0;
const RATE_TABLE_TTL_MS = 5 * 60 * 1000; // 5 min — rates change rarely, and admin reseed invalidates on next miss

async function fetchRateTable(base44: any): Promise<{ ok: boolean; rows?: any[]; error?: string; missing?: string[] }> {
  const now = Date.now();
  if (_rateTableCache && now - _rateTableCachedAt < RATE_TABLE_TTL_MS) {
    return { ok: true, rows: _rateTableCache };
  }
  // First attempt — direct list.
  let rows = await base44.asServiceRole.entities.PaymentsRateTable.list('-created_date', 500);
  let check = validateRateTable(rows);
  if (!check.ok) {
    // Eventual-consistency retry: wait 400ms then re-fetch once. This is the
    // same class of issue we saw in Chunk 1b spot-check where list() right
    // after write returned 8 of 11 rows on the first try but 11 on the retry.
    await new Promise((r) => setTimeout(r, 400));
    rows = await base44.asServiceRole.entities.PaymentsRateTable.list('-created_date', 500);
    check = validateRateTable(rows);
  }
  if (!check.ok) {
    return { ok: false, error: check.reason, missing: check.missing };
  }
  _rateTableCache = rows;
  _rateTableCachedAt = now;
  return { ok: true, rows };
}

// ─── Deno HTTP handler with DOUBLE-LOCK access control ───────────────────────

Deno.serve(async (req) => {
  try {
    // LOCK #1 — Base44 authentication. External anonymous callers die here.
    // We wrap auth.me() in try/catch because the SDK throws a Base44Error
    // ("Authentication required to view users") on missing/invalid bearer
    // tokens rather than returning null. Without this catch, the raw error +
    // stack trace would surface to the caller (leaking implementation). We
    // normalize any auth failure — thrown or null — to a clean 401 with only
    // { error: 'Unauthorized' } in the body.
    const base44 = createClientFromRequest(req);
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // LOCK #2 — Internal-call header. Even authenticated users cannot probe
    // this engine from the browser. Only submitPaymentsAnalysis (which runs
    // with asServiceRole and adds the header server-side) reaches through.
    const expected = Deno.env.get('INTERNAL_CALL_SECRET');
    if (!expected) {
      // Missing server config is a 500, not a 403 — helps distinguish
      // misconfiguration from access violation during debugging.
      return Response.json({ error: 'server_misconfigured' }, { status: 500 });
    }
    const provided = req.headers.get('X-Cambra-Internal-Call') || '';
    if (provided !== expected) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse input.
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'invalid_json_body' }, { status: 400 });
    }

    // Load rate table (with eventual-consistency retry).
    const table = await fetchRateTable(base44);
    if (!table.ok) {
      return Response.json({ error: table.error, missing: table.missing }, { status: 503 });
    }

    // Run the pure engine.
    const result = calculateGap(body || {}, table.rows);
    if (!result.ok) {
      // Validation failures return 422 (input problem), engine-internal
      // returns like rate_table_incomplete return 503 (service).
      const status = result.error === 'rate_table_incomplete' ? 503 : 422;
      return Response.json(result, { status });
    }
    return Response.json(result);
  } catch (error) {
    // Never leak stack traces to callers — the engine sits behind two locks,
    // but the outer catch used to happily echo `error.stack` which is the
    // same class of implementation-leak we just closed on LOCK #1. Log to
    // server console for operators; return a generic body to callers.
    console.error('calculatePaymentsGap:', error?.message, error?.stack);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
});