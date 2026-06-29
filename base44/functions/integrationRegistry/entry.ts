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

// Source of truth (mirror of the REGISTRY inside oauthConnector + dataSyncAgent).
// Read-only, human-readable. Returns only safe-to-expose fields — never secrets.
const REGISTRY = {
  demo_provider: {
    display_name: "Demo Provider",
    category: "payments",
    description: "Fictional provider used to verify the connector engine.",
    auth_method: "oauth",
    scopes: ["read:transactions", "read:fees"],
    data_type: "transactions",
    demo_mode: true,
  },
  demo_apikey_provider: {
    display_name: "Demo API Key Provider",
    category: "shipping",
    description: "Fictional API-key provider used to verify the api_key path.",
    auth_method: "api_key",
    api_key_help_url: "https://demo.example.invalid/account/api-keys",
    api_key_help_text: "Open your Demo Provider dashboard → Account → API Keys, create a read-only key, paste it here.",
    data_type: "shipments",
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
      auth_method: cfg.auth_method || "oauth",
      scopes: cfg.scopes,
      data_type: cfg.data_type,
      api_key_help_url: cfg.api_key_help_url,
      api_key_help_text: cfg.api_key_help_text,
      demo_mode: !!cfg.demo_mode,
    }));
    return Response.json({ ok: true, providers });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});