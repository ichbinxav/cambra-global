import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

/**
 * getUploadCapability — Chunk "Fallback universal de facturas" (FASE B).
 *
 * READ-ONLY capability probe. Answers ONE question for the frontend:
 * "is the statement-upload extractor actually live right now?"
 *
 * WHY this endpoint exists
 * ------------------------
 * The Upload-statements funnel card + the Connect-vs-Upload selector must show
 * HONEST copy (operator condition #1). The extractor (processUploadedFile) is
 * gated behind two backend secrets the frontend cannot read:
 *   • EXTRACTION_LLM_ENABLED  — Layer 1 (Anthropic). When ≠ 'true', NO bytes
 *                               are extracted; the upload persists but produces
 *                               nothing.
 *   • EXTRACTION_L3_ENABLED   — independent OpenAI cross-check. Required by
 *                               v2 before any extracted amount can be used.
 *
 * The UI uses `extraction_live` to pick copy:
 *   • true  → independently checked extraction is available
 *   • false → "Coming soon" (one or both readers are unavailable)
 *
 * SCOPE LOCK (operator conditions #3 + #4): this function does NOT run the
 * extractor, does NOT touch the engine, computeStripeVerifiedGap, the estimated
 * path, or any Stripe path. It only reads feature/provider readiness and returns booleans.
 * No secrets are ever echoed — only whether each flag equals 'true'.
 */
Deno.serve(async (req) => {
  try {
    // Auth: any signed-in user may probe capability (it leaks no secret — just
    // whether a feature is on). Anonymous callers get a safe default of "off"
    // so the public analyzer funnel degrades to the honest "coming soon" copy.
    const base44 = createClientFromRequest(req);
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }

    const llmEnabled = Deno.env.get('EXTRACTION_LLM_ENABLED') === 'true';
    const l3Enabled = Deno.env.get('EXTRACTION_L3_ENABLED') === 'true';
    const primaryConfigured = !!Deno.env.get('ANTHROPIC_API_KEY');
    const secondaryConfigured = !!Deno.env.get('OPENAI_API_KEY');

    return Response.json({
      ok: true,
      // v2 is fail-closed: one model may create an auditable needs-review row,
      // but only two enabled independent readers can produce accepted output.
      extraction_live: llmEnabled && l3Enabled && primaryConfigured && secondaryConfigured,
      extraction_version: 'document-extraction-2.0.0',
      independent_verification_required: true,
      // Exposed for admin diagnostics / future UI nuance. Never the secret
      // values themselves — only their on/off state.
      layer1_enabled: llmEnabled,
      layer3_enabled: l3Enabled,
      providers_configured: primaryConfigured && secondaryConfigured,
      authenticated: !!user,
    });
  } catch (error) {
    // Fail closed — on any error the UI treats upload as not-live (honest
    // "coming soon" rather than a false promise).
    console.error('getUploadCapability failed', error);
    return Response.json({ ok: false, extraction_live: false, error: 'upload_capability_unavailable' }, { status: 500 });
  }
});
