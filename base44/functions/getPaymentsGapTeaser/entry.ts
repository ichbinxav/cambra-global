import { safeBestEffort } from '../../shared/bestEffort.ts';
// getPaymentsGapTeaser — anonymous read of a PaymentsAnalysisSession.
//
// Endpoint classification: PUBLIC_OK (session-id-gated). No auth required.
// The anon_session_id (UUID v4, ~122 bits of entropy, generated server-side
// by submitPaymentsAnalysis) IS the access token. We look up sessions with
// asServiceRole because the RLS on PaymentsAnalysisSession is admin-only —
// this endpoint is the ONE controlled seam through which an anonymous client
// reads its own session.
//
// Hard allowlist. We NEVER spread the underlying record into the response —
// every field is copied explicitly:
//   - engine_result      → full engine output (safe: no PII in there)
//   - input_snapshot     → curated 4-field subset (gmv, ticket, provider, country)
//   - engine_version     → the version tag the engine stamped on the result
// We NEVER return: ip_hash, created_by, created_date, id, or the raw
// input_snapshot object (which may carry card_mix_debit_pct + region and
// grow in the future — allowlisting isolates us from silent leaks on schema
// evolution).
//
// Rate limit: 30 reads/hour/versioned HMAC network fingerprint (3× the write
// cap of submit) so a
// legitimate user refreshing/sharing the page doesn't hit the limit, while
// still making session-id enumeration attacks unprofitable at ~122 bits of
// entropy. Reuses the shared HMAC RateLimitCounter authority used by
// submitPaymentsAnalysis; no raw address or unkeyed digest is stored.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { consumePublicRequestRateLimit } from '../../shared/rateLimit.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Accept both POST (SDK invoke) and GET (?session=…) — the frontend uses
    // POST via base44.functions.invoke, but a shareable teaser link may want
    // to hit the URL directly some day. Cheap to support both.
    let session_id: string | null = null;
    if (req.method === 'POST') {
      // HYGIENE-1 T3 — body size cap BEFORE parsing (same pattern as oauthToken).
      const MAX_BODY_BYTES = 16 * 1024;
      const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_BODY_BYTES) return Response.json({ error: 'request_too_large' }, { status: 413 });
      const bodyText = await req.text();
      if (bodyText.length > MAX_BODY_BYTES) return Response.json({ error: 'request_too_large' }, { status: 413 });
      let body: any = {};
      try { body = JSON.parse(bodyText); } catch { body = {}; }
      session_id = body?.anon_session_id || body?.session_id || null;
    } else {
      const url = new URL(req.url);
      session_id = url.searchParams.get('session') || url.searchParams.get('anon_session_id');
    }

    if (!session_id || typeof session_id !== 'string' || !UUID_V4.test(session_id)) {
      return Response.json({ ok: false, error: 'invalid_session_id' }, { status: 400 });
    }

    // Rate limit — 30/h/HMAC network fingerprint. Enforced BEFORE the DB read so brute-force is cheap
    // to reject (Base44 filter() is not free at scale).
    const limitPerHour = Number(Deno.env.get('PAYMENTS_GAP_TEASER_RATE_LIMIT_PER_HOUR') || 30);
    const rl = await consumePublicRequestRateLimit(base44.asServiceRole, req, {
      namespace: 'get-payments-gap-teaser', limit: limitPerHour, window_seconds: 3600,
    });
    if (!rl.ok) {
      return Response.json({ error: rl.status === 429 ? 'rate_limited' : 'rate_limit_unavailable', retry_after_seconds: rl.retry_after_seconds }, { status: rl.status || 503 });
    }

    const rows = await base44.asServiceRole.entities.PaymentsAnalysisSession
      .filter({ anon_session_id: session_id }, '-created_date', 1)
      .catch((error:any)=>safeBestEffort(error,{operation:'getPaymentsGapTeaser',fallback:[],severity:'secondary'}));
    if (!rows.length) {
      return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const s = rows[0];

    // ── HARD ALLOWLIST ─────────────────────────────────────────────────────
    // Everything below is copied by name from s. No spread, no destructure.
    // If a new field lands on PaymentsAnalysisSession, it does NOT appear here
    // until it's added explicitly.
    //
    // M4-TPV Fase 3 (2026-07-12) — combined channel mode. When the persisted
    // engine_result carries `combined: true` + `channels: [...]`, we surface
    // the same minimal projection PER CHANNEL that we already do at the top
    // level, so CombinedGapHero can render the per-channel strip WITHOUT
    // pulling any raw input_snapshot from the outer session (which may have
    // grown fields we don't want to leak). No spread, no destructure —
    // every rendered field is copied by name.
    const engine_result_raw = s.engine_result || null;
    const engine_version = s.engine_version || engine_result_raw?.engine_version || null;

    // Base allowlisted engine_result fields the single-channel Results has
    // always relied on. We ONLY copy these — nothing else leaks even if the
    // engine grows new fields in a later bump.
    let engine_result: any = null;
    if (engine_result_raw && typeof engine_result_raw === 'object') {
      engine_result = {
        ok: engine_result_raw.ok === true,
        engine_version: engine_result_raw.engine_version || null,
        current_effective_bps: Number.isFinite(engine_result_raw.current_effective_bps) ? engine_result_raw.current_effective_bps : null,
        // UX-1 T2 (2026-07-29) — the exact achievable rate is reserved for
        // identified users (claimed AnalyzerResult / verified paths). The
        // anonymous teaser NEVER ships it — the UI renders a locked state.
        achievable_effective_bps: null,
        monthly_savings_eur: engine_result_raw.monthly_savings_eur || null,
        annual_savings_eur: engine_result_raw.annual_savings_eur || null,
        cohort: engine_result_raw.cohort || null,
        mode: typeof engine_result_raw.mode === 'string' ? engine_result_raw.mode : null,
        // SWEEP-1 T1 (2026-07-24) — classification is a computed 3-value enum
        // (savings_opportunity | already_optimized | insufficient_data), zero
        // sensitive data. Needed so the anonymous reader renders OptimizedHero
        // instead of a "€0/year" GapCard on already_optimized results.
        classification: typeof engine_result_raw.classification === 'string' ? engine_result_raw.classification : null,
        // UX-1 T2 — assumption lines that disclose the achievable composition
        // or anchor all start with "Achievable"; they are stripped so the rate
        // cannot be reconstructed from the teaser payload.
        assumptions: Array.isArray(engine_result_raw.assumptions)
          ? engine_result_raw.assumptions.filter((a: any) => typeof a === 'string' && !/achievable/i.test(a))
          : [],
      };
      // Combined-mode additive fields. Only present when the persisted row
      // is a combined submit (produced by submitPaymentsAnalysis Fase 3).
      // We copy `combined` as a strict boolean AND rewrite `channels` through
      // the same minimal projection so no raw per-channel input leaks
      // through even if input_snapshot grew fields we haven't audited yet.
      if (engine_result_raw.combined === true && Array.isArray(engine_result_raw.channels)) {
        engine_result.combined = true;
        engine_result.channels = engine_result_raw.channels.map((c: any) => {
          const chIn = c?.input_snapshot || {};
          const chEr = c?.engine_result || null;
          const projectedChannelResult = chEr && typeof chEr === 'object' ? {
            ok: chEr.ok === true,
            engine_version: chEr.engine_version || null,
            current_effective_bps: Number.isFinite(chEr.current_effective_bps) ? chEr.current_effective_bps : null,
            achievable_effective_bps: null, // UX-1 T2 — reserved for identified users
            monthly_savings_eur: chEr.monthly_savings_eur || null,
            annual_savings_eur: chEr.annual_savings_eur || null,
            cohort: chEr.cohort || null,
            mode: typeof chEr.mode === 'string' ? chEr.mode : null,
            // SWEEP-1 T1 — same computed enum, per-channel (combined mode).
            classification: typeof chEr.classification === 'string' ? chEr.classification : null,
            assumptions: Array.isArray(chEr.assumptions)
              ? chEr.assumptions.filter((a: any) => typeof a === 'string' && !/achievable/i.test(a)) // UX-1 T2
              : [],
          } : null;
          return {
            channel: typeof c?.channel === 'string' ? c.channel : null,
            input_snapshot: {
              // Same 4-field minimum as the top-level snapshot — never spread.
              monthly_gmv_eur: Number(chIn.monthly_gmv_eur) || null,
              avg_ticket_eur: Number(chIn.avg_ticket_eur) || null,
              provider_slug: typeof chIn.provider_slug === 'string' ? chIn.provider_slug : null,
              // channel is redundant at this level (already in `channel`) but
              // some consumers may want it inline — keep it for symmetry.
              channel: typeof chIn.channel === 'string' ? chIn.channel : null,
            },
            engine_result: projectedChannelResult,
          };
        });
      }
    }

    const rawSnap = s.input_snapshot || {};
    const input_snapshot = {
      monthly_gmv_eur: Number(rawSnap.monthly_gmv_eur) || null,
      avg_ticket_eur: Number(rawSnap.avg_ticket_eur) || null,
      provider_slug: typeof rawSnap.provider_slug === 'string' ? rawSnap.provider_slug : null,
      country: typeof rawSnap.country === 'string' ? rawSnap.country : null,
    };

    return Response.json({
      ok: true,
      engine_version,
      input_snapshot,
      engine_result,
    });
  } catch (error) {
    console.error('getPaymentsGapTeaser:', (error as any)?.message);
    return Response.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
});
