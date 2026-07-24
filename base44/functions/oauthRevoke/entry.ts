// OAuth 2.0 — Revocation endpoint (RFC 7009)
// POST /functions/oauthRevoke   body: token, token_type_hint? (access_token | refresh_token)
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { quarantineProbe } from "../../shared/internalGate.ts";

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// [QUARANTINE 2026-08-15] PURGE-2 (2026-07-24): OAuth2 revocation endpoint — external clients may call by URL, kept with probe.
Deno.serve(async (req) => {
  await quarantineProbe(createClientFromRequest(req), "oauthRevoke");
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const base44 = createClientFromRequest(req);
  const text = await req.text();
  const body = req.headers.get("content-type")?.includes("json") ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text));
  const { token, token_type_hint } = body;
  if (!token) return Response.json({ error: "invalid_request" }, { status: 400 });

  const hash = await sha256Hex(token);
  const field = token.startsWith("cmb_rt_") || token_type_hint === "refresh_token" ? "refresh_token_hash" : "access_token_hash";
  const matches = await base44.asServiceRole.entities.OAuthToken.filter({ [field]: hash });
  for (const t of matches || []) {
    await base44.asServiceRole.entities.OAuthToken.update(t.id, {
      status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "client_request",
    });
  }
  return new Response(null, { status: 200 });
});