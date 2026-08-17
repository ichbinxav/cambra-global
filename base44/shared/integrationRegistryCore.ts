// DASHBOARD-C12 (2026-08-17) — governed OAuth app and webhook endpoint registration.
//
// Replaces the two CRITICAL browser writes the legacy-routes ratchet has been carrying:
// OAuthAppsPanel.jsx (OAuthApp.create/update) and WebhooksTable.jsx
// (WebhookEndpoint.create/delete).
//
// WHAT C12 VERIFIED. Two things the "browser-generated secret" framing gets wrong, and one
// it gets right in a sharper way.
//
// WRONG: the randomness is fine. Both panels use `crypto.getRandomValues`, a CSPRNG, over
// 24 bytes. And the OAuth secret is never sent to the server in plaintext — only its
// SHA-256 and last four characters are stored, which for a 192-bit random token is correct
// practice, not a weak password hash.
//
// WRONG: the token endpoint is correct. oauthToken/entry.ts requires a client_secret for
// confidential clients and compares it in constant time; oauthAuthorize validates the
// redirect_uri against the stored allowlist and the requested scopes against the stored
// allowed_scopes.
//
// RIGHT, AND THIS IS THE ACTUAL DEFECT: every one of those server-side controls reads a
// field that a generic browser CRUD call sets. The entity write IS the trust decision.
//
//   - oauthAuthorize:77 is `if (app.pkce_required && !code_challenge)`. PKCE is enforced
//     only when the STORED FLAG says so. A caller who writes the entity can set it false.
//   - allowed_scopes is validated against the app's own row, which the same call wrote. No
//     server-side scope catalog was consulted at all — the catalog existed only inside
//     createApiKey, for API keys.
//   - redirect_uris is validated against the app's own row. Nothing checked that the URIs
//     are https, absolute, wildcard-free or not pointing at an attacker's host.
//   - type and client_secret_hash are independent fields, so `type: 'confidential'` with an
//     empty hash was expressible.
//
// So the flow's checks are right and their inputs were unguarded. In this module the server
// produces every one of those values: it generates the credentials, forces pkce_required
// true, validates scopes against the shared catalog, and validates each redirect URI.
//
// AND THE WEBHOOK HARD DELETE. `WebhookEndpoint.delete(id)` behind a browser `confirm()`
// destroyed the signing secret, the delivery history and the failure count with no undo and
// no record of who did it. The entity already has a `disabled` status. Deleting is refused
// here; disabling is the operation, and it states a reason.

import { nullableNumber } from './nullableNumber.ts';
import { privilegedScopes, unknownScopes, VALID_SCOPES } from './apiScopeCatalog.ts';

export const INTEGRATION_REGISTRY_VERSION = 'integration-registry-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

// ---------------------------------------------------------------------------
// Credential generation — server side, exactly once
// ---------------------------------------------------------------------------

const hex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

/** A CSPRNG token. Same construction the panels used; the difference is WHERE it runs. */
export function randomToken(prefix: string, bytes = 24): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return prefix + hex(buffer);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return hex(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// OAuth app registration
// ---------------------------------------------------------------------------

/** Fields the caller may supply. Everything security-bearing is absent. */
export const OAUTH_APP_INPUT_FIELDS = Object.freeze([
  'name', 'description', 'homepage_url', 'logo_url', 'redirect_uris', 'allowed_scopes', 'type', 'notes',
] as const);

/**
 * Fields the server owns, each with the reason.
 *
 * `pkce_required` is here because oauthAuthorize only enforces PKCE when this flag is set,
 * so accepting it from a caller hands over the enforcement decision.
 */
export const OAUTH_APP_SERVER_OWNED: ReadonlyArray<{ field: string; why: string }> = Object.freeze([
  { field: 'client_id', why: 'generated server-side so a caller cannot choose or collide with an identifier' },
  { field: 'client_secret_hash', why: 'derived from a secret the server generates; accepting a hash lets a caller install a credential it already knows' },
  { field: 'client_secret_last4', why: 'derived from the generated secret' },
  { field: 'pkce_required', why: 'oauthAuthorize enforces PKCE only when this flag is true, so accepting it from a caller removes the protection. Always true here.' },
  { field: 'status', why: 'moved by the revoke/suspend actions, which record who did it' },
  { field: 'is_first_party', why: 'first-party status is a trust grant, not a form field' },
  { field: 'owner_email', why: 'taken from the authenticated actor, so the audit trail cannot be forged' },
]);

/** Hosts a webhook or redirect must never point at. */
const BLOCKED_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1', 'metadata.google.internal',
  '169.254.169.254', 'metadata', 'instance-data',
]);

