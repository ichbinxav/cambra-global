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
// Rate limit: 30 reads / hour / IP (3× the write cap of submit) so a
// legitimate user refreshing/sharing the page doesn't hit the limit, while
// still making session-id enumeration attacks unprofitable at ~122 bits of
// entropy. Reuses the same RateLimitCounter bucket pattern + DERIVED IP salt
// as submitPaymentsAnalysis.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── IP salt derivation — same pattern as submitPaymentsAnalysis, keyed on a
//    different suffix so this endpoint's rate-limit domain is separable.
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
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

async function checkAndIncrementRateLimit(
  base44: any,
  ipHash: string,
  limitPerHour: number,
): Promise<{ ok: boolean; retry_after_seconds?: number }> {
  const now = new Date();
  const hourStart = new Date(now);
  hourStart.setUTCMinutes(0, 0, 0);
  const window_start = hourStart.toISOString();
  const principal_id = `getPaymentsGapTeaser:${ipHash}`;

  const existing = await base44.asServiceRole.entities.RateLimitCounter.filter({ principal_id, window_start });
  const current = existing?.[0];
  const count = current ? (current.count || 0) : 0;

  if (count >= limitPerHour) {
    const nextHour = new Date(hourStart);
    nextHour.setUTCHours(hourStart.getUTCHours() + 1);
    return { ok: false, retry_after_seconds: Math.ceil((nextHour.getTime() - now.getTime()) / 1000) };
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
  return { ok: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Accept both POST (SDK invoke) and GET (?session=…) — the frontend uses
    // POST via base44.functions.invoke, but a shareable teaser link may want
    // to hit the URL directly some day. Cheap to support both.
    let session_id: string | null = null;
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      session_id = body?.anon_session_id || body?.session_id || null;
    } else {
      const url = new URL(req.url);
      session_id = url.searchParams.get('session') || url.searchParams.get('anon_session_id');
    }

    if (!session_id || typeof session_id !== 'string' || !UUID_V4.test(session_id)) {
      return Response.json({ ok: false, error: 'invalid_session_id' }, { status: 400 });
    }

    // Rate limit — 30/h/IP. Enforced BEFORE the DB read so brute-force is cheap
    // to reject (Base44 filter() is not free at scale).
    const ip = extractClientIp(req);
    const ipHash = await hashIp(ip);
    const limitPerHour = Number(Deno.env.get('PAYMENTS_GAP_TEASER_RATE_LIMIT_PER_HOUR') || 30);
    const rl = await checkAndIncrementRateLimit(base44, ipHash, limitPerHour);
    if (!rl.ok) {
      return Response.json({ error: 'rate_limited', retry_after_seconds: rl.retry_after_seconds }, { status: 429 });
    }

    const rows = await base44.asServiceRole.entities.PaymentsAnalysisSession
      .filter({ anon_session_id: session_id }, '-created_date', 1)
      .catch(() => []);
    if (!rows.length) {
      return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const s = rows[0];

    // ── HARD ALLOWLIST ─────────────────────────────────────────────────────
    // Everything below is copied by name from s. No spread, no destructure.
    // If a new field lands on PaymentsAnalysisSession, it does NOT appear here
    // until it's added explicitly.
    const engine_result = s.engine_result || null;
    const engine_version = s.engine_version || engine_result?.engine_version || null;

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