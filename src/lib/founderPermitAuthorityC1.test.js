// COMMAND-C1 (2026-08-17) — FounderPermit authority behaviour.
//
// This is the module that makes "give CAMBRA a broad objective and let it run"
// safe, so the tests that matter most are the ones proving what a permit can
// NEVER do — including at FOUNDER_ROOT, the widest preset there is.
import { describe, expect, it } from "vitest";
import {
  buildPermitHash,
  canAutoResolveApproval,
  evaluatePermit,
  PERMIT_PRESETS,
  UNLIFTABLE_CONTROLS,
} from "../../base44/shared/founderPermitAuthority.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (value) => JSON.stringify(value);

function permit(overrides = {}) {
  return {
    permit_id: "p1",
    objective: "Prepare the Barcelona fashion campaign",
    issued_by: "founder@cambra.global",
    status: "ACTIVE",
    preset: "OPERATE",
    permit_hash: "hash-1",
    allowed_domains: ["campaign"],
    allowed_tool_ids: ["cambra.campaign.build_audience"],
    allowed_effect_classes: ["campaign_config"],
    allowed_entity_types: ["CommercialCampaign"],
    allowed_tenants: ["_platform"],
    allowed_markets: ["ES"],
    allowed_environments: ["production"],
    explicit_denials: [],
    valid_from: "2026-08-17T00:00:00.000Z",
    expires_at: "2026-08-17T23:00:00.000Z",
    emergency_control_revision: 7,
    ...overrides,
  };
}

function healthyControls(overrides = {}) {
  return {
    emergency: { safe_mode: false, communications_paused: false, control_revision: 7 },
    emergencyAvailable: true,
    tenant_matches: true,
    exposes_secret: false,
    suppressionAvailable: true,
    recipient_suppressed: false,
    market_commercially_eligible: true,
    legal_block: false,
    strong_reauth_present: false,
    human_presence_required: false,
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    tool_id: "cambra.campaign.build_audience",
    domain: "campaign",
    read_or_write: "WRITE",
    effect_class: "campaign_config",
    entity_type: "CommercialCampaign",
    tenant: "_platform",
    market: "ES",
    environment: "production",
    ...overrides,
  };
}