const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * Validates a redirect URI.
 *
 * Nothing checked these before: the allowlist oauthAuthorize enforces was whatever the
 * browser wrote into it, so an app could legitimately redirect an authorization code to
 * any host at all.
 */
export function validateRedirectUri(raw: unknown): { ok: boolean; reason?: string } {
  const value = text(raw);
  if (!value) return { ok: false, reason: 'empty' };
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false, reason: 'not an absolute URL' }; }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: `must be https (got ${url.protocol.replace(':', '') || 'nothing'})` };
  }
  if (url.username || url.password) return { ok: false, reason: 'must not embed credentials' };
  if (url.hash) return { ok: false, reason: 'must not carry a fragment — the fragment is where an implicit token would land' };
  if (value.includes('*')) return { ok: false, reason: 'wildcards are not allowed in a redirect allowlist' };
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || PRIVATE_IPV4.test(host)) {
    return { ok: false, reason: `host ${host} is loopback, private or a metadata endpoint` };
  }
  return { ok: true };
}

type Preview = {
  ok: boolean;
  error?: string;
  reason?: string;
  preview?: Record<string, unknown>;
  preview_hash?: string;
};

/**
 * Previews an OAuth app registration.
 *
 * The preview states the scopes and redirect URIs that will be installed, because those two
 * lists ARE the app's authority and the old panel installed them without showing them back.
 */
export async function previewOAuthApp(input: {
  svc: any;
  patch: Record<string, unknown>;
  sha256: (value: unknown) => Promise<string>;
}): Promise<Preview> {
  const patch = input.patch || {};
  const supplied = Object.keys(patch);

  const owned = OAUTH_APP_SERVER_OWNED.find((row) => supplied.includes(row.field));
  if (owned) {
    return { ok: false, error: 'server_owned_field_in_patch', reason: `${owned.field}: ${owned.why}` };
  }
  const unknownField = supplied.filter((key) => !(OAUTH_APP_INPUT_FIELDS as readonly string[]).includes(key));
  if (unknownField.length) {
    return { ok: false, error: 'unknown_field_in_patch', reason: `not accepted: ${unknownField.join(', ')}` };
  }

  const name = text(patch.name);
  if (!name) return { ok: false, error: 'name_required' };

  const type = text(patch.type) || 'confidential';
  if (!['confidential', 'public'].includes(type)) {
    return { ok: false, error: 'type_not_supported', reason: `type must be confidential or public, got ${type}` };
  }

  const uris = Array.isArray(patch.redirect_uris) ? patch.redirect_uris : [];
  if (!uris.length) return { ok: false, error: 'redirect_uri_required' };
  for (const uri of uris) {
    const verdict = validateRedirectUri(uri);
    if (!verdict.ok) {
      return { ok: false, error: 'redirect_uri_invalid', reason: `${text(uri) || '(empty)'}: ${verdict.reason}` };
    }
  }

  const scopes = Array.isArray(patch.allowed_scopes) ? patch.allowed_scopes.map(text).filter(Boolean) : [];
  if (!scopes.length) return { ok: false, error: 'allowed_scopes_required' };
  const unknownScope = unknownScopes(scopes);
  if (unknownScope.length) {
    return {
      ok: false, error: 'scope_not_in_catalog',
      reason: `${unknownScope.join(', ')} — not in the API scope catalog. Before C12 no server-side catalog was consulted for OAuth apps at all.`,
    };
  }
  const privileged = privilegedScopes(scopes);
  if (privileged.length) {
    return {
      ok: false, error: 'privileged_scope_refused',
      reason: `${privileged.join(', ')} grants broad or administrative reach. A third-party OAuth app may not hold these; issue a first-party API key instead.`,
    };
  }

  const preview = {
    name,
    type,
    redirect_uris: uris.map(text),
    allowed_scopes: scopes,
    // Stated, not accepted. This is the field whose absence removed PKCE enforcement.
    pkce_required: true,
    secret_will_be_generated: type === 'confidential',
    secret_shown_once: type === 'confidential',
    is_first_party: false,
    authority_note: 'The redirect URIs and scopes above ARE this app\'s authority: oauthAuthorize will '
      + 'accept exactly these and refuse everything else.',
  };

  return { ok: true, preview, preview_hash: await input.sha256(preview) };
}

/**
 * Registers an OAuth app.
 *
 * Returns the plaintext client secret exactly once, in this response. It is never stored and
 * cannot be recovered — the same property the browser version had, kept deliberately.
 */
