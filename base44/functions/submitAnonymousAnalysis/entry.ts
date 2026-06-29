import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * submitAnonymousAnalysis — Persists an Analyzer result from a NOT-YET-SIGNED-IN user.
 *
 * Why a backend function (instead of letting the client write directly):
 *   Brand/AnalyzerInput/AnalyzerResult RLS require `created_by = user.email`.
 *   Anonymous users have no email, so they can't write at all from the client.
 *   This function uses asServiceRole to persist 3 records tagged with the
 *   client-generated anon_session_id (UUID v4). Ownership stays "null/anonymous"
 *   until a signed-in user calls claimAnonymousAnalysis with that session_id.
 *
 * Security:
 *   - anon_session_id must be a UUID v4 — anything else is rejected. This makes
 *     the session id unguessable (~122 bits of entropy).
 *   - The function never returns the full result. It returns only the IDs that
 *     the client already needs in order to navigate to the teaser page.
 *   - The teaser endpoint (getAnonResultTeaser) is the ONLY way to read those
 *     records before claim — and it strips the breakdown.
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

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

    // 2. AnalyzerInput
    const createdInput = await base44.asServiceRole.entities.AnalyzerInput.create({
      ...analyzer_input,
      brand_id: createdBrand.id,
      anon_session_id,
    });

    // 3. AnalyzerResult — clamp tools_count just in case
    const safeToolsCount = Math.max(0, Math.min(100, Number(tools_count) || 0));
    await base44.asServiceRole.entities.AnalyzerResult.create({
      ...analyzer_result,
      brand_id: createdBrand.id,
      input_id: createdInput.id,
      anon_session_id,
      anon_tools_count: safeToolsCount,
    });

    return Response.json({ ok: true, session_id: anon_session_id });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});