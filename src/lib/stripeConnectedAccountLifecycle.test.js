import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  acquireStripeConnectedAccountEventClaim,
  completeStripeConnectedAccountEventClaim,
  disconnectLegacyStripeConnectionOnly,
  disconnectStripeConnectedAccount,
  ensureStripeConnectEventLedger,
  markStripeConnectedAccountEventEffectsStarted,
  recordStripeAccountCapabilityDrop,
  recordStripeConnectIncident,
  resolveExactStripeIntegrationForAccount,
  settleStripeConnectEventLedger,
} from "../../base44/shared/stripeConnectedAccountLifecycle.ts";

const read = (path) =>
  fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function matches(row, filter) {
  return Object.entries(filter || {}).every(([key, expected]) => {
    const actual = row?.[key];
    if (expected === null) {
      return actual === null || actual === undefined || actual === "";
    }
    if (
      expected && typeof expected === "object" && Array.isArray(expected.$in)
    ) {
      return expected.$in.includes(actual);
    }
    return actual === expected;
  });
}

function makeService(options = {}) {
  let sequence = 100;
  const rows = {
    Integration: [{
      id: "integration-1",
      brand_id: "brand-1",
      provider: "stripe",
      provider_account_id: "acct_1",
      status: "connected",
      last_sync_status: "success",
      provider_event_revision: 0,
      provider_event_claim_state: "IDLE",
      provider_event_claim_key: "",
      provider_event_claim_token: "",
      provider_event_claim_owner: "",
      provider_event_effects_started: false,
      ...options.integration,
    }],
    IntegrationCredential: [{
      id: "credential-1",
      brand_id: "brand-1",
      integration_id: "integration-1",
      credential_key: "integration-credential:brand-1:integration-1",
      credential_type: "oauth_token",
      credential_version: 1,
      encrypted_access_token: "v1:iv:cipher",
      encrypted_refresh_token: null,
      status: "active",
    }],
    StripeConnection: [{
      id: "legacy-1",
      brand_id: "brand-1",
      stripe_account_id: "acct_1",
      connection_status: "connected",
    }],
    ConsentRecord: [{
      id: "consent-1",
      brand_id: "brand-1",
      provider: "stripe",
      status: "active",
      metadata: { stripe_account_id: "acct_1" },
    }],
    DealActivation: [{
      id: "recover-1",
      brand_id: "brand-1",
      economic_right_status: "active",
      verification_access_status: "available",
    }],
    OperationalLog: [],
    Event: [],
    AutonomyIncident: [],
    ...(options.rows || {}),
  };
  const calls = [];
  const fail = options.fail || (() => false);
  const entities = {};
  for (const name of Object.keys(rows)) {
    entities[name] = {
      filter: async (filter) => {
        calls.push({ name, operation: "filter", filter });
        if (fail(name, "filter", filter)) {
          throw new Error(`${name}_filter_failed`);
        }
        return rows[name].filter((row) => matches(row, filter)).map((row) => ({
          ...row,
        }));
      },
      get: async (id) => {
        calls.push({ name, operation: "get", id });
        if (fail(name, "get", id)) throw new Error(`${name}_get_failed`);
        const row = rows[name].find((candidate) => candidate.id === id);
        return row ? { ...row } : null;
      },
      create: async (record) => {
        calls.push({ name, operation: "create", record });
        if (fail(name, "create", record)) {
          throw new Error(`${name}_create_failed`);
        }
        const row = {
          id: `${name.toLowerCase()}-${++sequence}`,
          created_date: new Date().toISOString(),
          ...record,
        };
        rows[name].push(row);
        return { ...row };
      },
      update: async (id, patch) => {
        calls.push({ name, operation: "update", id, patch });
        if (fail(name, "update", patch)) {
          throw new Error(`${name}_update_failed`);
        }
        const row = rows[name].find((candidate) => candidate.id === id);
        if (!row) throw new Error(`${name}_missing`);
        Object.assign(row, patch);
        return { ...row };
      },
      updateMany: async (filter, update) => {
        calls.push({ name, operation: "updateMany", filter, update });
        if (fail(name, "updateMany", update?.$set)) {
          throw new Error(`${name}_update_many_failed`);
        }
        let updated = 0;
        for (const row of rows[name]) {
          if (!matches(row, filter)) continue;
          Object.assign(row, update.$set || update);
          updated += 1;
        }
        return { updated, modified_count: updated, matched_count: updated };
      },
    };
  }
  return { svc: { entities }, rows, calls };
}

