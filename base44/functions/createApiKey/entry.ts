// Create API key (admin-only). Returns the raw key ONCE — never stored.
// SHA-256 hashed at rest. Optional organization_id for tenant binding.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const VALID_SCOPES = [
  "read", "write", "admin", "platform",
  "read:kpis", "read:brands", "read:analyses", "read:documents", "read:providers",
  "read:savings", "read:trackers", "read:reports", "read:integrations", "read:users",
  "write:reports", "write:documents", "write:trackers",
  "trigger:analysis",
  "manage:integrations", "manage:webhooks",
];

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return `cmb_live_${random}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { name, tool_name = "custom", scopes = [], expires_at, notes, organization_id, ip_allowlist = [], rate_limit_per_minute } = body;

    if (!name || typeof name !== "string" || name.length > 80) {
      return Response.json({ error: "invalid_request", message: "name is required (max 80 chars)" }, { status: 400 });
    }
    const cleanScopes = (Array.isArray(scopes) ? scopes : []).filter(s => VALID_SCOPES.includes(s));
    if (cleanScopes.length === 0) {
      return Response.json({ error: "invalid_request", message: "at least one valid scope is required" }, { status: 400 });
    }
    // Validate IP allowlist entries (basic format check)
    const ipRe = /^(\d{1,3}\.){3}\d{1,3}(\/(16|24))?$/;
    const cleanIps = (Array.isArray(ip_allowlist) ? ip_allowlist : []).filter(ip => typeof ip === "string" && ipRe.test(ip));

    // Validate organization exists if provided
    let orgId = organization_id || null;
    if (orgId) {
      const org = await base44.asServiceRole.entities.Organization.get(orgId).catch(() => null);
      if (!org) return Response.json({ error: "invalid_request", message: "organization_id not found" }, { status: 400 });
    }

    const rawKey = generateKey();
    const key_hash = await sha256Hex(rawKey);
    const key_prefix = rawKey.slice(0, 12);
    const key_last4 = rawKey.slice(-4);

    const created = await base44.asServiceRole.entities.ApiKey.create({
      name,
      tool_name,
      key_prefix,
      key_hash,
      key_last4,
      scopes: cleanScopes,
      status: "active",
      owner_email: user.email,
      organization_id: orgId,
      ip_allowlist: cleanIps,
      rate_limit_per_minute: typeof rate_limit_per_minute === "number" ? rate_limit_per_minute : undefined,
      usage_count: 0,
      auth_type: "api_key",
      expires_at: expires_at || undefined,
      notes: notes || undefined,
    });

    return Response.json({
      success: true,
      key_id: created.id,
      api_key: rawKey,
      key_prefix,
      key_last4,
      scopes: cleanScopes,
      organization_id: orgId,
      warning: "Store this key now. It will never be shown again.",
    });
  } catch (error) {
    return Response.json({ error: "internal_error", message: error.message }, { status: 500 });
  }
});