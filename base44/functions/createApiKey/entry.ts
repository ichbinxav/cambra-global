import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateKey() {
  // cmb_live_<32 random hex chars>
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return `cmb_live_${random}`;
}

const VALID_SCOPES = [
  "read:kpis",
  "read:brands",
  "read:analyses",
  "write:reports",
  "trigger:analysis",
  "update:trackers",
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const { name, tool_name = "custom", scopes = [], expires_at, notes } = await req.json();
    if (!name || typeof name !== "string") {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }
    const cleanScopes = (scopes || []).filter(s => VALID_SCOPES.includes(s));
    if (cleanScopes.length === 0) {
      return Response.json({ error: "At least one valid scope is required" }, { status: 400 });
    }

    const rawKey = generateKey();
    const key_hash = await sha256Hex(rawKey);
    const key_prefix = rawKey.slice(0, 12); // cmb_live_xxx
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
      usage_count: 0,
      auth_type: "api_key",
      expires_at: expires_at || undefined,
      notes: notes || undefined,
    });

    // Return the raw key ONCE — never stored, never retrievable again.
    return Response.json({
      success: true,
      key_id: created.id,
      api_key: rawKey,
      key_prefix,
      key_last4,
      scopes: cleanScopes,
      warning: "Store this key now. It will never be shown again.",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});