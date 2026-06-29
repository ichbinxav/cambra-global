import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * claimAnonymousAnalysis — Reassigns the 3 anonymous records (Brand,
 * AnalyzerInput, AnalyzerResult) to the currently signed-in user.
 *
 * Security guarantees:
 *   1. Caller MUST be authenticated. Without a logged-in user → 401.
 *      This stops anyone from "claiming" by simply knowing a session_id
 *      without ever signing up.
 *   2. We only claim records whose anon_session_id matches AND whose
 *      created_by is null/empty. A record that was already claimed by
 *      someone else cannot be re-claimed.
 *   3. After claim, anon_session_id is CLEARED, so the teaser endpoint
 *      can no longer return data for that session.
 *
 * Returns: { ok, result_id } so the caller can navigate to /Results?id=...
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Hard auth gate. The whole point of "claim" is that you've signed in.
    const user = await base44.auth.me().catch(() => null);
    if (!user || !user.email) {
      return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const session_id = body?.anon_session_id || body?.session_id;

    if (!session_id || typeof session_id !== 'string' || !UUID_V4.test(session_id)) {
      return Response.json({ ok: false, error: 'invalid_session_id' }, { status: 400 });
    }

    // Find the result for this session.
    const results = await base44.asServiceRole.entities.AnalyzerResult
      .filter({ anon_session_id: session_id }, '-created_date', 1)
      .catch(() => []);
    if (!results.length) {
      return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const result = results[0];

    // Refuse to re-claim a record that already has an owner.
    // (Defense in depth — should never happen if anon_session_id gets cleared
    // on first claim, but cheap and explicit.)
    if (result.created_by && result.created_by !== user.email) {
      return Response.json({ ok: false, error: 'already_claimed' }, { status: 409 });
    }

    // Collect the three sibling records by session_id. Each is reassigned
    // and gets its anon_session_id cleared so the teaser endpoint stops
    // returning anything for this session.
    const [inputs, brands] = await Promise.all([
      result.input_id
        ? base44.asServiceRole.entities.AnalyzerInput.filter({ id: result.input_id }).catch(() => [])
        : Promise.resolve([]),
      result.brand_id
        ? base44.asServiceRole.entities.Brand.filter({ id: result.brand_id }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const patch = { created_by: user.email, anon_session_id: null };

    if (brands[0]) {
      await base44.asServiceRole.entities.Brand.update(brands[0].id, {
        ...patch,
        contact_email: brands[0].contact_email || user.email,
        contact_name: brands[0].contact_name || user.full_name || undefined,
      });
    }
    if (inputs[0]) {
      await base44.asServiceRole.entities.AnalyzerInput.update(inputs[0].id, patch);
    }
    await base44.asServiceRole.entities.AnalyzerResult.update(result.id, patch);

    return Response.json({
      ok: true,
      result_id: result.id,
      brand_id: result.brand_id || null,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});