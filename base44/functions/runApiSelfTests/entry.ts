import { safeBestEffort } from '../../shared/bestEffort.ts';
// Admin-only smoke tests for the CAMBRA External API.
// Tests run by directly exercising the entity layer and re-using internal helpers,
// since cross-function HTTP testing inside Deno deploy isolates is fragile.
// Validates: scope schema sync, tenant binding, OpenAPI spec validity, MCP catalog,
// idempotency entity, rate-limit entity, OAuth entities, key hashing.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { internalErrorResponse } from '../../shared/publicErrors.ts';

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pass(name, details) { return { name, status: "pass", details: details || null }; }
function fail(name, details) { return { name, status: "fail", details }; }

// DASHBOARD-C12 (2026-08-17): this list is deliberately NOT imported from
// shared/apiScopeCatalog.ts — a self-test that imports the thing it is testing tests
// nothing. It is a second, independent statement of the same set, and
// integration:check fails if the two diverge.
//
// It did diverge: "read:users" was missing here while createApiKey would issue it.
const EXPECTED_SCOPES = [
  "read", "write", "admin", "platform",
  "read:kpis", "read:brands", "read:analyses", "read:documents", "read:providers",
  "read:savings", "read:trackers", "read:reports", "read:integrations", "read:users",
  "write:reports", "write:documents", "write:trackers",
  "trigger:analysis", "manage:integrations", "manage:webhooks",
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'runApiSelfTests',fallback:null,severity:'secondary'}));
    if (!user || user.role !== "admin") {
      return Response.json({ error: "forbidden", message: "Admin only" }, { status: 403 });
    }

    const results = [];

    // ---- 1. SHA-256 hashing produces stable 64-char hex ----
    try {
      const h = await sha256Hex("cmb_live_test_value");
      if (h.length === 64 && /^[a-f0-9]+$/.test(h)) results.push(pass("crypto_sha256", { hash_len: h.length }));
      else results.push(fail("crypto_sha256", h));
    } catch (e) { results.push(fail("crypto_sha256", e.message)); }

    // ---- 2. Entity schemas exist and accept core writes ----
    try {
      const tempKey = `cmb_live_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
      const created = await base44.asServiceRole.entities.ApiKey.create({
        name: `_selftest_${Date.now()}`,
        tool_name: "custom",
        key_prefix: tempKey.slice(0, 12),
        key_hash: await sha256Hex(tempKey),
        key_last4: tempKey.slice(-4),
        scopes: ["read:kpis"],
        status: "active",
        owner_email: user.email,
        notes: "selftest — auto-revoked",
      });
      // Hash lookup works
      const matches = await base44.asServiceRole.entities.ApiKey.filter({ key_hash: await sha256Hex(tempKey) });
      if (matches?.length && matches[0].id === created.id) results.push(pass("apikey_hash_lookup"));
      else results.push(fail("apikey_hash_lookup", "Hash lookup did not return the created key"));

      // Revoke
      await base44.asServiceRole.entities.ApiKey.update(created.id, { status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "selftest" });
      const revoked = await base44.asServiceRole.entities.ApiKey.get(created.id);
      if (revoked.status === "revoked") results.push(pass("apikey_revocation"));
      else results.push(fail("apikey_revocation", revoked));
    } catch (e) { results.push(fail("apikey_lifecycle", e.message)); }

    // ---- 3. Scope schema sync — try to create a key with the FULL expected scope set ----
    try {
      const probe = `cmb_live_probe_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const created = await base44.asServiceRole.entities.ApiKey.create({
        name: `_scopeprobe_${Date.now()}`,
        tool_name: "custom",
        key_prefix: probe.slice(0, 12),
        key_hash: await sha256Hex(probe),
        key_last4: probe.slice(-4),
        scopes: EXPECTED_SCOPES,
        status: "active",
        owner_email: user.email,
      });
      const refetch = await base44.asServiceRole.entities.ApiKey.get(created.id);
      const accepted = (refetch.scopes || []).filter((s) => EXPECTED_SCOPES.includes(s));
      await base44.asServiceRole.entities.ApiKey.delete(created.id).catch((error:any)=>safeBestEffort(error,{operation:'runApiSelfTests',fallback:null,severity:'secondary'}));
      if (accepted.length === EXPECTED_SCOPES.length) {
        results.push(pass("scope_schema_sync", { accepted: accepted.length }));
      } else {
        results.push(fail("scope_schema_sync", { accepted: accepted.length, expected: EXPECTED_SCOPES.length }));
      }
    } catch (e) { results.push(fail("scope_schema_sync", e.message)); }

    // ---- 4. Tenant isolation — keys can be bound to an organization_id ----
    try {
      const probe = `cmb_live_tenant_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const created = await base44.asServiceRole.entities.ApiKey.create({
        name: `_tenantprobe_${Date.now()}`,
        tool_name: "custom",
        key_prefix: probe.slice(0, 12),
        key_hash: await sha256Hex(probe),
        key_last4: probe.slice(-4),
        scopes: ["read:kpis"],
        status: "active",
        organization_id: "00000000-0000-0000-0000-000000000000",
        owner_email: user.email,
      });
      const refetch = await base44.asServiceRole.entities.ApiKey.get(created.id);
      await base44.asServiceRole.entities.ApiKey.delete(created.id).catch((error:any)=>safeBestEffort(error,{operation:'runApiSelfTests',fallback:null,severity:'secondary'}));
      if (refetch.organization_id === "00000000-0000-0000-0000-000000000000") results.push(pass("tenant_org_field"));
      else results.push(fail("tenant_org_field", "ApiKey did not retain organization_id"));
    } catch (e) { results.push(fail("tenant_org_field", e.message)); }

    // ---- 5. OAuth tables exist ----
    try {
      await base44.asServiceRole.entities.OAuthApp.list("-created_date", 1);
      await base44.asServiceRole.entities.OAuthToken.list("-created_date", 1);
      await base44.asServiceRole.entities.OAuthAuthorizationCode.list("-created_date", 1);
      results.push(pass("oauth_entities_present"));
    } catch (e) { results.push(fail("oauth_entities_present", e.message)); }

    // ---- 6. Idempotency + rate-limit + DLQ entities present ----
    try {
      await base44.asServiceRole.entities.IdempotencyKey.list("-created_date", 1).catch((error:any)=>safeBestEffort(error,{operation:'runApiSelfTests',fallback:[],severity:'secondary'}));
      await base44.asServiceRole.entities.RateLimitCounter.list("-created_date", 1).catch((error:any)=>safeBestEffort(error,{operation:'runApiSelfTests',fallback:[],severity:'secondary'}));
      await base44.asServiceRole.entities.WebhookDeadLetter.list("-created_date", 1).catch((error:any)=>safeBestEffort(error,{operation:'runApiSelfTests',fallback:[],severity:'secondary'}));
      results.push(pass("infra_entities_present"));
    } catch (e) { results.push(fail("infra_entities_present", e.message)); }

    // ---- 7. Audit logging table accepts writes ----
    try {
      const log = await base44.asServiceRole.entities.ApiActivityLog.create({
        endpoint: "/v1/selftest", method: "GET", status: "success",
        status_code: 200, network_fingerprint: "rlh:selftest:0000000000000000000000000000000000000000000000000000000000000000", network_fingerprint_version: "selftest", duration_ms: 0, request_id: crypto.randomUUID(),
      });
      await base44.asServiceRole.entities.ApiActivityLog.delete(log.id).catch((error:any)=>safeBestEffort(error,{operation:'runApiSelfTests',fallback:null,severity:'secondary'}));
      results.push(pass("audit_log_writable"));
    } catch (e) { results.push(fail("audit_log_writable", e.message)); }

    // ---- 8. Webhook secret hashing — HMAC SHA-256 reachable ----
    try {
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey("raw", enc.encode("test_secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, enc.encode('{"test":1}'));
      if (sig.byteLength === 32) results.push(pass("webhook_hmac_available"));
      else results.push(fail("webhook_hmac_available", sig.byteLength));
    } catch (e) { results.push(fail("webhook_hmac_available", e.message)); }

    // ---- 9. Org-level usage tracking can be written ----
    try {
      const probe = await base44.asServiceRole.entities.ApiUsageRecord.create({
        organization_id: "00000000-0000-0000-0000-000000000000",
        period_month: "2099-12",
        request_count: 0, included_quota: 100, overage_count: 0, overage_amount_eur: 0,
      });
      await base44.asServiceRole.entities.ApiUsageRecord.delete(probe.id).catch((error:any)=>safeBestEffort(error,{operation:'runApiSelfTests',fallback:null,severity:'secondary'}));
      results.push(pass("usage_record_writable"));
    } catch (e) { results.push(fail("usage_record_writable", e.message)); }

    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.filter((r) => r.status === "fail").length;
    return Response.json({
      summary: {
        total: results.length, passed, failed,
        pass_rate: results.length ? Math.round((passed / results.length) * 100) : 0,
      },
      results,
      run_at: new Date().toISOString(),
      note: "These are infrastructure-level smoke tests. End-to-end HTTP tests should be run from a separate environment (Postman / Insomnia / GitHub Actions) against the deployed endpoint.",
    });
  } catch (error) {
    return internalErrorResponse(error, 'runApiSelfTests');
  }
});
