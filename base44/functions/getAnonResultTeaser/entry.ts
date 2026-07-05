import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Endpoint classification: PUBLIC_OK (session-id-gated).
 * asServiceRole justification: the caller has no user identity (yet); the
 * session_id (UUID v4, ~122 bits of entropy) is the access token. RLS on
 * AnalyzerResult/Brand/AnalyzerInput requires created_by, so we can't read
 * these as a user. We hard-allowlist the response fields (see the note below)
 * — the internal record is never spread into the response.
 *
 * getAnonResultTeaser — The ONLY way an unauthenticated client can read an
 * anonymous Analyzer result. Returns a hard-allowlisted 5-field subset.
 *
 * What it returns (and ONLY this):
 *   - total_savings   → the hero number
 *   - country         → "based on France ..." line
 *   - tier            → revenue tier label (micro/small/mid/large)
 *   - tools_count     → "X tools detected" badge
 *   - brand_name      → personalization in the headline
 *
 * What it NEVER returns:
 *   - payment_savings / shipping_savings / saas_savings (the breakdown)
 *   - details.* (current rates, optimal rates, benchmarks)
 *   - infra_score, recommendations, methodology, assumptions
 *   - any field from AnalyzerInput beyond what's listed above
 *   - any record id (no internal handles leak before claim)
 *
 * If you're tempted to add another field here: ask yourself if the founder
 * would want it visible to anyone with the session_id. If not, leave it out.
 *
 * Access:
 *   - The session_id is a UUID v4 (~122 bits entropy) — unguessable.
 *   - Knowing the session_id is the access token. After claim, the record
 *     is reassigned to the user and this endpoint stops finding it (because
 *     anon_session_id gets cleared during claim).
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getRevenueTier(monthlyRevenue = 0) {
  if (monthlyRevenue >= 500000) return 'large';
  if (monthlyRevenue >= 100000) return 'mid';
  if (monthlyRevenue >= 30000) return 'small';
  return 'micro';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const session_id = body?.anon_session_id || body?.session_id;

    if (!session_id || typeof session_id !== 'string' || !UUID_V4.test(session_id)) {
      return Response.json({ ok: false, error: 'invalid_session_id' }, { status: 400 });
    }

    // Find the result for this session. We only ever return one — the most
    // recent — to avoid leaking the existence of multiple submissions.
    const results = await base44.asServiceRole.entities.AnalyzerResult
      .filter({ anon_session_id: session_id }, '-created_date', 1)
      .catch(() => []);

    if (!results.length) {
      return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const r = results[0];

    // Fetch only the 2 brand fields + 1 input field the teaser needs.
    let brand_name = '';
    let country = '';
    let tier = 'small';

    if (r.brand_id) {
      try {
        const b = await base44.asServiceRole.entities.Brand.get(r.brand_id);
        brand_name = b?.name || '';
        country = b?.country || '';
      } catch { /* non-fatal */ }
    }

    if (r.input_id) {
      try {
        const inp = await base44.asServiceRole.entities.AnalyzerInput.get(r.input_id);
        tier = getRevenueTier(Number(inp?.monthly_revenue || 0));
        if (!country && inp?.country) country = inp.country;
      } catch { /* non-fatal */ }
    }

    // ─── HARD ALLOWLIST ────────────────────────────────────────────────
    // Build the response object literally, field-by-field. NEVER spread
    // the underlying record. If you need to add a teaser field, add it here.
    const teaser = {
      total_savings: Math.max(0, Math.round(Number(r.total_savings) || 0)),
      country: String(country || '').slice(0, 100),
      tier: String(tier || 'small'),
      tools_count: Math.max(0, Math.min(100, Number(r.anon_tools_count) || 0)),
      brand_name: String(brand_name || '').slice(0, 200),
    };

    return Response.json({ ok: true, teaser });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});