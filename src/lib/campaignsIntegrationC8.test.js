// CAMP-C8 (2026-08-16) — integration surfaces: deep links, pipeline
// transitions, Discovery hand-off, Founder OS alerts and the Command tool
// contract (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C8).
import { describe, expect, it } from "vitest";
import {
  buildDeepLink,
  buildDiscoveryAudienceCandidates,
  buildFounderOsCommercialAlerts,
  CAMPAIGN_COMMAND_TOOLS,
  COMMAND_PERMISSION_MODES,
  evaluateCommandToolInvocation,
  evaluatePipelineTransition,
  PIPELINE_TRANSITION_RULES,
} from "../../base44/shared/campaignsIntegration.ts";

describe("C8 — deep links", () => {
  it("gives every canonical entity a stable link into its own page", () => {
    expect(buildDeepLink("campaign", "c1")).toBe("/admin/campaigns?campaign=c1");
    expect(buildDeepLink("thread", "t1")).toBe("/admin/conversations?thread=t1");
    expect(buildDeepLink("discovery_run", "r1")).toBe("/admin/discovery?run=r1");
    expect(buildDeepLink("merchant", "m1")).toBe("/admin/merchants?merchant=m1");
  });

  it("encodes ids and returns null for an unknown kind or an empty id", () => {
    expect(buildDeepLink("campaign", "a b&c")).toBe("/admin/campaigns?campaign=a%20b%26c");
    expect(buildDeepLink("nonsense", "x")).toBeNull();
    expect(buildDeepLink("campaign", "")).toBeNull();
  });
});