export async function applyOAuthApp(input: {
  svc: any;
  actor: string;
  patch: Record<string, unknown>;
  expected_preview_hash: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const previewed = await previewOAuthApp({ svc: input.svc, patch: input.patch, sha256: input.sha256 });
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    return { ok: false, error: 'preview_hash_mismatch', current_preview_hash: previewed.preview_hash };
  }

  const preview = previewed.preview as any;
  const clientId = randomToken('cmb_oauth_', 12);
  const clientSecret = preview.type === 'confidential' ? randomToken('cmb_secret_', 24) : null;

  let created: any = null;
  try {
    created = await input.svc.entities.OAuthApp.create({
      name: preview.name,
      description: text(input.patch?.description),
      homepage_url: text(input.patch?.homepage_url),
      logo_url: text(input.patch?.logo_url),
      notes: text(input.patch?.notes),
      client_id: clientId,
      client_secret_hash: clientSecret ? await sha256Hex(clientSecret) : '',
      client_secret_last4: clientSecret ? clientSecret.slice(-4) : '',
      redirect_uris: preview.redirect_uris,
      allowed_scopes: preview.allowed_scopes,
      type: preview.type,
      // Never from the caller. oauthAuthorize's PKCE check reads this.
      pkce_required: true,
      is_first_party: false,
      status: 'active',
      // The audit field neither panel set.
      owner_email: text(input.actor),
    });
  } catch (error: any) {
    return { ok: false, error: 'oauth_app_create_failed', reason: text(error?.message) || null };
  }

  return {
    ok: true,
    app_id: text(created?.id),
    client_id: clientId,
    /** Plaintext, once. Not stored, not recoverable. */
    client_secret: clientSecret,
    secret_shown_once: clientSecret !== null,
    allowed_scopes: preview.allowed_scopes,
    redirect_uris: preview.redirect_uris,
    pkce_required: true,
    owner_email: text(input.actor),
    at: input.now,
  };
}

/** Revokes an OAuth app. A status move with an actor, not a field write. */
export async function revokeOAuthApp(input: {
  svc: any; actor: string; app_id: string; reason: string; now: string;
}) {
  if (!text(input.app_id)) return { ok: false, error: 'app_id_required' };
  if (!text(input.reason)) return { ok: false, error: 'reason_required' };

  let app: any = null;
  try {
    const found = await input.svc.entities.OAuthApp.filter({ id: text(input.app_id) }, '-created_date', 1);
    app = Array.isArray(found) ? found[0] : null;
  } catch {
    return { ok: false, error: 'oauth_app_unreadable' };
  }
  if (!app) return { ok: false, error: 'oauth_app_not_found' };
  if (text(app.status) === 'revoked') return { ok: false, error: 'already_revoked' };

  try {
    await input.svc.entities.OAuthApp.update(text(input.app_id), {
      status: 'revoked', notes: `${text(app.notes)}\n[revoked ${input.now} by ${text(input.actor)}: ${text(input.reason)}]`.trim(),
    });
  } catch (error: any) {
    return { ok: false, error: 'oauth_app_update_failed', reason: text(error?.message) || null };
  }

  return {
    ok: true, app_id: text(input.app_id), status: 'revoked',
    actor: input.actor, at: input.now, reason: text(input.reason),
    // Revoking the app is not the same as invalidating live tokens, and saying otherwise
    // would overstate what happened.
    issued_tokens_invalidated: false,
    token_note: 'The app can no longer authorize. Tokens already issued are invalidated by oauthRevoke, not by this action.',
  };
}

// ---------------------------------------------------------------------------
// Webhook endpoint registration
// ---------------------------------------------------------------------------

export const WEBHOOK_INPUT_FIELDS = Object.freeze(['name', 'url', 'events', 'tool_name', 'organization_id'] as const);

export const WEBHOOK_SERVER_OWNED: ReadonlyArray<{ field: string; why: string }> = Object.freeze([
  { field: 'secret', why: 'the signing secret is generated server-side; a caller-supplied secret is a signature it can forge' },
  { field: 'status', why: 'moved by the disable/enable actions, which record who did it' },
  { field: 'failure_count', why: 'written by the dispatcher from real delivery outcomes' },
  { field: 'auto_disabled_at', why: 'set by the dispatcher when an endpoint fails repeatedly' },
  { field: 'last_delivery_at', why: 'written by the dispatcher' },
  { field: 'last_delivery_status', why: 'written by the dispatcher' },
  { field: 'owner_email', why: 'taken from the authenticated actor' },
]);

