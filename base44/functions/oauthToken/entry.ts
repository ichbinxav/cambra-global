// OAuth 2.0 — Token endpoint
// =============================================================================
// POST /functions/oauthToken
//   Body (form or JSON):
//     grant_type=authorization_code | refresh_token
//     code, redirect_uri, client_id, client_secret?, code_verifier?
//     refresh_token? (for refresh_token grant)
//
// Returns: { access_token, token_type:"Bearer", expires_in, refresh_token, scope }
//
// Endpoint classification: PUBLIC_OK (by RFC 6749 — token endpoints are public
// by design). Authentication is per-request via one of:
//   - client_secret for confidential OAuth apps (constant-time compare against
//     the stored SHA-256 hash);
//   - PKCE code_verifier that must hash back to the stored code_challenge for
//     public OAuth apps.
// Authorization codes are single-use (marked `used=true` on redemption) and
// hard-expire; refresh tokens are rotated on every refresh_token grant.
// asServiceRole justification: OAuthApp / OAuthAuthorizationCode / OAuthToken
// are admin-write RLS entities. The token endpoint has no user session — it
// has a client_id and, if applicable, a client_secret. Every access to these
// entities passes the client_id/secret+PKCE checks above.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const ACCESS_TTL_SECONDS = 3600;            // 1h
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 60; // 60d

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Base64Url(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function randomToken(prefix) {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${hex}`;
}
function tokenResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Pragma": "no-cache" },
  });
}
function errorResponse(error, description, status = 400) {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const MAX_BODY_BYTES = 16 * 1024; // 16 KB plenty for token requests

async function parseBody(req) {
  const ct = req.headers.get("content-type") || "";
  const cl = parseInt(req.headers.get("content-length") || "0", 10);
  if (cl > MAX_BODY_BYTES) throw new Error("request_too_large");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("request_too_large");
  if (ct.includes("application/json")) return JSON.parse(text);
  return Object.fromEntries(new URLSearchParams(text));
}

// Constant-time string comparison to prevent timing attacks on client_secret
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  if (req.method !== "POST") return errorResponse("invalid_request", "POST only", 405);
  const base44 = createClientFromRequest(req);

  let body;
  try { body = await parseBody(req); }
  catch (e) {
    if (e.message === "request_too_large") return errorResponse("invalid_request", "Request body too large", 413);
    body = {};
  }
  const { grant_type, client_id, client_secret, redirect_uri, code, code_verifier, refresh_token, scope } = body;

  if (!grant_type) return errorResponse("invalid_request", "grant_type required");
  if (!client_id) return errorResponse("invalid_client", "client_id required");

  const apps = await base44.asServiceRole.entities.OAuthApp.filter({ client_id });
  const app = apps?.[0];
  if (!app || app.status !== "active") return errorResponse("invalid_client", "Unknown or suspended client");

  // Confidential clients must present client_secret (constant-time compare)
  if (app.type === "confidential") {
    if (!client_secret) return errorResponse("invalid_client", "client_secret required for confidential clients");
    const hash = await sha256Hex(client_secret);
    if (!timingSafeEqual(hash, app.client_secret_hash || "")) return errorResponse("invalid_client", "Invalid client_secret");
  }

  // -------------------- authorization_code --------------------
  if (grant_type === "authorization_code") {
    if (!code || !redirect_uri) return errorResponse("invalid_request", "code and redirect_uri required");
    const codeHash = await sha256Hex(code);
    const matches = await base44.asServiceRole.entities.OAuthAuthorizationCode.filter({ code_hash: codeHash });
    const ac = matches?.[0];
    if (!ac || ac.used) return errorResponse("invalid_grant", "Authorization code invalid or already used");
    if (new Date(ac.expires_at) < new Date()) return errorResponse("invalid_grant", "Authorization code expired");
    if (ac.client_id !== client_id) return errorResponse("invalid_grant", "Code/client mismatch");
    if (ac.redirect_uri !== redirect_uri) return errorResponse("invalid_grant", "redirect_uri mismatch");

    // PKCE
    if (ac.code_challenge) {
      if (!code_verifier) return errorResponse("invalid_request", "code_verifier required");
      const expected = ac.code_challenge_method === "S256" ? await sha256Base64Url(code_verifier) : code_verifier;
      if (expected !== ac.code_challenge) return errorResponse("invalid_grant", "PKCE verification failed");
    }

    await base44.asServiceRole.entities.OAuthAuthorizationCode.update(ac.id, { used: true });

    const accessToken = randomToken("cmb_at_");
    const refreshToken = randomToken("cmb_rt_");
    const now = Date.now();
    await base44.asServiceRole.entities.OAuthToken.create({
      access_token_hash: await sha256Hex(accessToken),
      access_token_last4: accessToken.slice(-4),
      refresh_token_hash: await sha256Hex(refreshToken),
      refresh_token_last4: refreshToken.slice(-4),
      client_id,
      user_email: ac.user_email,
      organization_id: ac.organization_id || null, // FIX 2 — carry tenant scope from auth code
      scopes: ac.scopes,
      access_token_expires_at: new Date(now + ACCESS_TTL_SECONDS * 1000).toISOString(),
      refresh_token_expires_at: new Date(now + REFRESH_TTL_SECONDS * 1000).toISOString(),
      status: "active",
    });
    return tokenResponse({
      access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refreshToken, scope: ac.scopes.join(" "),
    });
  }

  // -------------------- refresh_token --------------------
  if (grant_type === "refresh_token") {
    if (!refresh_token) return errorResponse("invalid_request", "refresh_token required");
    const rtHash = await sha256Hex(refresh_token);
    const matches = await base44.asServiceRole.entities.OAuthToken.filter({ refresh_token_hash: rtHash });
    const tok = matches?.[0];
    if (!tok || tok.status !== "active") return errorResponse("invalid_grant", "Invalid refresh token");
    if (tok.client_id !== client_id) return errorResponse("invalid_grant", "Client mismatch");
    if (tok.refresh_token_expires_at && new Date(tok.refresh_token_expires_at) < new Date()) {
      return errorResponse("invalid_grant", "Refresh token expired");
    }

    // Rotate refresh token, issue new access
    const accessToken = randomToken("cmb_at_");
    const refreshTokenNew = randomToken("cmb_rt_");
    const now = Date.now();
    await base44.asServiceRole.entities.OAuthToken.update(tok.id, { status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "refresh_rotation" });
    await base44.asServiceRole.entities.OAuthToken.create({
      access_token_hash: await sha256Hex(accessToken),
      access_token_last4: accessToken.slice(-4),
      refresh_token_hash: await sha256Hex(refreshTokenNew),
      refresh_token_last4: refreshTokenNew.slice(-4),
      client_id,
      user_email: tok.user_email,
      organization_id: tok.organization_id || null, // FIX 2 — preserve tenant scope on refresh
      scopes: tok.scopes,
      access_token_expires_at: new Date(now + ACCESS_TTL_SECONDS * 1000).toISOString(),
      refresh_token_expires_at: new Date(now + REFRESH_TTL_SECONDS * 1000).toISOString(),
      status: "active",
    });
    return tokenResponse({
      access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refreshTokenNew, scope: tok.scopes.join(" "),
    });
  }

  return errorResponse("unsupported_grant_type", `Unsupported grant_type: ${grant_type}`);
});