describe("C8 — pipeline transitions reuse the existing stage authority", () => {
  it("allows a model-only transition where that is genuinely sufficient", () => {
    const result = evaluatePipelineTransition({
      rule_key: "CAMPAIGN_SEND_OBSERVED", current_stage: "scored", source_available: true,
    });
    expect(result.allowed).toBe(true);
    expect(result.to_stage).toBe("contacted");
    expect(result.rule_key).toBe("CAMPAIGN_SEND_OBSERVED");
  });

  it("never lets a model classification alone reach won", () => {
    const withoutHuman = evaluatePipelineTransition({
      rule_key: "CONNECTION_COMPLETED", current_stage: "meeting", source_available: true,
    });
    expect(withoutHuman.allowed).toBe(false);
    expect(withoutHuman.reason).toBe("human_confirmation_required");

    const withHuman = evaluatePipelineTransition({
      rule_key: "CONNECTION_COMPLETED", current_stage: "meeting",
      source_available: true, human_confirmed: true,
    });
    expect(withHuman.allowed).toBe(true);
    expect(withHuman.to_stage).toBe("won");
  });

  it("never downgrades a stage because a source failed", () => {
    const result = evaluatePipelineTransition({
      rule_key: "NOT_INTERESTED", current_stage: "meeting",
      source_available: false, human_confirmed: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("source_unavailable_no_downgrade");
    expect(result.to_stage).toBeNull();
  });

  it("is a no-op when the lead is already in the target stage", () => {
    const result = evaluatePipelineTransition({
      rule_key: "CAMPAIGN_SEND_OBSERVED", current_stage: "contacted", source_available: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("already_in_target_stage");
  });

  it("rejects an unknown rule and gives every rule a key and evidence requirement", () => {
    expect(evaluatePipelineTransition({ rule_key: "MAKE_IT_WON" }).reason).toBe("unknown_transition_rule");
    for (const rule of PIPELINE_TRANSITION_RULES) {
      expect(rule.key).toBeTruthy();
      expect(rule.evidence).toBeTruthy();
      expect(typeof rule.model_alone_sufficient).toBe("boolean");
    }
  });
});

describe("C8 — Discovery hand-off creates candidates, never sends", () => {
  it("carries the discovery evidence with each candidate and performs no effect", () => {
    const result = buildDiscoveryAudienceCandidates({
      discovery_run_id: "run-1",
      results: [
        { id: "l1", name: "Acme", company_key: "acme", country: "ES", score: 82, fit_band: "HIGH", evidence_status: "OBSERVED", contact: { email: "cfo@acme.example" } },
        { id: "l2", name: "Globex", canonical_company_key: "globex", country: "ES", score: 55, fit_band: "MEDIUM" },
      ],
    });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].discovery_score).toBe(82);
    expect(result.candidates[0].discovery_run_id).toBe("run-1");
    expect(result.source_type).toBe("DISCOVERY_SAVED_SEARCH");
    expect(result.external_send_performed).toBe(false);
    expect(result.creates).toBe("audience_candidates_only");
  });

  it("drops rows with no subject id rather than inventing one", () => {
    const result = buildDiscoveryAudienceCandidates({
      discovery_run_id: "run-1", results: [{ name: "No id" }, { id: "l1", name: "Acme" }],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].subject_id).toBe("l1");
  });
});

describe("C8 — Founder OS gets exceptions with deep links, not a second UI", () => {
  it("raises an alert per blocked campaign, escalated thread and unhealthy sender, each deep-linked", () => {
    const result = buildFounderOsCommercialAlerts({
      campaigns: [{ id: "c1", name: "ES fashion", blockers: ["campaign_message_required"] }],
      threads: [{ id: "t1", counterparty_name: "Ana", operational_status: "ESCALATED" }],
      profiles: [{ profile_key: "p1", health: "AUTH_EXPIRED" }],
    });
    expect(result.alerts).toHaveLength(3);
    expect(result.every_alert_deep_links).toBe(true);
    expect(result.alerts.find((row) => row.kind === "THREAD_REQUIRES_FOUNDER").severity).toBe("critical");
    expect(result.alerts.find((row) => row.kind === "SENDER_HEALTH").deep_link).toContain("/admin/conversations");
  });

  it("names an unreadable source instead of showing a reassuring empty list", () => {
    const result = buildFounderOsCommercialAlerts({
      campaigns: [{ id: "c1", blockers: ["x"] }],
      threadsAvailable: false,
      profilesAvailable: false,
    });
    expect(result.data_status).toBe("PARTIAL");
    expect(result.unknown_sources).toEqual(["threads", "sending_profiles"]);
  });

  it("raises nothing when everything is healthy", () => {
    const result = buildFounderOsCommercialAlerts({
      campaigns: [{ id: "c1", blockers: [] }],
      threads: [{ id: "t1", operational_status: "AI_HANDLING" }],
      profiles: [{ profile_key: "p1", health: "HEALTHY" }],
    });
    expect(result.alerts).toEqual([]);
    expect(result.data_status).toBe("AVAILABLE");
  });
});

describe("C8 — Command tool contract", () => {
  it("publishes typed descriptors and no PREPARE tool performs an external effect", () => {
    expect(CAMPAIGN_COMMAND_TOOLS.length).toBeGreaterThan(0);
    for (const tool of CAMPAIGN_COMMAND_TOOLS) {
      expect(COMMAND_PERMISSION_MODES).toContain(tool.mode);
      expect(tool.route).toBeTruthy();
      if (tool.mode === "PREPARE") expect(tool.external_effect, tool.name).toBe(false);
    }
  });

  it("refuses a tool invoked below its required permission mode", () => {
    const readOnly = evaluateCommandToolInvocation({ tool: "campaign.create_draft", granted_mode: "READ" });
    expect(readOnly.allowed).toBe(false);
    expect(readOnly.blockers).toContain("insufficient_permission_mode");

    const prepared = evaluateCommandToolInvocation({ tool: "campaign.create_draft", granted_mode: "PREPARE" });
    expect(prepared.allowed).toBe(true);
  });

  it("blocks every material tool during an emergency, including in ROOT mode", () => {
    const root = evaluateCommandToolInvocation({
      tool: "campaign.pause", granted_mode: "ROOT", emergency_active: true,
    });
    expect(root.allowed).toBe(false);
    expect(root.blockers).toContain("emergency_blocks_material_tool");
    expect(root.hard_controls_apply_to_all_modes).toBe(true);
  });

  it("never allows a suppression bypass, whatever the mode", () => {
    for (const mode of COMMAND_PERMISSION_MODES) {
      const result = evaluateCommandToolInvocation({
        tool: "campaign.search", granted_mode: mode, suppression_bypass_requested: true,
      });
      expect(result.allowed, mode).toBe(false);
      expect(result.blockers, mode).toContain("suppression_cannot_be_bypassed");
    }
  });

  it("rejects an unknown tool and an invalid permission mode", () => {
    expect(evaluateCommandToolInvocation({ tool: "campaign.delete_everything", granted_mode: "ROOT" }).blockers)
      .toContain("unknown_tool");
    expect(evaluateCommandToolInvocation({ tool: "campaign.search", granted_mode: "SUPERUSER" }).blockers)
      .toContain("invalid_permission_mode");
  });

  it("allows a read tool during an emergency — reading is not a material effect", () => {
    const result = evaluateCommandToolInvocation({
      tool: "conversation.search", granted_mode: "READ", emergency_active: true,
    });
    expect(result.allowed).toBe(true);
  });
});