describe("C1 — a valid permit authorises the work it was issued for", () => {
  it("allows an in-scope action without asking for per-step confirmation", () => {
    const result = evaluatePermit({ permit: permit(), now: NOW, request: request(), controls: healthyControls(), presented_permit_hash: "hash-1" });
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("FOUNDER_ROOT widens the scope lists so a broad objective does not need every id enumerated", () => {
    const root = permit({ preset: "FOUNDER_ROOT", allowed_domains: [], allowed_tool_ids: [], allowed_effect_classes: [], allowed_entity_types: [], allowed_tenants: [], allowed_markets: [] });
    const result = evaluatePermit({
      permit: root, now: NOW,
      request: request({ tool_id: "cambra.merchant.anything", domain: "merchant", entity_type: "Brand" }),
      controls: healthyControls(),
    });
    expect(result.allowed).toBe(true);
  });
});

describe("C1 — controls no permit can lift, FOUNDER_ROOT included", () => {
  const ROOT = permit({ preset: "FOUNDER_ROOT", allowed_domains: [], allowed_tool_ids: [], allowed_effect_classes: [], allowed_entity_types: [], allowed_tenants: [], allowed_markets: [] });

  it("refuses under an emergency pause", () => {
    const result = evaluatePermit({
      permit: ROOT, now: NOW, request: request(),
      controls: healthyControls({ emergency: { safe_mode: true, control_revision: 7 } }),
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("emergency_pause_active");
    expect(result.unliftable_controls_hit).toContain("emergency_stop");
  });

  it("refuses when the emergency authority cannot be read at all", () => {
    const result = evaluatePermit({
      permit: ROOT, now: NOW, request: request(),
      controls: healthyControls({ emergencyAvailable: false, emergency: null }),
    });
    expect(result.blockers).toContain("emergency_authority_unavailable");
  });

  it("refuses a cross-tenant action", () => {
    const result = evaluatePermit({
      permit: ROOT, now: NOW, request: request(), controls: healthyControls({ tenant_matches: false }),
    });
    expect(result.blockers).toContain("cross_tenant_action_refused");
    expect(result.unliftable_controls_hit).toContain("tenant_isolation");
  });

  it("refuses anything that would expose a secret", () => {
    const result = evaluatePermit({
      permit: ROOT, now: NOW, request: request(), controls: healthyControls({ exposes_secret: true }),
    });
    expect(result.blockers).toContain("secret_exposure_refused");
  });

  it("refuses a suppressed recipient and refuses when the suppression ledger is unreadable", () => {
    expect(evaluatePermit({
      permit: ROOT, now: NOW, request: request({ external_messages: 1 }),
      controls: healthyControls({ recipient_suppressed: true }),
    }).blockers).toContain("recipient_suppressed");

    expect(evaluatePermit({
      permit: ROOT, now: NOW, request: request({ external_messages: 1 }),
      controls: healthyControls({ suppressionAvailable: false }),
    }).blockers).toContain("suppression_ledger_unavailable");
  });

  it("refuses a protected market", () => {
    const result = evaluatePermit({
      permit: ROOT, now: NOW, request: request({ market: "FR" }),
      controls: healthyControls({ market_commercially_eligible: false }),
    });
    expect(result.blockers).toContain("market_not_commercially_eligible");
    expect(result.unliftable_controls_hit).toContain("protected_market");
  });

  it("refuses an irreversible action without strong re-auth", () => {
    const result = evaluatePermit({
      permit: ROOT, now: NOW, request: request({ irreversible: true }), controls: healthyControls(),
    });
    expect(result.blockers).toContain("irreversible_action_requires_reauth");
  });

  it("refuses when a human must be present (2FA, signature, consent)", () => {
    expect(evaluatePermit({
      permit: ROOT, now: NOW, request: request(), controls: healthyControls({ human_presence_required: true }),
    }).blockers).toContain("human_presence_required");
  });

  it("declares that hard controls apply to every preset", () => {
    for (const preset of PERMIT_PRESETS) {
      const result = evaluatePermit({
        permit: permit({ preset, allowed_domains: [], allowed_tool_ids: [] }), now: NOW,
        request: request({ read_or_write: "READ" }), controls: healthyControls({ legal_block: true }),
      });
      expect(result.blockers, preset).toContain("legal_block_active");
      expect(result.hard_controls_apply_to_all_presets, preset).toBe(true);
    }
    expect(UNLIFTABLE_CONTROLS.length).toBeGreaterThan(0);
  });
});

describe("C1 — an explicit denial beats every allowance", () => {
  it("blocks a denied tool even at FOUNDER_ROOT with an empty allow list", () => {
    const result = evaluatePermit({
      permit: permit({ preset: "FOUNDER_ROOT", allowed_domains: [], allowed_tool_ids: [], explicit_denials: ["cambra.campaign.build_audience"] }),
      now: NOW, request: request(), controls: healthyControls(),
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("explicitly_denied_by_permit");
  });
});

describe("C1 — permit lifecycle and binding", () => {
  it("refuses a permit that is not ACTIVE", () => {
    for (const status of ["DRAFT", "EXPIRED", "REVOKED", "CONSUMED"]) {
      expect(evaluatePermit({ permit: permit({ status }), now: NOW, request: request(), controls: healthyControls() }).blockers, status)
        .toContain("permit_not_active");
    }
  });

  it("refuses an expired permit and one that is not yet valid", () => {
    expect(evaluatePermit({ permit: permit({ expires_at: "2026-08-17T11:00:00.000Z" }), now: NOW, request: request(), controls: healthyControls() }).blockers)
      .toContain("permit_expired");
    expect(evaluatePermit({ permit: permit({ valid_from: "2026-08-18T00:00:00.000Z" }), now: NOW, request: request(), controls: healthyControls() }).blockers)
      .toContain("permit_not_yet_valid");
  });

  it("treats a missing expiry as a blocker, not as 'never expires'", () => {
    const result = evaluatePermit({ permit: permit({ expires_at: "" }), now: NOW, request: request(), controls: healthyControls() });
    expect(result.blockers).toContain("permit_expiry_required");
  });

  it("refuses when the presented hash does not match the stored permit", () => {
    const result = evaluatePermit({ permit: permit(), now: NOW, request: request(), controls: healthyControls(), presented_permit_hash: "stale-hash" });
    expect(result.blockers).toContain("permit_hash_mismatch");
  });

  it("refuses with no permit at all", () => {
    expect(evaluatePermit({ permit: null, now: NOW, request: request() }).blockers).toEqual(["no_permit"]);
  });
});

describe("C1 — scope enforcement", () => {
  it("refuses a write under a READ or PREPARE preset", () => {
    for (const preset of ["READ", "PREPARE"]) {
      expect(evaluatePermit({ permit: permit({ preset }), now: NOW, request: request(), controls: healthyControls() }).blockers, preset)
        .toContain("preset_does_not_allow_writes");
    }
  });

  it("refuses an out-of-scope domain, tool, effect class, tenant and market", () => {
    const cases = [
      [{ domain: "finance" }, "domain_not_in_permit"],
      [{ tool_id: "cambra.finance.transfer" }, "tool_not_in_permit"],
      [{ effect_class: "money_movement" }, "effect_class_not_in_permit"],
      [{ tenant: "brand-99" }, "tenant_not_in_permit"],
      [{ market: "IT" }, "market_not_in_permit"],
    ];
    for (const [override, blocker] of cases) {
      expect(evaluatePermit({ permit: permit(), now: NOW, request: request(override), controls: healthyControls() }).blockers, blocker)
        .toContain(blocker);
    }
  });

  it("never implicitly allows a repository or a network domain, even at root", () => {
    const root = permit({ preset: "FOUNDER_ROOT", allowed_domains: [], allowed_tool_ids: [] });
    expect(evaluatePermit({ permit: root, now: NOW, request: request({ repository: "cambra/core" }), controls: healthyControls() }).blockers)
      .toContain("repository_not_in_permit");
    expect(evaluatePermit({ permit: root, now: NOW, request: request({ network_domain: "evil.example" }), controls: healthyControls() }).blockers)
      .toContain("network_domain_not_in_permit");
  });

  it("honours an exhaustive entity id list even at root", () => {
    const root = permit({ preset: "FOUNDER_ROOT", allowed_domains: [], allowed_tool_ids: [], allowed_entity_ids: ["c1"] });
    expect(evaluatePermit({ permit: root, now: NOW, request: request({ entity_id: "c2" }), controls: healthyControls() }).blockers)
      .toContain("entity_id_not_in_permit");
    expect(evaluatePermit({ permit: root, now: NOW, request: request({ entity_id: "c1" }), controls: healthyControls() }).allowed).toBe(true);
  });

  it("matches branch patterns with a trailing wildcard", () => {
    const base = permit({ allowed_repositories: ["cambra/core"], allowed_branch_patterns: ["agent/*"] });
    expect(evaluatePermit({ permit: base, now: NOW, request: request({ repository: "cambra/core", branch: "agent/foo" }), controls: healthyControls() }).allowed).toBe(true);
    expect(evaluatePermit({ permit: base, now: NOW, request: request({ repository: "cambra/core", branch: "main" }), controls: healthyControls() }).blockers)
      .toContain("branch_not_in_permit");
  });
});

describe("C1 — ceilings are enforced against consumption", () => {
  it("refuses once the cost, record or message ceiling would be exceeded", () => {
    const capped = permit({ max_cost_minor: 1000, consumed_cost_minor: 900, max_records_affected: 10, consumed_records_affected: 9, max_external_messages: 5, consumed_external_messages: 5 });
    expect(evaluatePermit({ permit: capped, now: NOW, request: request({ estimated_cost_minor: 200 }), controls: healthyControls() }).blockers)
      .toContain("permit_cost_ceiling_exceeded");
    expect(evaluatePermit({ permit: capped, now: NOW, request: request({ records_affected: 5 }), controls: healthyControls() }).blockers)
      .toContain("permit_record_ceiling_exceeded");
    expect(evaluatePermit({ permit: capped, now: NOW, request: request({ external_messages: 1 }), controls: healthyControls() }).blockers)
      .toContain("permit_message_ceiling_exceeded");
  });

  it("allows work that still fits inside the ceiling", () => {
    const capped = permit({ max_cost_minor: 1000, consumed_cost_minor: 100 });
    expect(evaluatePermit({ permit: capped, now: NOW, request: request({ estimated_cost_minor: 200 }), controls: healthyControls() }).allowed).toBe(true);
  });
});

describe("C1 — permit hash binds scope, not consumption", () => {
  it("changes when any authorised dimension changes", async () => {
    const base = await buildPermitHash(sha256, permit());
    const mutations = [
      { objective: "something else" }, { preset: "FOUNDER_ROOT" },
      { allowed_domains: ["campaign", "finance"] }, { allowed_tool_ids: ["other.tool"] },
      { allowed_markets: ["ES", "IT"] }, { max_cost_minor: 999 },
      { expires_at: "2026-08-18T00:00:00.000Z" }, { explicit_denials: ["x"] },
      { requires_strong_reauth: true }, { issue_nonce: "n2" },
    ];
    for (const mutation of mutations) {
      expect(await buildPermitHash(sha256, permit(mutation)), JSON.stringify(mutation)).not.toBe(base);
    }
  });

  it("does NOT change when the permit merely spends its headroom", async () => {
    // Hashing consumption would invalidate the permit on its first use.
    const base = await buildPermitHash(sha256, permit());
    const spent = await buildPermitHash(sha256, permit({
      consumed_cost_minor: 500, consumed_tool_calls: 12, consumed_records_affected: 3, consumption_revision: 4,
    }));
    expect(spent).toBe(base);
  });

  it("is stable regardless of the order of the scope lists", async () => {
    const a = await buildPermitHash(sha256, permit({ allowed_markets: ["ES", "IT"] }));
    const b = await buildPermitHash(sha256, permit({ allowed_markets: ["IT", "ES"] }));
    expect(a).toBe(b);
  });
});

describe("C1 — auto-resolving an Approval is deliberately hard", () => {
  it("refuses without an explicit auto-approval policy", () => {
    expect(canAutoResolveApproval({ permit: permit(), effect_class: "campaign_config", current_emergency_revision: 7 }).allowed).toBe(false);
  });

  it("refuses an effect class the policy does not name", () => {
    const withPolicy = permit({ auto_approval_policy: { effect_classes: ["campaign_config"] } });
    expect(canAutoResolveApproval({ permit: withPolicy, effect_class: "money_movement", current_emergency_revision: 7 }).reason)
      .toBe("effect_class_not_auto_approvable");
  });

  it("refuses when the emergency epoch moved since the permit was issued", () => {
    const withPolicy = permit({ auto_approval_policy: { effect_classes: ["campaign_config"] } });
    expect(canAutoResolveApproval({ permit: withPolicy, effect_class: "campaign_config", current_emergency_revision: 8 }).reason)
      .toBe("emergency_epoch_moved_since_issue");
  });

  it("refuses when the epoch is unknown on either side", () => {
    const withPolicy = permit({ auto_approval_policy: { effect_classes: ["campaign_config"] } });
    expect(canAutoResolveApproval({ permit: withPolicy, effect_class: "campaign_config", current_emergency_revision: null }).reason)
      .toBe("emergency_revision_unknown");
  });

  it("allows only when the policy names it and the epoch is unchanged", () => {
    const withPolicy = permit({ auto_approval_policy: { effect_classes: ["campaign_config"] } });
    expect(canAutoResolveApproval({ permit: withPolicy, effect_class: "campaign_config", current_emergency_revision: 7 }).allowed).toBe(true);
  });
});