describe("Stripe connected-account durable lifecycle", () => {
  it("resolves event.account to exactly one Stripe Integration and blocks ambiguity", async () => {
    const exact = makeService();
    await expect(resolveExactStripeIntegrationForAccount(exact.svc, "acct_1"))
      .resolves.toMatchObject({
        id: "integration-1",
        provider_account_id: "acct_1",
      });

    const ambiguous = makeService({
      rows: {
        Integration: [
          {
            id: "a",
            brand_id: "brand-a",
            provider: "stripe",
            provider_account_id: "acct_dup",
          },
          {
            id: "b",
            brand_id: "brand-b",
            provider: "stripe",
            provider_account_id: "acct_dup",
          },
        ],
      },
    });
    await expect(
      resolveExactStripeIntegrationForAccount(ambiguous.svc, "acct_dup"),
    )
      .rejects.toMatchObject({
        code: "STRIPE_CONNECT_ACCOUNT_AUTHORITY_AMBIGUOUS",
      });
    expect(ambiguous.rows.Integration.every((row) => row.status === undefined))
      .toBe(true);

    const truncated = makeService({
      rows: {
        Integration: Array.from({ length: 10 }, (_, index) => ({
          id: `many-${index}`,
          brand_id: `brand-${index}`,
          provider: index === 0 ? "stripe" : "other",
          provider_account_id: "acct_many",
        })),
      },
    });
    await expect(
      resolveExactStripeIntegrationForAccount(truncated.svc, "acct_many"),
    )
      .rejects.toMatchObject({
        code: "STRIPE_CONNECT_ACCOUNT_AUTHORITY_COVERAGE_UNPROVEN",
      });
  });

  it("fences duplicate deliveries by event id so deauthorization applies once", async () => {
    const state = makeService();
    const integration = state.rows.Integration[0];
    const effectKey = "stripe-connect:evt_deauth:acct_1";
    const first = await acquireStripeConnectedAccountEventClaim(
      state.svc,
      integration,
      {
        effect_key: effectKey,
        owner: "first",
      },
    );
    expect(first.acquired).toBe(true);
    const concurrent = await acquireStripeConnectedAccountEventClaim(
      state.svc,
      integration,
      {
        effect_key: effectKey,
        owner: "second",
      },
    );
    expect(concurrent).toMatchObject({ acquired: false, in_progress: true });

    const ledger = await ensureStripeConnectEventLedger(state.svc, {
      effect_key: effectKey,
      event_id: "evt_deauth",
      event_type: "stripe.connect.application.deauthorized",
      account_id: "acct_1",
      brand_id: "brand-1",
      integration_id: "integration-1",
      livemode: false,
    });
    const applying = await markStripeConnectedAccountEventEffectsStarted(
      state.svc,
      first.claim,
    );
    const receipt = await disconnectStripeConnectedAccount(state.svc, {
      integration,
      provider_account_id: "acct_1",
      reason: "stripe_account_application_deauthorized",
      source: "stripe_webhook",
      event_id: "evt_deauth",
      event_type: "account.application.deauthorized",
    });
    await settleStripeConnectEventLedger(state.svc, ledger, {
      status: "processed",
      receipt,
    });
    await completeStripeConnectedAccountEventClaim(
      state.svc,
      applying,
      receipt,
    );

    const replay = await acquireStripeConnectedAccountEventClaim(
      state.svc,
      state.rows.Integration[0],
      {
        effect_key: effectKey,
        owner: "replay",
      },
    );
    expect(replay).toMatchObject({ acquired: false, duplicate: true });
    expect(state.rows.OperationalLog).toHaveLength(1);
    expect(state.rows.Event).toHaveLength(1);
    expect(state.rows.Event[0]).toMatchObject({
      status: "processed",
      idempotency_key: effectKey,
    });

    const later = await acquireStripeConnectedAccountEventClaim(
      state.svc,
      state.rows.Integration[0],
      {
        effect_key: "stripe-connect:evt_later:acct_1",
        owner: "later-event",
      },
    );
    expect(later.acquired).toBe(true);
  });

  it("never auto-retries a claim quarantined after effects may have started", async () => {
    const state = makeService({
      integration: {
        provider_event_revision: 9,
        provider_event_claim_state: "REVIEW_REQUIRED",
        provider_event_claim_key: "stripe-connect:evt_ambiguous:acct_1",
        provider_event_claim_token: "old-fence",
        provider_event_claim_owner: "old-owner",
        provider_event_effects_started: true,
        provider_event_claim_expires_at: "",
      },
    });
    const sameEvent = await acquireStripeConnectedAccountEventClaim(
      state.svc,
      state.rows.Integration[0],
      {
        effect_key: "stripe-connect:evt_ambiguous:acct_1",
        owner: "automatic-replay",
      },
    );
    expect(sameEvent).toMatchObject({ acquired: false, review_required: true });
    expect(state.rows.Integration[0]).toMatchObject({
      provider_event_revision: 9,
      provider_event_claim_token: "old-fence",
      provider_event_claim_state: "REVIEW_REQUIRED",
    });
  });

  it("disconnects credential, Integration, legacy row, consents and Recover verification with receipts", async () => {
    const state = makeService();
    const receipt = await disconnectStripeConnectedAccount(state.svc, {
      integration: state.rows.Integration[0],
      provider_account_id: "acct_1",
      reason: "stripe_account_application_deauthorized",
      source: "stripe_webhook",
      event_id: "evt_1",
      event_type: "account.application.deauthorized",
    });
    expect(state.rows.IntegrationCredential[0]).toMatchObject({
      status: "revoked",
      encrypted_access_token: null,
      encrypted_refresh_token: null,
    });
    expect(state.rows.Integration[0]).toMatchObject({
      status: "disconnected",
      last_sync_status: "failed",
      provider_capability_risk_status: "DEAUTHORIZED",
      provider_charges_enabled: false,
      provider_payouts_enabled: false,
    });
    expect(state.rows.StripeConnection[0].connection_status).toBe(
      "disconnected",
    );
    expect(state.rows.ConsentRecord[0].status).toBe("revoked");
    expect(state.rows.DealActivation[0].verification_access_status).toBe(
      "missing",
    );
    expect(receipt.steps).toMatchObject({
      credential: { status: "REVOKED" },
      integration: { status: "DISCONNECTED" },
      legacy_connections: { status: "DISCONNECTED", ids: ["legacy-1"] },
      consents: { status: "REVOKED", ids: ["consent-1"] },
      recover_verification: { status: "MISSING", ids: ["recover-1"] },
      operational_log: { status: "RECORDED" },
    });
    expect(state.rows.OperationalLog[0].data_json).toMatchObject({
      stripe_event_id: "evt_1",
      connected_account_id: "acct_1",
      reason: "stripe_account_application_deauthorized",
    });
  });

  it("surfaces a partial multi-entity transition with exact completed-step receipts", async () => {
    const state = makeService({
      fail: (name, operation) =>
        name === "StripeConnection" && operation === "update",
    });
    await expect(disconnectStripeConnectedAccount(state.svc, {
      integration: state.rows.Integration[0],
      provider_account_id: "acct_1",
      reason: "stripe_account_application_deauthorized",
      source: "stripe_webhook",
      event_id: "evt_partial",
      event_type: "account.application.deauthorized",
    })).rejects.toMatchObject({
      code: "STRIPE_CONNECT_DISCONNECT_RECONCILIATION_REQUIRED",
      receipt: {
        event_id: "evt_partial",
        steps: {
          credential: { status: "REVOKED" },
          integration: { status: "DISCONNECTED" },
        },
      },
    });
    expect(state.rows.Integration[0].status).toBe("disconnected");
    expect(state.rows.StripeConnection[0].connection_status).toBe("connected");
    expect(state.rows.ConsentRecord[0].status).toBe("active");
  });

  it("quarantines a partial legacy-only disconnect with readback receipts and a canonical incident", async () => {
    const state = makeService({
      fail: (name, operation) =>
        name === "ConsentRecord" && operation === "update",
    });
    let lifecycleError;
    try {
      await disconnectLegacyStripeConnectionOnly(state.svc, {
        brand_id: "brand-1",
        reason: "merchant_requested_stripe_disconnect",
        actor_email: "owner@example.test",
      });
    } catch (error) {
      lifecycleError = error;
    }
    expect(lifecycleError).toMatchObject({
      code: "STRIPE_CONNECT_LEGACY_DISCONNECT_RECONCILIATION_REQUIRED",
      receipt: {
        brand_id: "brand-1",
        source: "manual_legacy_compatibility",
        steps: {
          legacy_connections: { status: "DISCONNECTED", ids: ["legacy-1"] },
          consents: { status: "APPLYING", ids: [] },
        },
      },
    });
    expect(state.rows.StripeConnection[0].connection_status).toBe(
      "disconnected",
    );
    expect(state.rows.ConsentRecord[0].status).toBe("active");
    expect(state.rows.DealActivation[0].verification_access_status).toBe(
      "available",
    );
    expect(state.rows.OperationalLog).toHaveLength(0);

    const receipt = lifecycleError.receipt;
    await recordStripeConnectIncident(state.svc, {
      dedupe_key:
        `stripe-connect-manual-review:${receipt.brand_id}:${lifecycleError.code}`,
      account_id: "",
      event_id: "",
      event_type: receipt.event_type,
      error_code: lifecycleError.code,
      brand_id: receipt.brand_id,
      receipt,
    });
    expect(state.rows.AutonomyIncident).toHaveLength(1);
    expect(state.rows.AutonomyIncident[0]).toMatchObject({
      subject_type: "Brand",
      subject_id: "brand-1",
      status: "open",
      workflow_state: "human_review",
      details_json: {
        brand_id: "brand-1",
        error_code: "STRIPE_CONNECT_LEGACY_DISCONNECT_RECONCILIATION_REQUIRED",
        receipt: {
          steps: {
            legacy_connections: { status: "DISCONNECTED", ids: ["legacy-1"] },
            consents: { status: "APPLYING", ids: [] },
          },
        },
      },
    });
  });

  it("disconnects only the exact connected account and preserves unrelated legacy/consent rows", async () => {
    const state = makeService({
      rows: {
        StripeConnection: [
          {
            id: "legacy-1",
            brand_id: "brand-1",
            stripe_account_id: "acct_1",
            connection_status: "connected",
          },
          {
            id: "legacy-other",
            brand_id: "brand-1",
            stripe_account_id: "acct_other",
            connection_status: "connected",
          },
        ],
        ConsentRecord: [
          {
            id: "consent-1",
            brand_id: "brand-1",
            provider: "stripe",
            status: "active",
            metadata: { stripe_account_id: "acct_1" },
          },
          {
            id: "consent-other",
            brand_id: "brand-1",
            provider: "stripe",
            status: "active",
            metadata: { stripe_account_id: "acct_other" },
          },
        ],
      },
    });
    const receipt = await disconnectStripeConnectedAccount(state.svc, {
      integration: state.rows.Integration[0],
      provider_account_id: "acct_1",
      reason: "stripe_account_application_deauthorized",
      source: "stripe_webhook",
      event_id: "evt_exact",
      event_type: "account.application.deauthorized",
    });
    expect(
      state.rows.StripeConnection.map((row) => [row.id, row.connection_status]),
    ).toEqual([
      ["legacy-1", "disconnected"],
      ["legacy-other", "connected"],
    ]);
    expect(state.rows.ConsentRecord.map((row) => [row.id, row.status])).toEqual(
      [
        ["consent-1", "revoked"],
        ["consent-other", "active"],
      ],
    );
    expect(receipt.steps).toMatchObject({
      legacy_connections: { ids: ["legacy-1"], unrelated_preserved: 1 },
      consents: { ids: ["consent-1"], unrelated_preserved: 1 },
    });
  });

  it("keeps DEAUTHORIZED terminal when a late negative account.updated arrives", async () => {
    const state = makeService();
    await disconnectStripeConnectedAccount(state.svc, {
      integration: state.rows.Integration[0],
      provider_account_id: "acct_1",
      reason: "stripe_account_application_deauthorized",
      source: "stripe_webhook",
      event_id: "evt_deauthorized_first",
      event_type: "account.application.deauthorized",
    });
    const authoritativeBefore = structuredClone(state.rows.Integration[0]);
    const integrationUpdatesBefore = state.calls.filter((call) => (
      call.name === "Integration" &&
      ["update", "updateMany"].includes(call.operation)
    )).length;
    const logCountBefore = state.rows.OperationalLog.length;
    const ledger = await ensureStripeConnectEventLedger(state.svc, {
      effect_key: "stripe-connect:evt_late_negative_update:acct_1",
      event_id: "evt_late_negative_update",
      event_type: "stripe.connect.account.updated",
      account_id: "acct_1",
      brand_id: "brand-1",
      integration_id: "integration-1",
      livemode: false,
    });

    const receipt = await recordStripeAccountCapabilityDrop(state.svc, {
      integration: state.rows.Integration[0],
      account: { charges_enabled: false, payouts_enabled: false },
      event_id: "evt_late_negative_update",
      event_type: "account.updated",
      account_id: "acct_1",
    });
    await settleStripeConnectEventLedger(state.svc, ledger, {
      status: "processed",
      receipt,
    });

    expect(receipt).toMatchObject({
      changed: false,
      reason: "deauthorized_terminal_observation_only",
      terminal_authority: "DEAUTHORIZED",
      observed_charges_enabled: false,
      observed_payouts_enabled: false,
    });
    expect(state.rows.Integration[0]).toEqual(authoritativeBefore);
    expect(state.rows.Integration[0]).toMatchObject({
      status: "disconnected",
      provider_capability_risk_status: "DEAUTHORIZED",
      provider_capability_event_id: "evt_deauthorized_first",
    });
    expect(state.calls.filter((call) => (
      call.name === "Integration" &&
      ["update", "updateMany"].includes(call.operation)
    ))).toHaveLength(integrationUpdatesBefore);
    expect(state.rows.OperationalLog).toHaveLength(logCountBefore);
    expect(state.rows.Event[0]).toMatchObject({
      status: "processed",
      idempotency_key: "stripe-connect:evt_late_negative_update:acct_1",
      execution_json: {
        status: "EXECUTED",
        receipt: {
          changed: false,
          reason: "deauthorized_terminal_observation_only",
          terminal_authority: "DEAUTHORIZED",
        },
      },
    });
  });

  it.each([
    { charges_enabled: false, payouts_enabled: true },
    { charges_enabled: true, payouts_enabled: false },
    { charges_enabled: false, payouts_enabled: false },
  ])("persists partial/total account capability drops: %o", async (account) => {
    const state = makeService();
    const receipt = await recordStripeAccountCapabilityDrop(state.svc, {
      integration: state.rows.Integration[0],
      account,
      event_id: "evt_drop",
      event_type: "account.updated",
      account_id: "acct_1",
    });
    expect(receipt.changed).toBe(true);
    expect(state.rows.Integration[0]).toMatchObject({
      provider_capability_risk_status: "DEGRADED",
      provider_charges_enabled: account.charges_enabled,
      provider_payouts_enabled: account.payouts_enabled,
      provider_capability_event_id: "evt_drop",
    });
    expect(state.rows.OperationalLog[0].event_type).toBe(
      "stripe_connected_account_capability_degraded",
    );
  });

  it("never auto-reactivates a previously degraded Integration on a later positive event", async () => {
    const state = makeService({
      integration: {
        provider_capability_risk_status: "DEGRADED",
        provider_charges_enabled: false,
        provider_payouts_enabled: true,
        provider_capability_event_id: "evt_old_drop",
      },
    });
    const receipt = await recordStripeAccountCapabilityDrop(state.svc, {
      integration: state.rows.Integration[0],
      account: { charges_enabled: true, payouts_enabled: true },
      event_id: "evt_positive",
      event_type: "account.updated",
      account_id: "acct_1",
    });
    expect(receipt).toMatchObject({
      changed: false,
      reason: "capabilities_not_degraded_no_automatic_reactivation",
    });
    expect(state.rows.Integration[0]).toMatchObject({
      provider_capability_risk_status: "DEGRADED",
      provider_charges_enabled: false,
      provider_capability_event_id: "evt_old_drop",
    });
    expect(state.rows.OperationalLog).toHaveLength(0);
  });

  it("keeps each prior capability loss sticky when an out-of-order partial drop reports it true", async () => {
    const state = makeService({
      integration: {
        provider_capability_risk_status: "DEGRADED",
        provider_charges_enabled: false,
        provider_payouts_enabled: true,
        provider_capability_event_id: "evt_charges_drop",
      },
    });
    const receipt = await recordStripeAccountCapabilityDrop(state.svc, {
      integration: state.rows.Integration[0],
      account: { charges_enabled: true, payouts_enabled: false },
      event_id: "evt_payouts_drop",
      event_type: "account.updated",
      account_id: "acct_1",
    });
    expect(receipt).toMatchObject({
      observed_charges_enabled: true,
      observed_payouts_enabled: false,
      charges_enabled: false,
      payouts_enabled: false,
    });
    expect(state.rows.Integration[0]).toMatchObject({
      provider_charges_enabled: false,
      provider_payouts_enabled: false,
    });
  });
});

