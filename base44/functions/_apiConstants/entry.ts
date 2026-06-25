// Reference doc only. Each function inlines its own copy of these constants.
// (Deno deploy requires every function to be a Deno.serve handler — this file
// exists as documentation and is intentionally a no-op handler.)
Deno.serve(() => new Response(JSON.stringify({
  note: "Reference constants doc — see source comments.",
  valid_scopes: [
    "read", "write", "admin",
    "read:kpis", "read:brands", "read:analyses", "read:documents", "read:providers",
    "read:savings", "read:trackers", "read:reports", "read:integrations", "read:users",
    "write:reports", "write:documents", "write:trackers",
    "trigger:analysis", "update:trackers",
    "manage:integrations", "manage:webhooks",
  ],
  rate_limit_default_per_min: 120,
  access_token_ttl_seconds: 3600,
  refresh_token_ttl_seconds: 60 * 60 * 24 * 60,
  auth_code_ttl_seconds: 600,
  idempotency_ttl_seconds: 60 * 60 * 24,
  max_request_bytes: 256 * 1024,
}), { headers: { "Content-Type": "application/json" } }));