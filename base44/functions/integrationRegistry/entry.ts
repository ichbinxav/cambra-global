/**
 * integrationRegistry — Human-readable reference (Fase 0)
 * =============================================================================
 * NOT a runtime registry. Deno functions cannot import from one another, so
 * the actual REGISTRY constant is duplicated inside:
 *
 *   • functions/oauthConnector.js
 *   • functions/dataSyncAgent.js
 *
 * Both copies MUST stay in sync. This file exists so humans have a single
 * place to read what providers exist and what they look like. If you change
 * the registry, edit BOTH function files in the same change.
 *
 * The handler below is a tiny status endpoint: GET → returns the list of
 * provider slugs currently supported, with only safe-to-expose fields. The
 * client UX uses this for the connector picker.
 * =============================================================================
 */

// Source of truth (mirror of the REGISTRY inside oauthConnector + dataSyncAgent)
const REGISTRY = {
  demo_provider: {
    display_name: "Demo Provider",
    category: "payments",
    description: "Fictional provider used to verify the connector engine.",
    scopes: ["read:transactions", "read:fees"],
    data_type: "transactions",
    demo_mode: true,
  },
};

Deno.serve(async (_req) => {
  try {
    const providers = Object.entries(REGISTRY).map(([slug, cfg]) => ({
      provider: slug,
      display_name: cfg.display_name,
      category: cfg.category,
      description: cfg.description,
      scopes: cfg.scopes,
      data_type: cfg.data_type,
      demo_mode: !!cfg.demo_mode,
    }));
    return Response.json({ ok: true, providers });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});