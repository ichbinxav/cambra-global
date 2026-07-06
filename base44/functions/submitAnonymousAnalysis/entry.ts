import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * submitAnonymousAnalysis — Persists an Analyzer result from a NOT-YET-SIGNED-IN user.
 *
 * Endpoint classification: PUBLIC_OK (anonymous callers are legitimate here).
 * asServiceRole justification: RLS on Brand/AnalyzerInput/AnalyzerResult requires
 * created_by=user.email, and anonymous callers have no email. Records are tagged
 * with anon_session_id (UUID v4) until claimAnonymousAnalysis reassigns them to
 * the signed-in user.
 *
 * ─── SECURITY MODEL ─────────────────────────────────────────────────────────
 *
 *   TRUST BOUNDARY (this is the important part — everything else is plumbing).
 *   The client submits an `analyzer_result` object it computed itself. Until we
 *   have server-side recalculation (see follow-up below), we treat that object
 *   as:
 *
 *     - OK to show to the caller in the teaser (only they see it, keyed by
 *       their own anon_session_id).
 *     - NOT OK to feed the network learning loop (benchmarkLearningEngine),
 *       because a poisoned payload from one anonymous caller would contaminate
 *       every other brand's cohort benchmarks.
 *
 *   The learning loop gate lives in benchmarkLearningEngine (defense in depth —
 *   protects even if a future caller bypasses onAnalyzerCompleted). See that
 *   file for the check on `anon_session_id`.
 *
 *   TODO (follow-up, tracked separately — NOT part of this hardening pass):
 *   Implement server-side recalculation of savings/score using a port of
 *   scoreEngine.js into Deno. Then this endpoint would accept ONLY
 *   analyzer_input and reject any client-side analyzer_result. That would
 *   remove the trust boundary entirely. Scope: ~450 lines of financial logic +
 *   sync tests. Deferred to keep this pass focused.
 *
 *   OTHER GUARDS:
 *   - anon_session_id must be a UUID v4 (~122 bits of entropy → unguessable).
 *   - Idempotent per session_id (retries don't stack records).
 *   - Rate limited (see below) — public write endpoint, must throttle.
 *   - Response contains no record ids and no result payload — only the
 *     session_id the client already had.
 *   - Numeric fields are bounded (clamped and NaN-guarded) so a payload can't
 *     store literal "Infinity" or nonsense in the DB.
 *
 * Payload:
 *   {
 *     anon_session_id: string (UUID v4),
 *     brand: { name, website?, country, category, channels? },
 *     analyzer_input: { ...full payload built by Analyzer.buildInputPayload() },
 *     analyzer_result: {
 *       payment_savings, shipping_savings, saas_savings, total_savings,
 *       infra_score, details, confidence_level, data_completeness_score,
 *       score_engine_version, savings_model_version, benchmark_version,
 *       methodology, assumptions, benchmark_source, verification_status,
 *       next_best_action,
 *     },
 *     tools_count: number  // for the teaser "X tools detected" badge
 *   }
 *
 * Returns: { ok, session_id }   (no record ids, no payload)
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── Rate limiting (per IP, hourly) ─────────────────────────────────────────
//
// This endpoint is public AND writes 3 entities per successful call.
// Without a cap, a single bot could:
//   1. Fill the DB with junk Brand/AnalyzerInput/AnalyzerResult rows.
//   2. Push benchmarkLearningEngine towards its dedup ceiling with fake sessions.
//   3. Exhaust Analyzer capacity for real anonymous visitors.
//
// Same RateLimitCounter pattern used by copilotChat / apiV1 / mcpServer.
// principal_type='ip' because we have no user id for anonymous callers.
// Default is deliberately loose enough that a real user retrying 2-3× doesn't
// hit it, but low enough that a scripted flood is capped quickly.
const DEFAULT_LIMIT_PER_HOUR = 10;

function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

async function checkRateLimit(base44: any, ip: string) {
  const envRaw = Deno.env.get('ANONYMOUS_ANALYSIS_RATE_LIMIT_PER_HOUR');
  const parsed = envRaw ? parseInt(envRaw, 10) : NaN;
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LIMIT_PER_HOUR;

  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 3600000) * 3600000).toISOString();
  const reset = new Date(new Date(windowStart).getTime() + 3600000).toISOString();
  const principalId = `submitAnonymousAnalysis:${ip}`;

  const matches = await base44.asServiceRole.entities.RateLimitCounter.filter({
    principal_id: principalId,
    window_start: windowStart,
  }).catch(() => []);

  const counter = matches?.[0];
  if (!counter) {
    await base44.asServiceRole.entities.RateLimitCounter.create({
      principal_id: principalId,
      principal_type: 'ip',
      window_start: windowStart,
      count: 1,
      limit_per_minute: limit,
    }).catch(() => null);
    return { ok: true, remaining: limit - 1, limit, reset };
  }
  if ((counter.count || 0) >= limit) {
    return { ok: false, remaining: 0, limit, reset };
  }
  await base44.asServiceRole.entities.RateLimitCounter.update(counter.id, {
    count: (counter.count || 0) + 1,
  }).catch(() => null);
  return { ok: true, remaining: limit - (counter.count || 0) - 1, limit, reset };
}

