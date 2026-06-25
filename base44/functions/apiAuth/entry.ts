// Shared helpers for the external API layer.
// NOTE: deno deploy — no local imports allowed in other functions.
// This file is invoked via base44.functions.invoke('apiAuth', ...).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const { action, api_key, endpoint, method, scope, status_code, status, ip_address, user_agent, duration_ms, error_message, payload_summary } = await req.json();

    const base44 = createClientFromRequest(req);

    if (action === "verify") {
      if (!api_key || typeof api_key !== "string") {
        return Response.json({ valid: false, reason: "missing_key" });
      }
      const hash = await sha256Hex(api_key);
      const matches = await base44.asServiceRole.entities.ApiKey.filter({ key_hash: hash });
      if (!matches || matches.length === 0) {
        return Response.json({ valid: false, reason: "invalid_key" });
      }
      const key = matches[0];
      if (key.status !== "active") {
        return Response.json({ valid: false, reason: "revoked", key_id: key.id });
      }
      if (key.expires_at && new Date(key.expires_at) < new Date()) {
        return Response.json({ valid: false, reason: "expired", key_id: key.id });
      }
      return Response.json({
        valid: true,
        key_id: key.id,
        name: key.name,
        tool_name: key.tool_name,
        scopes: key.scopes || [],
        key_prefix: key.key_prefix,
      });
    }

    if (action === "log") {
      await base44.asServiceRole.entities.ApiActivityLog.create({
        api_key_id: api_key?.id,
        api_key_name: api_key?.name,
        key_prefix: api_key?.key_prefix,
        tool_name: api_key?.tool_name,
        endpoint,
        method,
        scope_used: scope,
        status_code,
        status,
        ip_address,
        user_agent,
        duration_ms,
        error_message,
        payload_summary,
        request_id: crypto.randomUUID(),
      });

      // Update key usage stats (fire and forget semantics ok)
      if (api_key?.id) {
        await base44.asServiceRole.entities.ApiKey.update(api_key.id, {
          last_used_at: new Date().toISOString(),
          last_used_ip: ip_address,
          usage_count: (api_key.usage_count || 0) + 1,
        });
      }

      return Response.json({ logged: true });
    }

    return Response.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});