// ─── Static-header fuser — FUENTE DE VERDAD LÓGICA ──────────────────────────
//
// Generic static-header fuser. Applies cfg.static_headers with two interp
// tokens: {token} (the plaintext access token, for non-standard auth headers)
// and {shop} (the per-integration shop_domain, for dynamic per-tenant headers
// like Xero-Tenant-Id or Sage X-Business). Both interp tokens are independent
// — a header value can use either, both, or neither. No-op if cfg.static_headers
// is absent. Provider-agnostic — the engine never names a provider.
//
// {shop} interpolation rationale: providers like Xero/Sage need a per-tenant
// identifier in a HEADER (not in the URL like Shopify/WooCommerce). The
// captured value lives in integ.metadata_json.shop_domain — same slot used
// by URL-side {shop}. ONE source of truth per integration.
//
// IMPORTANTE: este módulo es la FUENTE DE VERDAD LÓGICA. Está duplicado
// VERBATIM en base44/functions/dataSyncAgent/entry.ts (Deno no puede importar
// de src/). Mismo patrón que paginators.js / dateRange.js / rateLimit.js /
// refreshOn401.js / stripe.js. Si las dos copias divergen, los tests aquí lo
// detectan y la copia Deno se realinea a mano.

export function mergeStaticHeaders(cfg, authHeaders, plaintextToken, shopDomain) {
  const staticH = cfg.static_headers;
  if (!staticH || typeof staticH !== "object") return authHeaders;
  const merged = { ...authHeaders };
  for (const [name, rawValue] of Object.entries(staticH)) {
    if (typeof rawValue !== "string") continue;
    let value = rawValue;
    if (value.includes("{token}") && plaintextToken) {
      value = value.replaceAll("{token}", plaintextToken);
    }
    if (value.includes("{shop}") && shopDomain) {
      value = value.replaceAll("{shop}", shopDomain);
    }
    merged[name] = value;
  }
  return merged;
}