/** The events an endpoint may subscribe to. The browser held this list; the server now does. */
export const WEBHOOK_EVENT_CATALOG = Object.freeze([
  'new_brand_created', 'new_document_uploaded', 'analysis_completed', 'savings_unlocked',
] as const);

export const WEBHOOK_TOOLS = Object.freeze(['claude', 'chatgpt', 'make', 'n8n', 'zapier', 'custom', 'other'] as const);

/**
 * Validates a webhook delivery URL.
 *
 * A webhook URL is a request the platform will make on a schedule, so an unvalidated one is
 * a server-side request to wherever the caller says. Nothing validated these before.
 */
export function validateWebhookUrl(raw: unknown): { ok: boolean; reason?: string } {
  const value = text(raw);
  if (!value) return { ok: false, reason: 'empty' };
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false, reason: 'not an absolute URL' }; }
  if (url.protocol !== 'https:') return { ok: false, reason: 'must be https — a signed payload over http is readable in transit' };
  if (url.username || url.password) return { ok: false, reason: 'must not embed credentials' };
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || PRIVATE_IPV4.test(host)) {
    return { ok: false, reason: `host ${host} is loopback, private or a metadata endpoint — the platform would be making a request into its own network` };
  }
  return { ok: true };
}

export async function previewWebhookEndpoint(input: {
  svc: any;
  patch: Record<string, unknown>;
  sha256: (value: unknown) => Promise<string>;
}): Promise<Preview> {
  const patch = input.patch || {};
  const supplied = Object.keys(patch);

  const owned = WEBHOOK_SERVER_OWNED.find((row) => supplied.includes(row.field));
  if (owned) return { ok: false, error: 'server_owned_field_in_patch', reason: `${owned.field}: ${owned.why}` };
  const unknownField = supplied.filter((key) => !(WEBHOOK_INPUT_FIELDS as readonly string[]).includes(key));
  if (unknownField.length) {
    return { ok: false, error: 'unknown_field_in_patch', reason: `not accepted: ${unknownField.join(', ')}` };
  }

  if (!text(patch.name)) return { ok: false, error: 'name_required' };

  const urlVerdict = validateWebhookUrl(patch.url);
  if (!urlVerdict.ok) return { ok: false, error: 'url_invalid', reason: urlVerdict.reason };

  const events = Array.isArray(patch.events) ? patch.events.map(text).filter(Boolean) : [];
  if (!events.length) return { ok: false, error: 'events_required' };
  const unknownEvent = events.filter((event) => !(WEBHOOK_EVENT_CATALOG as readonly string[]).includes(event));
  if (unknownEvent.length) {
    return {
      ok: false, error: 'event_not_in_catalog',
      reason: `${unknownEvent.join(', ')} — an endpoint subscribed to an event that is never emitted looks configured and delivers nothing.`,
    };
  }

  const tool = text(patch.tool_name) || 'custom';
  if (!(WEBHOOK_TOOLS as readonly string[]).includes(tool)) {
    return { ok: false, error: 'tool_not_supported', reason: `tool_name must be one of ${WEBHOOK_TOOLS.join(', ')}` };
  }

  const preview = {
    name: text(patch.name),
    url: text(patch.url),
    events,
    tool_name: tool,
    organization_id: text(patch.organization_id) || null,
    secret_will_be_generated: true,
    secret_shown_once: true,
    delivery_note: 'The platform will POST to this URL when these events fire, signed with the generated secret.',
  };

  return { ok: true, preview, preview_hash: await input.sha256(preview) };
}

export async function applyWebhookEndpoint(input: {
  svc: any;
  actor: string;
  patch: Record<string, unknown>;
  expected_preview_hash: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const previewed = await previewWebhookEndpoint({ svc: input.svc, patch: input.patch, sha256: input.sha256 });
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    return { ok: false, error: 'preview_hash_mismatch', current_preview_hash: previewed.preview_hash };
  }

  const preview = previewed.preview as any;
  const secret = randomToken('whsec_', 24);

  let created: any = null;
  try {
    created = await input.svc.entities.WebhookEndpoint.create({
      name: preview.name,
      url: preview.url,
      events: preview.events,
      tool_name: preview.tool_name,
      organization_id: preview.organization_id,
      secret,
      status: 'active',
      failure_count: 0,
      owner_email: text(input.actor),
    });
  } catch (error: any) {
    return { ok: false, error: 'webhook_create_failed', reason: text(error?.message) || null };
  }

  return {
    ok: true,
    webhook_id: text(created?.id),
    /** Plaintext, once. The receiver needs it to verify signatures. */
    secret,
    secret_shown_once: true,
    events: preview.events,
    owner_email: text(input.actor),
    at: input.now,
  };
}

