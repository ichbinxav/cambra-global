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
//   - Invokes calculatePaymentsGap over HTTP with X-Cambra-Internal-Call so
//     the engine's double-lock stays intact (this endpoint is the ONLY caller
//     that legitimately holds the header from a server-side context).
//   - Persists a PaymentsAnalysisSession row so Chunk 5's teaser can recover
//     the result later by anon_session_id (URL-shareable).
//
// Explicitly OUT OF SCOPE for Chunk 3: claim flow, email capture, frontend,
// TTL purge job (deferred to Chunk 6 as agreed).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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

// ─── Engine invocation via HTTP with internal header ────────────────────────
async function invokeEngine(engineInput: any): Promise<{ ok: boolean; status: number; body: any }> {
  let appDomain = (Deno.env.get('APP_DOMAIN') || '').trim().replace(/\/$/, '');
  if (appDomain && !/^https?:\/\//i.test(appDomain)) appDomain = `https://${appDomain}`;
  if (!appDomain) return { ok: false, status: 500, body: { error: 'app_domain_missing' } };

  const internalSecret = Deno.env.get('INTERNAL_CALL_SECRET');
  if (!internalSecret) return { ok: false, status: 500, body: { error: 'internal_secret_missing' } };

  const svcToken = Deno.env.get('BASE44_SERVICE_TOKEN')
    || Deno.env.get('BASE44_SERVICE_ROLE_KEY')
    || '';

  const resp = await fetch(`${appDomain}/functions/calculatePaymentsGap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cambra-Internal-Call': internalSecret,
      ...(svcToken ? { 'Authorization': `Bearer ${svcToken}` } : {}),
    },
    body: JSON.stringify(engineInput),
  });
  const text = await resp.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { ok: resp.ok, status: resp.status, body: parsed };
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

    // Invoke engine.
    const engineInput = {
      monthly_gmv_eur: v.clean.monthly_gmv_eur,
      avg_ticket_eur: v.clean.avg_ticket_eur,
      region: v.clean.region,
      provider_slug: v.clean.provider_slug,
      intl_pct: v.clean.intl_pct,
    };
    const eng = await invokeEngine(engineInput);
    if (!eng.ok) {
      // Bubble a sanitized error — never echo internal fields.
      console.error('submitPaymentsAnalysis engine error:', eng.status, eng.body);
      return Response.json({ error: 'engine_unavailable' }, { status: 502 });
    }
    if (!eng.body || eng.body.ok !== true) {
      console.error('submitPaymentsAnalysis engine returned not-ok:', eng.body);
      return Response.json({ error: 'engine_error' }, { status: 502 });
    }

    // Persist session.
    const anon_session_id = crypto.randomUUID();
    const engineVersion = eng.body.engine_version || 'unknown';
    await base44.asServiceRole.entities.PaymentsAnalysisSession.create({
      anon_session_id,
      input_snapshot: v.clean,
      engine_result: eng.body,
      engine_version: engineVersion,
      ip_hash: ipHash,
    });

    return Response.json({
      ok: true,
      anon_session_id,
      engine_result: eng.body,
    });
  } catch (error) {
    console.error('submitPaymentsAnalysis:', (error as any)?.message, (error as any)?.stack);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
});