// ─── Numeric sanitization ───────────────────────────────────────────────────
//
// Client-provided numbers get clamped to sane bounds. This does NOT validate
// business correctness (that requires the full scoreEngine recalculation —
// see the follow-up TODO above). It prevents outright garbage from being
// persisted: Infinity, NaN, negative savings, absurd totals.
function clampMoney(v: any, max = 100_000_000): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}
function clampScore(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
function clampPercent(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function sanitizeAnalyzerResult(raw: any): any {
  const r = raw || {};
  return {
    payment_savings:  clampMoney(r.payment_savings),
    shipping_savings: clampMoney(r.shipping_savings),
    saas_savings:     clampMoney(r.saas_savings),
    total_savings:    clampMoney(r.total_savings),
    infra_score:      clampScore(r.infra_score),
    payment_benchmark:  Number.isFinite(Number(r.payment_benchmark))  ? Number(r.payment_benchmark)  : undefined,
    shipping_benchmark: Number.isFinite(Number(r.shipping_benchmark)) ? Number(r.shipping_benchmark) : undefined,
    saas_benchmark:     Number.isFinite(Number(r.saas_benchmark))     ? Number(r.saas_benchmark)     : undefined,
    details: r.details && typeof r.details === 'object' ? r.details : undefined,
    confidence_level: ['low', 'medium', 'high'].includes(r.confidence_level) ? r.confidence_level : 'low',
    data_completeness_score: clampPercent(r.data_completeness_score),
    methodology: typeof r.methodology === 'string' ? String(r.methodology).slice(0, 2000) : undefined,
    assumptions: Array.isArray(r.assumptions)
      ? r.assumptions.slice(0, 50).map((s: any) => String(s).slice(0, 500))
      : undefined,
    benchmark_source: ['network_internal', 'industry_public', 'provider_published', 'hybrid'].includes(r.benchmark_source)
      ? r.benchmark_source : 'industry_public',
    // verification_status is HARD-PINNED to 'estimated' for anonymous submissions.
    // The client cannot lift its own record to 'verified' — that's a downstream
    // decision after tools connect. Ignoring any client value is intentional.
    verification_status: 'estimated',
    next_best_action: typeof r.next_best_action === 'string' ? String(r.next_best_action).slice(0, 500) : undefined,
    score_engine_version: typeof r.score_engine_version === 'string' ? String(r.score_engine_version).slice(0, 50) : undefined,
    savings_model_version: typeof r.savings_model_version === 'string' ? String(r.savings_model_version).slice(0, 50) : undefined,
    benchmark_version: typeof r.benchmark_version === 'string' ? String(r.benchmark_version).slice(0, 50) : undefined,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Rate limit BEFORE parsing/writing. Cheap check first.
    const ip = getClientIp(req);
    const rl = await checkRateLimit(base44, ip);
    if (!rl.ok) {
      return Response.json(
        { ok: false, error: 'rate_limited' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(rl.limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rl.reset,
          },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      anon_session_id,
      brand,
      analyzer_input,
      analyzer_result,
      tools_count,
    } = body || {};

    if (!anon_session_id || typeof anon_session_id !== 'string' || !UUID_V4.test(anon_session_id)) {
      return Response.json({ ok: false, error: 'invalid_session_id' }, { status: 400 });
    }
    if (!brand || !brand.name) {
      return Response.json({ ok: false, error: 'brand_name_required' }, { status: 400 });
    }
    if (!analyzer_result || typeof analyzer_result.total_savings !== 'number') {
      return Response.json({ ok: false, error: 'invalid_analyzer_result' }, { status: 400 });
    }

    // Idempotency — if this session already submitted, return ok without
    // creating duplicates. Avoids stacking records if the client retries.
    const existing = await base44.asServiceRole.entities.AnalyzerResult
      .filter({ anon_session_id }, '-created_date', 1)
      .catch(() => []);
    if (existing.length) {
      return Response.json({ ok: true, session_id: anon_session_id, deduped: true });
    }

    // 1. Brand
    const createdBrand = await base44.asServiceRole.entities.Brand.create({
      name: String(brand.name).slice(0, 200),
      website: brand.website ? String(brand.website).slice(0, 500) : undefined,
      country: brand.country ? String(brand.country).slice(0, 100) : undefined,
      category: brand.category || 'other',
      channels: Array.isArray(brand.channels) ? brand.channels : ['dtc'],
      anon_session_id,
    });

    // 2. AnalyzerInput (kept as-is; used for future server-side recalculation)
    const createdInput = await base44.asServiceRole.entities.AnalyzerInput.create({
      ...analyzer_input,
      brand_id: createdBrand.id,
      anon_session_id,
    });

    // 3. AnalyzerResult — sanitize numbers, force verification_status='estimated'
    const safe = sanitizeAnalyzerResult(analyzer_result);
    const safeToolsCount = Math.max(0, Math.min(100, Number(tools_count) || 0));
    await base44.asServiceRole.entities.AnalyzerResult.create({
      ...safe,
      brand_id: createdBrand.id,
      input_id: createdInput.id,
      anon_session_id,
      // Sticky origin flag — persists forever, even after claim clears anon_session_id.
      // Read by benchmarkLearningEngine to enforce the anonymous quarantine end-to-end.
      was_anonymous: true,
      anon_tools_count: safeToolsCount,
    });

    return Response.json(
      { ok: true, session_id: anon_session_id },
      {
        headers: {
          'X-RateLimit-Limit': String(rl.limit),
          'X-RateLimit-Remaining': String(rl.remaining),
          'X-RateLimit-Reset': rl.reset,
        },
      },
    );
  } catch (error) {
    return Response.json({ ok: false, error: (error as any)?.message || 'internal_error' }, { status: 500 });
  }
});