// OAuth 2.0 — Authorization endpoint (renders consent + issues auth code)
// =============================================================================
// GET  /functions/oauthAuthorize?client_id=...&redirect_uri=...&scope=...
//      &response_type=code&state=...&code_challenge=...&code_challenge_method=S256
//
// Requires the user to be logged in via Base44 auth. On consent, issues a
// short-lived authorization code (10 min) and redirects back to the client.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(prefix) {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${hex}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlPage(body) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>CAMBRA · Authorize</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,"Inter",sans-serif;background:#06080F;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
      .card{max-width:440px;width:100%;background:linear-gradient(180deg,#0e1226,#06080F);border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:32px;box-shadow:0 30px 80px -28px rgba(0,0,0,.7)}
      h1{font-size:22px;font-weight:900;letter-spacing:-.02em;margin-bottom:8px}
      p{color:rgba(255,255,255,.65);font-size:14px;line-height:1.55;margin-bottom:20px}
      .app{display:flex;align-items:center;gap:12px;padding:14px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);margin-bottom:20px}
      .app-name{font-weight:700;font-size:14px}
      .app-meta{font-size:11px;color:rgba(255,255,255,.55);margin-top:2px;font-family:monospace}
      .scopes{margin-bottom:24px}
      .scopes-title{font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:10px}
      .scope{display:flex;gap:8px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.03);font-size:12px;margin-bottom:6px;font-family:monospace}
      .scope::before{content:"✓";color:#2CA7C1;font-weight:700}
      .btns{display:flex;gap:10px}
      button,a.btn{flex:1;height:44px;border:0;border-radius:999px;font-size:14px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;transition:transform .15s}
      button:hover,a.btn:hover{transform:translateY(-1px)}
      .approve{background:linear-gradient(135deg,#1F4ED8,#2CA7C1);color:#fff}
      .deny{background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.12)}
      .footer{margin-top:20px;font-size:11px;color:rgba(255,255,255,.4);text-align:center}
    </style></head><body>${body}</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const base44 = createClientFromRequest(req);

  // Both GET (render consent) and POST (process consent) hit this function
  const params = req.method === "POST" ? Object.fromEntries(new URLSearchParams(await req.text())) : Object.fromEntries(url.searchParams);
  const { client_id, redirect_uri, scope = "", response_type = "code", state = "", code_challenge, code_challenge_method = "S256", action } = params;

  if (response_type !== "code") return new Response("unsupported_response_type", { status: 400 });
  if (!client_id || !redirect_uri) return new Response("invalid_request: client_id and redirect_uri required", { status: 400 });

  // Validate app + redirect_uri
  const apps = await base44.asServiceRole.entities.OAuthApp.filter({ client_id });
  const app = apps?.[0];
  if (!app || app.status !== "active") return new Response("invalid_client", { status: 400 });
  if (!app.redirect_uris.includes(redirect_uri)) return new Response("invalid_redirect_uri", { status: 400 });
  if (app.pkce_required && !code_challenge) return new Response("invalid_request: PKCE required (code_challenge missing)", { status: 400 });

  // Require auth
  let user;
  try { user = await base44.auth.me(); } catch { user = null; }
  if (!user) {
    const loginUrl = `/auth/start?next=${encodeURIComponent(url.pathname + url.search)}`;
    return Response.redirect(new URL(loginUrl, url.origin), 302);
  }

  // FIX 2 — resolve the user's organization membership (best-effort).
  // Persisted on the AuthorizationCode and then carried into the issued OAuthToken.
  let organization_id = null;
  try {
    const members = await base44.asServiceRole.entities.OrganizationMember
      .filter({ user_email: user.email, status: "active" }, "-created_date", 1)
      .catch(() => []);
    if (members?.[0]?.organization_id) organization_id = members[0].organization_id;
  } catch { /* org lookup is best-effort */ }

  const requestedScopes = scope.split(/[\s,]+/).filter(Boolean);
  const invalidScopes = requestedScopes.filter((s) => !app.allowed_scopes.includes(s));
  if (invalidScopes.length) return new Response(`invalid_scope: ${invalidScopes.join(", ")}`, { status: 400 });

  // POST = consent submitted
  if (req.method === "POST" && action) {
    if (action === "deny") {
      const back = new URL(redirect_uri);
      back.searchParams.set("error", "access_denied");
      if (state) back.searchParams.set("state", state);
      return Response.redirect(back.toString(), 302);
    }
    const code = randomToken("cmb_ac_");
    await base44.asServiceRole.entities.OAuthAuthorizationCode.create({
      code_hash: await sha256Hex(code),
      client_id,
      user_email: user.email,
      organization_id, // FIX 2
      redirect_uri,
      scopes: requestedScopes,
      code_challenge,
      code_challenge_method,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      used: false,
    });
    const back = new URL(redirect_uri);
    back.searchParams.set("code", code);
    if (state) back.searchParams.set("state", state);
    return Response.redirect(back.toString(), 302);
  }

  // GET = render consent — first-party apps auto-approve
  if (app.is_first_party) {
    const code = randomToken("cmb_ac_");
    await base44.asServiceRole.entities.OAuthAuthorizationCode.create({
      code_hash: await sha256Hex(code), client_id, user_email: user.email, organization_id,
      redirect_uri,
      scopes: requestedScopes, code_challenge, code_challenge_method,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), used: false,
    });
    const back = new URL(redirect_uri);
    back.searchParams.set("code", code);
    if (state) back.searchParams.set("state", state);
    return Response.redirect(back.toString(), 302);
  }

  const scopeRows = requestedScopes.map((s) => `<div class="scope">${escapeHtml(s)}</div>`).join("");
  const formAction = escapeHtml(url.pathname + url.search);
  return htmlPage(`
    <div class="card">
      <h1>Authorize ${escapeHtml(app.name)}</h1>
      <p>${escapeHtml(app.description || `${app.name} is requesting access to your CAMBRA account.`)}</p>
      <div class="app">
        <div>
          <div class="app-name">${escapeHtml(app.name)}</div>
          <div class="app-meta">client_id: ${escapeHtml(app.client_id)}</div>
        </div>
      </div>
      <div class="scopes">
        <div class="scopes-title">Requested permissions</div>
        ${scopeRows || '<div class="scope">basic profile</div>'}
      </div>
      <form method="POST" action="${formAction}">
        <input type="hidden" name="client_id" value="${escapeHtml(client_id)}">
        <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
        <input type="hidden" name="scope" value="${escapeHtml(scope)}">
        <input type="hidden" name="state" value="${escapeHtml(state)}">
        <input type="hidden" name="response_type" value="${escapeHtml(response_type)}">
        ${code_challenge ? `<input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">` : ""}
        <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method)}">
        <div class="btns">
          <button type="submit" name="action" value="deny" class="deny">Deny</button>
          <button type="submit" name="action" value="approve" class="approve">Authorize</button>
        </div>
      </form>
      <div class="footer">Signed in as ${escapeHtml(user.email)}</div>
    </div>
  `);
});