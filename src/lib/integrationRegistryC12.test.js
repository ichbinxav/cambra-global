// DASHBOARD-C12 (2026-08-17) — governed OAuth app and webhook registration.
//
// What these tests exist to hold: the entity write must never be the trust decision again.
//
// Every server-side control in the OAuth flow is correct. oauthToken requires a client secret
// for confidential clients and compares it in constant time; oauthAuthorize validates the
// redirect URI against the stored allowlist and the requested scopes against the stored
// allowed_scopes. And every one of those reads a field a browser CRUD call used to write.
// oauthAuthorize:77 is the sharpest: `if (app.pkce_required && !code_challenge)` — PKCE is
// enforced only when the stored flag says so.
//
// Note what is NOT a defect, because getting this wrong in the other direction matters too:
// the randomness was always fine (crypto.getRandomValues over 24 bytes), and the plaintext
// secret was correctly never sent to the server.
import { describe, expect, it } from "vitest";
import {
  applyOAuthApp, applyWebhookEndpoint, disableWebhookEndpoint, previewOAuthApp,
  previewWebhookEndpoint, readIntegrationRegistry, refuseWebhookDelete, revokeOAuthApp,
  validateRedirectUri, validateWebhookUrl,
} from "../../base44/shared/integrationRegistryCore.ts";
import { PRIVILEGED_SCOPES, VALID_SCOPES } from "../../base44/shared/apiScopeCatalog.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (value) => `h:${JSON.stringify(value).length}`;

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {}; const writes = [];
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      async list() { if (broken.includes(name)) throw new Error("down"); return stores[name].map((r) => ({ ...r })); },
      async filter(where) {
        if (broken.includes(name)) throw new Error("down");
        return stores[name].filter((r) => Object.entries(where || {}).every(([k, v]) => r[k] === v)).map((r) => ({ ...r }));
      },
      async create(row) {
        if (broken.includes(`${name}:create`)) throw new Error("refused");
        const created = { id: `${name.toLowerCase()}-${stores[name].length + 1}`, ...row };
        stores[name].push(created); writes.push({ op: "create", entity: name, row: created });
        return created;
      },
      async update(id, patch) {
        if (broken.includes(`${name}:update`)) throw new Error("refused");
        const row = stores[name].find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        writes.push({ op: "update", entity: name, id, patch });
        return row;
      },
    };
    return built[name];
  };
  return { stores, writes, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const appPatch = (extra = {}) => ({
  name: "Partner Dashboard",
  redirect_uris: ["https://partner.example.com/oauth/callback"],
  allowed_scopes: ["read:brands", "read:analyses"],
  type: "confidential",
  ...extra,
});

describe("C12 — the server owns every field the OAuth flow trusts", () => {
  it("refuses pkce_required from a caller, and says which check reads it", async () => {
    const out = await previewOAuthApp({
      svc: makeSvc(), patch: appPatch({ pkce_required: false }), sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("server_owned_field_in_patch");
    expect(out.reason).toContain("oauthAuthorize enforces PKCE only when this flag is true");
  });

  it("refuses a caller-supplied client_secret_hash", async () => {
    const out = await previewOAuthApp({
      svc: makeSvc(), patch: appPatch({ client_secret_hash: "deadbeef" }), sha256,
    });
    // A caller that installs a hash installs a credential it already knows.
    expect(out.error).toBe("server_owned_field_in_patch");
    expect(out.reason).toContain("already knows");
  });

  it("refuses a caller-supplied client_id, status and is_first_party", async () => {
    for (const field of ["client_id", "status", "is_first_party"]) {
      const out = await previewOAuthApp({
        svc: makeSvc(), patch: appPatch({ [field]: "x" }), sha256,
      });
      expect(out.error, field).toBe("server_owned_field_in_patch");
    }
  });

  it("writes pkce_required true itself, whatever the caller wanted", async () => {
    const svc = makeSvc();
    const preview = await previewOAuthApp({ svc, patch: appPatch(), sha256 });
    expect(preview.preview.pkce_required).toBe(true);
    const out = await applyOAuthApp({
      svc, actor: "founder@cambra", patch: appPatch(),
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(true);
    expect(svc.stores.OAuthApp[0].pkce_required).toBe(true);
  });

  it("records the actor, which neither panel did", async () => {
    const svc = makeSvc();
    const preview = await previewOAuthApp({ svc, patch: appPatch(), sha256 });
    await applyOAuthApp({
      svc, actor: "founder@cambra", patch: appPatch(),
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    expect(svc.stores.OAuthApp[0].owner_email).toBe("founder@cambra");
  });
});

describe("C12 — a confidential app can never carry an empty secret hash", () => {
  it("generates a secret and stores only its hash", async () => {
    const svc = makeSvc();
    const preview = await previewOAuthApp({ svc, patch: appPatch(), sha256 });
    const out = await applyOAuthApp({
      svc, actor: "a", patch: appPatch(),
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    const stored = svc.stores.OAuthApp[0];
    expect(out.client_secret).toMatch(/^cmb_secret_[0-9a-f]{48}$/);
    expect(out.secret_shown_once).toBe(true);
    // The plaintext is in the response and nowhere else.
    expect(stored.client_secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.client_secret_hash).not.toBe("");
    expect(JSON.stringify(stored)).not.toContain(out.client_secret);
  });

  it("issues a public client with no secret at all", async () => {
    const svc = makeSvc();
    const patch = appPatch({ type: "public" });
    const preview = await previewOAuthApp({ svc, patch, sha256 });
    const out = await applyOAuthApp({
      svc, actor: "a", patch, expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    expect(out.client_secret).toBeNull();
    // A public client has no secret, and PKCE is still mandatory.
    expect(svc.stores.OAuthApp[0].pkce_required).toBe(true);
  });

  it("refuses an unrecognised type rather than storing it", async () => {
    const out = await previewOAuthApp({ svc: makeSvc(), patch: appPatch({ type: "hybrid" }), sha256 });
    expect(out.error).toBe("type_not_supported");
  });
});

describe("C12 — redirect URIs are validated, which nothing did before", () => {
  const bad = [
    ["http://partner.example.com/cb", "https"],
    ["https://partner.example.com/cb#token", "fragment"],
    ["https://*.example.com/cb", "wildcards"],
    ["https://user:pw@partner.example.com/cb", "credentials"],
    ["https://localhost/cb", "loopback"],
    ["https://127.0.0.1/cb", "loopback"],
    ["https://10.0.0.5/cb", "private"],
    ["https://169.254.169.254/cb", "metadata"],
    ["/relative/cb", "absolute"],
    ["", "empty"],
  ];

  for (const [uri, expected] of bad) {
    it(`refuses ${uri || "(empty)"}`, () => {
      const verdict = validateRedirectUri(uri);
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toContain(expected);
    });
  }

  it("accepts a plain https callback", () => {
    expect(validateRedirectUri("https://partner.example.com/oauth/callback").ok).toBe(true);
  });

  it("refuses the whole registration and names the offending URI", async () => {
    const out = await previewOAuthApp({
      svc: makeSvc(),
      patch: appPatch({ redirect_uris: ["https://ok.example.com/cb", "http://bad.example.com/cb"] }),
      sha256,
    });
    expect(out.error).toBe("redirect_uri_invalid");
    expect(out.reason).toContain("http://bad.example.com/cb");
  });
});

describe("C12 — scopes come from one catalog and privileged ones are refused", () => {
  it("refuses a scope that is not in the catalog", async () => {
    const out = await previewOAuthApp({
      svc: makeSvc(), patch: appPatch({ allowed_scopes: ["read:brands", "read:everything"] }), sha256,
    });
    expect(out.error).toBe("scope_not_in_catalog");
    expect(out.reason).toContain("read:everything");
  });

  it("refuses admin and platform scope for a third-party app", async () => {
    for (const scope of PRIVILEGED_SCOPES) {
      const out = await previewOAuthApp({
        svc: makeSvc(), patch: appPatch({ allowed_scopes: [scope] }), sha256,
      });
      expect(out.error, scope).toBe("privileged_scope_refused");
    }
  });

  it("requires at least one scope", async () => {
    const out = await previewOAuthApp({ svc: makeSvc(), patch: appPatch({ allowed_scopes: [] }), sha256 });
    expect(out.error).toBe("allowed_scopes_required");
  });

  it("accepts every non-privileged catalog scope", async () => {
    const allowed = VALID_SCOPES.filter((scope) => !PRIVILEGED_SCOPES.includes(scope));
    const out = await previewOAuthApp({
      svc: makeSvc(), patch: appPatch({ allowed_scopes: [...allowed] }), sha256,
    });
    expect(out.ok).toBe(true);
    expect(out.preview.allowed_scopes).toHaveLength(allowed.length);
  });

  it("shows the scopes and redirect URIs back as the app's authority", async () => {
    const out = await previewOAuthApp({ svc: makeSvc(), patch: appPatch(), sha256 });
    expect(out.preview.authority_note).toContain("ARE this app's authority");
  });
});

describe("C12 — revoking says what it does and does not do", () => {
  it("requires a reason and records it", async () => {
    const svc = makeSvc({ OAuthApp: [{ id: "app-1", name: "X", status: "active", notes: "" }] });
    const noReason = await revokeOAuthApp({ svc, actor: "a", app_id: "app-1", reason: "", now: NOW });
    expect(noReason.error).toBe("reason_required");
    expect(svc.writes).toHaveLength(0);

    const out = await revokeOAuthApp({ svc, actor: "a", app_id: "app-1", reason: "partner offboarded", now: NOW });
    expect(out.ok).toBe(true);
    expect(svc.stores.OAuthApp[0].status).toBe("revoked");
    expect(svc.stores.OAuthApp[0].notes).toContain("partner offboarded");
  });

  it("does not claim issued tokens were invalidated", async () => {
    const svc = makeSvc({ OAuthApp: [{ id: "app-1", status: "active", notes: "" }] });
    const out = await revokeOAuthApp({ svc, actor: "a", app_id: "app-1", reason: "r", now: NOW });
    // The old browser confirm() said "All issued tokens will be invalidated". They are not.
    expect(out.issued_tokens_invalidated).toBe(false);
    expect(out.token_note).toContain("oauthRevoke");
  });

  it("refuses to revoke twice", async () => {
    const svc = makeSvc({ OAuthApp: [{ id: "app-1", status: "revoked" }] });
    const out = await revokeOAuthApp({ svc, actor: "a", app_id: "app-1", reason: "r", now: NOW });
    expect(out.error).toBe("already_revoked");
  });
});

describe("C12 — webhook URLs are validated and the hard delete is gone", () => {
  const hookPatch = (extra = {}) => ({
    name: "Zapier", url: "https://hooks.example.com/abc",
    events: ["analysis_completed"], tool_name: "zapier", ...extra,
  });

  it("refuses http, loopback, private and metadata targets", () => {
    for (const [url, expected] of [
      ["http://hooks.example.com/x", "https"],
      ["https://127.0.0.1/x", "loopback"],
      ["https://192.168.1.10/x", "private"],
      ["https://169.254.169.254/x", "metadata"],
      ["https://u:p@hooks.example.com/x", "credentials"],
    ]) {
      const verdict = validateWebhookUrl(url);
      expect(verdict.ok, url).toBe(false);
      expect(verdict.reason, url).toContain(expected);
    }
  });

  it("refuses the registration and explains the network reason", async () => {
    const out = await previewWebhookEndpoint({
      svc: makeSvc(), patch: hookPatch({ url: "https://10.1.2.3/hook" }), sha256,
    });
    expect(out.error).toBe("url_invalid");
    expect(out.reason).toContain("its own network");
  });

  it("refuses an event that is never emitted", async () => {
    const out = await previewWebhookEndpoint({
      svc: makeSvc(), patch: hookPatch({ events: ["analysis_completed", "invoice_paid"] }), sha256,
    });
    expect(out.error).toBe("event_not_in_catalog");
    expect(out.reason).toContain("looks configured and delivers nothing");
  });

  it("refuses a caller-supplied signing secret", async () => {
    const out = await previewWebhookEndpoint({
      svc: makeSvc(), patch: hookPatch({ secret: "whsec_iknowthis" }), sha256,
    });
    expect(out.error).toBe("server_owned_field_in_patch");
    expect(out.reason).toContain("forge");
  });

  it("generates the secret server-side and returns it once", async () => {
    const svc = makeSvc();
    const preview = await previewWebhookEndpoint({ svc, patch: hookPatch(), sha256 });
    const out = await applyWebhookEndpoint({
      svc, actor: "founder@cambra", patch: hookPatch(),
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    expect(out.secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(out.secret_shown_once).toBe(true);
    expect(svc.stores.WebhookEndpoint[0].owner_email).toBe("founder@cambra");
  });

  it("refuses a hard delete and names the alternative", () => {
    const out = refuseWebhookDelete("hook-1");
    expect(out.ok).toBe(false);
    expect(out.error).toBe("hard_delete_refused");
    expect(out.reason).toContain("no undo");
    expect(out.use_instead).toBe("integration_disable_webhook");
  });

  it("disables while keeping the secret and the delivery history", async () => {
    const svc = makeSvc({
      WebhookEndpoint: [{
        id: "hook-1", status: "active", secret: "whsec_keepme", events: ["analysis_completed"],
        failure_count: 3, last_delivery_status: "failed",
      }],
    });
    const out = await disableWebhookEndpoint({
      svc, actor: "a", webhook_id: "hook-1", reason: "receiver retired", now: NOW,
    });
    expect(out.ok).toBe(true);
    expect(out.deleted).toBe(false);
    expect(out.retained).toContain("secret");
    const stored = svc.stores.WebhookEndpoint[0];
    // Delivery stops; nothing is destroyed, so an accidental disable is reversible.
    expect(stored.status).toBe("disabled");
    expect(stored.secret).toBe("whsec_keepme");
    expect(stored.failure_count).toBe(3);
    expect(stored.last_delivery_status).toBe("failed");
  });

  it("requires a reason to disable", async () => {
    const svc = makeSvc({ WebhookEndpoint: [{ id: "hook-1", status: "active" }] });
    const out = await disableWebhookEndpoint({ svc, actor: "a", webhook_id: "hook-1", reason: "", now: NOW });
    expect(out.error).toBe("reason_required");
    expect(svc.writes).toHaveLength(0);
  });
});

describe("C12 — the registry reports what predates governed registration", () => {
  it("flags an app with no PKCE requirement or no recorded owner", async () => {
    const out = await readIntegrationRegistry({
      svc: makeSvc({
        OAuthApp: [
          { id: "old", name: "Legacy", pkce_required: false, owner_email: "" },
          { id: "new", name: "Governed", pkce_required: true, owner_email: "founder@cambra" },
        ],
      }),
    });
    const byId = new Map(out.oauth_apps.map((row) => [row.id, row]));
    expect(byId.get("old").predates_governed_registration).toBe(true);
    expect(byId.get("new").predates_governed_registration).toBe(false);
  });

  it("never returns a webhook signing secret", async () => {
    const out = await readIntegrationRegistry({
      svc: makeSvc({ WebhookEndpoint: [{ id: "h1", name: "X", url: "https://a.test/x", secret: "whsec_secret" }] }),
    });
    expect(JSON.stringify(out)).not.toContain("whsec_secret");
  });

  it("reports an existing webhook whose URL would now be refused", async () => {
    const out = await readIntegrationRegistry({
      svc: makeSvc({ WebhookEndpoint: [{ id: "h1", name: "X", url: "http://10.0.0.1/x" }] }),
    });
    expect(out.webhooks[0].url_valid).toBe(false);
    expect(out.webhooks[0].url_problem).toBeTruthy();
  });

  it("reports an unreadable registry as unreadable, not empty", async () => {
    const out = await readIntegrationRegistry({
      svc: makeSvc({ OAuthApp: [{ id: "a" }] }, ["OAuthApp"]),
    });
    expect(out.oauth_apps).toBeNull();
    expect(out.oauth_apps_readable).toBe(false);
  });
});
