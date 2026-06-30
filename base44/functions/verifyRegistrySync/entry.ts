/**
 * verifyRegistrySync — Detects divergence between the two duplicated REGISTRY
 * objects (oauthConnector + dataSyncAgent).
 * =============================================================================
 * Background:
 *   Deno backend functions can't import from each other. The integrations
 *   REGISTRY is therefore duplicated VERBATIM in:
 *     - base44/functions/oauthConnector/entry.ts
 *     - base44/functions/dataSyncAgent/entry.ts
 *   …with a "keep in sync" comment. That comment is the only thing standing
 *   between us and the most expensive bug we could ship: a provider edited in
 *   one file but not the other, silently failing in front of a customer.
 *
 * What this function does:
 *   1. Calls oauthConnector with { mode: "describe" } → gets its REGISTRY
 *   2. Calls dataSyncAgent  with { mode: "describe" } → gets its REGISTRY
 *   3. Compares them field-by-field on the keys that matter:
 *        auth_url, token_url, scopes, data_type, data_endpoints, category,
 *        client_id_env, client_secret_env, demo_mode, display_name
 *   4. Returns ok=true if identical, or a clear list of what differs and where.
 *
 * What it NEVER does:
 *   - Modify the REGISTRY in either function
 *   - Modify any business logic
 *   - Modify any data
 *   It is strictly READ-ONLY. Its only side effect is the AgentTask + Event it
 *   writes to record the check (same pattern as systemHealthAgent).
 *
 * Auth: admin-only.
 *
 * Output shape:
 *   {
 *     ok: true|false,
 *     in_sync: true|false,
 *     providers_compared: number,
 *     divergences: [{ provider, field, oauthConnector_value, dataSyncAgent_value, kind }],
 *     summary: "..."
 *   }
 * =============================================================================
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// Fields that MUST match exactly between the two registries. Anything outside
// this list is metadata (e.g. logo, description) and is ignored on purpose to
// keep the check focused on what actually drives behaviour.
const COMPARED_FIELDS = [
  // OAuth-specific
  "auth_url",
  "token_url",
  "scopes",
  "client_id_env",
  "client_secret_env",
  // API key-specific
  "api_key_header",
  "api_key_format",
  "api_key_help_url",
  "api_key_help_text",
  // Basic Auth-specific (public + secret key pair, e.g. Sendcloud).
  // No URL/scope/env fields exist for basic_auth — the keys come from the
  // client at connect time and are stored encrypted in Integration.access_token.
  "basic_auth_help_url",
  "basic_auth_help_text",
  "basic_auth_user_label",
  "basic_auth_pass_label",
  // Common (drive engine behaviour regardless of auth_method)
  "auth_method",
  "data_type",
  "data_endpoints",
  "category",
  "demo_mode",
  "display_name",
  // Per-shop providers (Shopify and any future provider that follows the
  // {shop}.example.com pattern). The engine reads this flag in modeStart to
  // decide whether to require a shop_domain parameter from the client.
  "requires_shop_domain",
  // Sync engine — pagination + date-range + rate-limit (introduced when we
  // added generic pagination to the engine; drives request flow). Optional
  // per provider: providers without these fall back to legacy single-fetch
  // behaviour. Comparing them anyway because a drift here is a real bug.
  "pagination",
  "date_range",
  "rate_limit",
];

// Deep-equality for plain JSON values (strings, numbers, booleans, arrays of
// any of these, plain objects). Order matters for arrays — `scopes` and
// `data_endpoints` order is part of behaviour (request order, scope order).
function jsonEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!jsonEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
    for (const k of ka) if (!jsonEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

// Compare two registries and produce a list of human-readable divergences.
function diffRegistries(regA, regB, labelA = "oauthConnector", labelB = "dataSyncAgent") {
  const divergences = [];
  const providersA = new Set(Object.keys(regA || {}));
  const providersB = new Set(Object.keys(regB || {}));

  // 1) Provider set mismatch — entire entry missing on one side.
  for (const p of providersA) {
    if (!providersB.has(p)) {
      divergences.push({
        provider: p,
        field: "(entire provider)",
        kind: "missing_in_" + labelB,
        [`${labelA}_value`]: "present",
        [`${labelB}_value`]: "missing",
        message: `Provider "${p}" exists in ${labelA} but is MISSING from ${labelB}.`,
      });
    }
  }
  for (const p of providersB) {
    if (!providersA.has(p)) {
      divergences.push({
        provider: p,
        field: "(entire provider)",
        kind: "missing_in_" + labelA,
        [`${labelA}_value`]: "missing",
        [`${labelB}_value`]: "present",
        message: `Provider "${p}" exists in ${labelB} but is MISSING from ${labelA}.`,
      });
    }
  }

  // 2) Per-provider, per-field comparison for providers present on both sides.
  const sharedProviders = [...providersA].filter(p => providersB.has(p));
  for (const p of sharedProviders) {
    const a = regA[p];
    const b = regB[p];
    for (const field of COMPARED_FIELDS) {
      const av = a?.[field];
      const bv = b?.[field];
      const aHas = Object.prototype.hasOwnProperty.call(a || {}, field);
      const bHas = Object.prototype.hasOwnProperty.call(b || {}, field);

      // Both sides missing the field → not a divergence (field is optional on
      // both, e.g. demo_mode for a non-demo provider).
      if (!aHas && !bHas) continue;

      // One side has it, other doesn't → divergence.
      if (aHas !== bHas) {
        divergences.push({
          provider: p,
          field,
          kind: aHas ? "field_only_in_" + labelA : "field_only_in_" + labelB,
          [`${labelA}_value`]: aHas ? av : "(missing)",
          [`${labelB}_value`]: bHas ? bv : "(missing)",
          message: `Provider "${p}" has field "${field}" in ${aHas ? labelA : labelB} but not in ${aHas ? labelB : labelA}.`,
        });
        continue;
      }

      // Both have it → values must match.
      if (!jsonEqual(av, bv)) {
        divergences.push({
          provider: p,
          field,
          kind: "value_mismatch",
          [`${labelA}_value`]: av,
          [`${labelB}_value`]: bv,
          message: `Provider "${p}" field "${field}" differs: ${labelA}=${JSON.stringify(av)} vs ${labelB}=${JSON.stringify(bv)}.`,
        });
      }
    }
  }

  return divergences;
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ ok: false, error: "Admin only" }, { status: 403 });

    const nowIso = new Date().toISOString();

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: "system_health",
      task_type: "verify_registry_sync",
      status: "running",
      requires_approval: false,
      risk_level: 0,
      input_summary: "Compare REGISTRY across oauthConnector and dataSyncAgent",
      started_at: nowIso,
    });

    // 1) Pull both registries via the new "describe" mode.
    const [oauthRes, syncRes] = await Promise.all([
      base44.functions.invoke("oauthConnector", { mode: "describe" }),
      base44.functions.invoke("dataSyncAgent", { mode: "describe" }),
    ]);

    const oauthBody = oauthRes?.data || oauthRes;
    const syncBody = syncRes?.data || syncRes;

    if (!oauthBody?.ok || !oauthBody?.registry) {
      throw new Error(`oauthConnector did not return a registry: ${JSON.stringify(oauthBody)?.slice(0, 200)}`);
    }
    if (!syncBody?.ok || !syncBody?.registry) {
      throw new Error(`dataSyncAgent did not return a registry: ${JSON.stringify(syncBody)?.slice(0, 200)}`);
    }

    // 2) Diff them.
    const divergences = diffRegistries(oauthBody.registry, syncBody.registry);
    const inSync = divergences.length === 0;
    const providersCompared = new Set([
      ...Object.keys(oauthBody.registry),
      ...Object.keys(syncBody.registry),
    ]).size;

    const summary = inSync
      ? `🟢 Registry in sync. ${providersCompared} provider(s) compared, ${COMPARED_FIELDS.length} fields each.`
      : `🔴 Registry DESYNC: ${divergences.length} divergence(s) across ${providersCompared} provider(s). First: ${divergences[0].message}`;

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: summary,
      output_payload_json: {
        in_sync: inSync,
        providers_compared: providersCompared,
        divergences,
        compared_fields: COMPARED_FIELDS,
      },
      completed_at: new Date().toISOString(),
    });

    // Emit an Event so System Health (and Founder Copilot) can surface it.
    await base44.asServiceRole.entities.Event.create({
      brand_id: "_platform",
      event_type: "registry.sync.checked",
      source: "verify_registry_sync",
      entity_type: "AgentTask",
      entity_id: task.id,
      agent_task_id: task.id,
      payload_json: {
        in_sync: inSync,
        divergence_count: divergences.length,
        providers_compared: providersCompared,
      },
      status: "pending",
    }).catch(() => null);

    return Response.json({
      ok: true,
      in_sync: inSync,
      providers_compared: providersCompared,
      divergences,
      compared_fields: COMPARED_FIELDS,
      summary,
      task_id: task.id,
    });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "failed",
          error: error.message,
          completed_at: new Date().toISOString(),
        });
      } catch { /* non-fatal */ }
    }
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});