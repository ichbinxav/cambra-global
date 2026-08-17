// DASHBOARD-C12 (2026-08-17) — the single API scope catalog.
//
// This list existed twice, in createApiKey/entry.ts and runApiSelfTests/entry.ts, and the
// OAuth app panel had no server-side list at all: `allowed_scopes` was whatever the browser
// put in the entity. Three copies of an authorization vocabulary is the same shadow-authority
// shape as a second field named "revenue share" — whichever copy a caller happens to be
// validated against decides what it can reach.
//
// Extracted verbatim from createApiKey, which was the de facto authority.

export const API_SCOPE_CATALOG_VERSION = 'api-scope-catalog-1.0.0';

export const VALID_SCOPES = Object.freeze([
  'read', 'write', 'admin', 'platform',
  'read:kpis', 'read:brands', 'read:analyses', 'read:documents', 'read:providers',
  'read:savings', 'read:trackers', 'read:reports', 'read:integrations', 'read:users',
  'write:reports', 'write:documents', 'write:trackers',
  'trigger:analysis',
  'manage:integrations', 'manage:webhooks',
] as const);

export type ApiScope = typeof VALID_SCOPES[number];

/**
 * Scopes that grant broad or administrative reach.
 *
 * A third-party OAuth app has no business holding these, so the OAuth registry refuses
 * them while API keys — which are first-party — may still be issued with them.
 */
export const PRIVILEGED_SCOPES = Object.freeze(['admin', 'platform', 'write', 'manage:integrations'] as const);

export function isValidScope(scope: unknown): boolean {
  return (VALID_SCOPES as readonly string[]).includes(String(scope ?? '').trim());
}

export function unknownScopes(scopes: unknown[]): string[] {
  return (Array.isArray(scopes) ? scopes : [])
    .map((scope) => String(scope ?? '').trim())
    .filter((scope) => scope && !isValidScope(scope));
}

export function privilegedScopes(scopes: unknown[]): string[] {
  return (Array.isArray(scopes) ? scopes : [])
    .map((scope) => String(scope ?? '').trim())
    .filter((scope) => (PRIVILEGED_SCOPES as readonly string[]).includes(scope));
}