describe("Stripe billing physical webhook boundary", () => {
  const webhook = read("base44/functions/stripeBillingWebhook/entry.ts");
  const manual = read("base44/functions/stripeConnectionDisconnect/entry.ts");
  const schema = JSON.parse(read("base44/entities/Integration.jsonc"));

  it("verifies Stripe against the untouched raw body before constructing a Base44 client", () => {
    const raw = webhook.indexOf("const rawBody = await req.text()");
    const signature = webhook.search(
      /constructEventAsync\(\s*rawBody,\s*signature/,
    );
    const client = webhook.indexOf(
      "createClientFromRequest(req).asServiceRole",
    );
    expect(raw).toBeGreaterThan(-1);
    expect(signature).toBeGreaterThan(raw);
    expect(client).toBeGreaterThan(signature);
    expect(webhook).toMatch(
      /\{\s*error:\s*["']signature_invalid["']\s*\}[\s\S]{0,40}\{\s*status:\s*400\s*\}/,
    );
  });

  it("uses event.account for deauthorization and validates Account.id for account.updated", () => {
    expect(webhook).toMatch(
      /const accountId\s*=\s*String\(event\?\.account\s*\|\|\s*["']["']\)/,
    );
    expect(webhook).toMatch(
      /String\(deliveredObject\?\.object\s*\|\|\s*["']["']\)\s*!==\s*["']application["']/,
    );
    expect(webhook).toMatch(
      /String\(deliveredObject\?\.object\s*\|\|\s*["']["']\)\s*!==\s*["']account["']/,
    );
    expect(webhook).toMatch(
      /String\(deliveredObject\?\.id\s*\|\|\s*["']["']\)\s*!==\s*accountId/,
    );
    expect(webhook).toContain(
      "resolveExactStripeIntegrationForAccount(svc, accountId)",
    );
    expect(webhook).toMatch(
      /reason:\s*["']stripe_account_application_deauthorized["']/,
    );
  });

  it("documents and handles the existing physical Connected accounts endpoint without a new route", () => {
    expect(webhook).toContain('"Connected accounts" scope');
    expect(webhook).toMatch(/["']account\.application\.deauthorized["']/);
    expect(webhook).toMatch(/["']account\.updated["']/);
    expect(webhook).toContain("CONNECTED_ACCOUNT_EVENTS.has(event.type)");
    expect(webhook).not.toContain("Deno.serve");
  });

  it("keeps livemode mismatch and unknown event handling effect-free", () => {
    const mismatch = webhook.search(/ignored:\s*["']livemode_mismatch["']/);
    const client = webhook.indexOf(
      "createClientFromRequest(req).asServiceRole",
    );
    expect(webhook).toMatch(
      /error:\s*["']livemode_missing["'][\s\S]{0,80}status:\s*400/,
    );
    expect(mismatch).toBeGreaterThan(-1);
    expect(mismatch).toBeLessThan(client);
    expect(webhook).toMatch(
      /if\s*\(\s*!\(event\.type in INVOICE_EVENTS\)\s*\)[\s\S]{0,80}ignored:\s*event\.type/,
    );
  });

  it("uses the same canonical disconnect transition for webhook and authenticated manual paths", () => {
    expect(webhook).toContain("disconnectStripeConnectedAccount(svc, {");
    expect(manual).toContain("disconnectStripeConnectedAccount(svc, {");
    expect(manual).toMatch(/source:\s*["']manual["']/);
  });

  it("does not acknowledge a manual disconnect after a critical read/write fallback", () => {
    expect(manual).not.toContain("safeBestEffort");
    expect(manual).toContain("stripe_disconnect_failed");
    expect(manual).toContain("{ status: 500 }");
    expect(manual).toContain("stripe_integration_disconnect_coverage_unproven");
    expect(manual).toContain("disconnectLegacyStripeConnectionOnly(svc, {");
    expect(manual).not.toContain("entities.StripeConnection.update");
    expect(manual).not.toContain("entities.ConsentRecord.update");
    expect(manual).not.toContain("entities.DealActivation.update");
    expect(manual).toContain(
      "receipt.integration_id || receipt.brand_id || 'unknown'",
    );
    expect(manual).toContain("recordStripeConnectIncident(incidentSvc");
    expect(manual).toContain("stripe_connect_manual_incident_write_failed");
  });

  it("makes failed event-ledger settlement observable before incident reconciliation", () => {
    expect(webhook).toContain("stripe_connect_event_ledger_settle_failed");
    expect(webhook).toContain(
      "dedupe_key: `stripe-connect-review:${effectKey}`",
    );
  });

  it("persists a CAS claim, sticky risk state and non-secret receipts on Integration", () => {
    for (
      const field of [
        "provider_event_revision",
        "provider_event_claim_state",
        "provider_event_claim_key",
        "provider_event_claim_token",
        "provider_event_effects_started",
        "provider_event_receipt_json",
        "provider_capability_risk_status",
        "provider_charges_enabled",
        "provider_payouts_enabled",
        "provider_capability_event_id",
      ]
    ) expect(schema.properties[field]).toBeTruthy();
    expect(schema.properties.provider_capability_risk_status.enum).not
      .toContain("HEALTHY");
  });
});