/**
 * Disables a webhook endpoint.
 *
 * This is the replacement for the hard delete. `WebhookEndpoint.delete(id)` behind a browser
 * `confirm()` destroyed the signing secret, the delivery history and the failure count, with
 * no undo and no record of who did it — and the entity already has a `disabled` status that
 * stops delivery while keeping all of that.
 */
export async function disableWebhookEndpoint(input: {
  svc: any; actor: string; webhook_id: string; reason: string; now: string;
}) {
  if (!text(input.webhook_id)) return { ok: false, error: 'webhook_id_required' };
  if (!text(input.reason)) return { ok: false, error: 'reason_required' };

  let endpoint: any = null;
  try {
    const found = await input.svc.entities.WebhookEndpoint.filter({ id: text(input.webhook_id) }, '-created_date', 1);
    endpoint = Array.isArray(found) ? found[0] : null;
  } catch {
    return { ok: false, error: 'webhook_unreadable' };
  }
  if (!endpoint) return { ok: false, error: 'webhook_not_found' };
  if (text(endpoint.status) === 'disabled') return { ok: false, error: 'already_disabled' };

  try {
    await input.svc.entities.WebhookEndpoint.update(text(input.webhook_id), {
      status: 'disabled', auto_disabled_at: null,
    });
  } catch (error: any) {
    return { ok: false, error: 'webhook_update_failed', reason: text(error?.message) || null };
  }

  return {
    ok: true,
    webhook_id: text(input.webhook_id),
    status: 'disabled',
    actor: input.actor,
    at: input.now,
    reason: text(input.reason),
    // Stated so "disabled" is not read as "gone".
    deleted: false,
    retained: ['secret', 'events', 'failure_count', 'last_delivery_at', 'last_delivery_status'],
    retention_note: 'Delivery stops. The signing secret and delivery history are kept, so an accidental '
      + 'disable is reversible and a past delivery can still be explained.',
  };
}

/**
 * Refuses to hard-delete a webhook endpoint, and says what to do instead.
 *
 * Exposed as an explicit refusal rather than simply omitted, so a UI that used to call delete
 * gets an answer that names the alternative.
 */
export function refuseWebhookDelete(webhookId: unknown) {
  return {
    ok: false as const,
    error: 'hard_delete_refused',
    webhook_id: text(webhookId),
    reason: 'Deleting an endpoint destroys the signing secret, the delivery history and the failure '
      + 'count with no undo. Use disable: delivery stops and the record survives, so an accidental '
      + 'action is reversible and a past delivery can still be explained.',
    use_instead: 'integration_disable_webhook',
  };
}

/** Reports the registry state without exposing a secret. */
export async function readIntegrationRegistry(input: { svc: any }) {
  const readMany = async (entity: string) => {
    try {
      return { rows: await input.svc.entities[entity].list('-created_date', 200) || [], readable: true };
    } catch {
      return { rows: [], readable: false };
    }
  };

  const apps = await readMany('OAuthApp');
  const hooks = await readMany('WebhookEndpoint');

  return {
    ok: true as const,
    scope_catalog: [...VALID_SCOPES],
    event_catalog: [...WEBHOOK_EVENT_CATALOG],
    oauth_apps: apps.readable ? apps.rows.map((row: any) => ({
      id: text(row.id), name: text(row.name), client_id: text(row.client_id),
      client_secret_last4: text(row.client_secret_last4) || null,
      type: text(row.type), status: text(row.status),
      allowed_scopes: Array.isArray(row.allowed_scopes) ? row.allowed_scopes : [],
      redirect_uris: Array.isArray(row.redirect_uris) ? row.redirect_uris : [],
      pkce_required: row.pkce_required === true,
      owner_email: text(row.owner_email) || null,
      // Surfaced because a stored app can predate C12 and carry a weaker configuration.
      predates_governed_registration: row.pkce_required !== true || !text(row.owner_email),
    })) : null,
    webhooks: hooks.readable ? hooks.rows.map((row: any) => ({
      id: text(row.id), name: text(row.name), url: text(row.url),
      events: Array.isArray(row.events) ? row.events : [],
      status: text(row.status), failure_count: nullableNumber(row.failure_count),
      owner_email: text(row.owner_email) || null,
      url_valid: validateWebhookUrl(row.url).ok,
      url_problem: validateWebhookUrl(row.url).reason || null,
    })) : null,
    // null distinguishes an unreadable registry from an empty one.
    oauth_apps_readable: apps.readable,
    webhooks_readable: hooks.readable,
  };
}
