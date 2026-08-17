// DASHBOARD-C2 (2026-08-17) — canonical pipeline stage resolution.
//
// The rule these tests exist for: when several source columns disagree about the
// same subject, the LEAST-ADVANCED reading wins and the disagreement is recorded.
// OutboundLead carries three overlapping mutable vocabularies, so this is not a
// hypothetical — it is the normal case.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkTransition,
  isRetiredAuthority,
  LANES,
  laneAuthority,
  mapLegacyStage,
  PIPELINE_STAGE_REGISTRY_VERSION,
  RETIRED_AUTHORITY,
  resolveStage,
  stageDefinition,
  stagesFor,
  transitionDirection,
} from "../../base44/shared/pipelineStageRegistry.ts";

describe("C2 — the registry reuses the frozen lane vocabulary", () => {
  it("carries exactly the four CAMPAIGN_LANES", () => {
    expect([...LANES]).toEqual([
      "MERCHANT_ACQUISITION", "PARTNER_ACQUISITION", "PROVIDER_RELATIONS", "MERCHANT_LIFECYCLE",
    ]);
  });

  it("matches the frozen constant in campaignsCore rather than redefining it", () => {
    const core = fs.readFileSync("base44/shared/campaignsCore.ts", "utf8");
    for (const lane of LANES) expect(core, lane).toContain(`'${lane}'`);
  });

  it("is versioned", () => {
    expect(PIPELINE_STAGE_REGISTRY_VERSION).toMatch(/^pipeline-stage-registry-\d+\.\d+\.\d+$/);
  });

  it("gives every lane an ordered, non-empty stage list with unique keys and orders", () => {
    for (const lane of LANES) {
      const stages = stagesFor(lane);
      expect(stages.length, lane).toBeGreaterThan(5);
      expect(new Set(stages.map((s) => s.key)).size, lane).toBe(stages.length);
      expect(new Set(stages.map((s) => s.order)).size, lane).toBe(stages.length);
      const orders = stages.map((s) => s.order);
      expect(orders, lane).toEqual([...orders].sort((a, b) => a - b));
    }
  });

  it("gives every ACQUISITION lane a win and a loss stage", () => {
    // The three commercial funnels can be won or lost.
    for (const lane of ["MERCHANT_ACQUISITION", "PARTNER_ACQUISITION", "PROVIDER_RELATIONS"]) {
      const semantics = stagesFor(lane).map((s) => s.semantics);
      expect(semantics, `${lane} win`).toContain("win");
      expect(semantics, `${lane} loss`).toContain("loss");
    }
  });

  it("gives the lifecycle lane blocked semantics instead of loss, because a merchant churns rather than being lost", () => {
    const semantics = stagesFor("MERCHANT_LIFECYCLE").map((s) => s.semantics);
    expect(semantics).toContain("win");
    expect(semantics).toContain("blocked");
    // A lifecycle projection has no commercial loss: BLOCKED and CHURN_RISK carry
    // that meaning, and inventing a LOST stage here would imply a funnel this
    // lane is not.
    expect(semantics).not.toContain("loss");
    const keys = stagesFor("MERCHANT_LIFECYCLE").map((s) => s.key);
    expect(keys).toContain("BLOCKED");
    expect(keys).toContain("CHURN_RISK");
  });
});

describe("C2 — legacy values map onto canonical stages, and unknown stays unknown", () => {
  it("maps every declared OutboundLead.stage value", () => {
    const enums = JSON.parse(fs.readFileSync("base44/entities/OutboundLead.jsonc", "utf8"));
    for (const value of enums.properties.stage.enum) {
      expect(mapLegacyStage("MERCHANT_ACQUISITION", "stage", value), value).toBeTruthy();
    }
  });

  it("maps every declared revenue_stage and reservoir_state value", () => {
    const enums = JSON.parse(fs.readFileSync("base44/entities/OutboundLead.jsonc", "utf8"));
    for (const column of ["revenue_stage", "reservoir_state"]) {
      for (const value of enums.properties[column].enum) {
        expect(mapLegacyStage("MERCHANT_ACQUISITION", column, value), `${column}:${value}`).toBeTruthy();
      }
    }
  });

  it("maps every PartnerProspect, Provider and DealActivation value", () => {
    const cases = [
      ["PARTNER_ACQUISITION", "stage", "PartnerProspect", "stage"],
      ["PROVIDER_RELATIONS", "provider_monetization_status", "Provider", "provider_monetization_status"],
      ["MERCHANT_LIFECYCLE", "status", "DealActivation", "status"],
    ];
    for (const [lane, column, entity, prop] of cases) {
      const enums = JSON.parse(fs.readFileSync(`base44/entities/${entity}.jsonc`, "utf8"));
      for (const value of enums.properties[prop].enum) {
        expect(mapLegacyStage(lane, column, value), `${entity}.${prop}:${value}`).toBeTruthy();
      }
    }
  });

  it("returns null for a value nobody mapped rather than guessing the nearest stage", () => {
    expect(mapLegacyStage("MERCHANT_ACQUISITION", "stage", "some_new_value")).toBeNull();
    expect(mapLegacyStage("MERCHANT_ACQUISITION", "not_a_column", "lead")).toBeNull();
  });

  it("does not silently promote enrichment to qualification", () => {
    // Enrichment adds data; it is not commercial qualification.
    expect(mapLegacyStage("MERCHANT_ACQUISITION", "stage", "enriched")).toBe("DISCOVERED");
    expect(mapLegacyStage("MERCHANT_ACQUISITION", "stage", "scored")).toBe("QUALIFIED");
  });

  it("treats an operational wait as a stage it already reached, not a new one", () => {
    expect(mapLegacyStage("MERCHANT_ACQUISITION", "stage", "waiting_window")).toBe("CONTACT_READY");
    expect(mapLegacyStage("MERCHANT_ACQUISITION", "stage", "waiting_capacity")).toBe("CONTACT_READY");
  });

  it("maps a revoked mandate to a block, not a completion", () => {
    expect(mapLegacyStage("MERCHANT_LIFECYCLE", "status", "revoked")).toBe("BLOCKED");
    expect(mapLegacyStage("MERCHANT_LIFECYCLE", "status", "closed")).toBe("COMPLETED");
  });

  it("maps provider unknown to the weakest stage, never a later one", () => {
    expect(mapLegacyStage("PROVIDER_RELATIONS", "provider_monetization_status", "unknown")).toBe("IDENTIFIED");
    expect(mapLegacyStage("PROVIDER_RELATIONS", "provider_monetization_status", "prohibited")).toBe("DISQUALIFIED");
  });
});

describe("C2 — the conflict rule takes the least-advanced reading", () => {
  it("agrees cleanly when every column says the same thing", () => {
    const reading = resolveStage("MERCHANT_ACQUISITION", {
      stage: "contacted", revenue_stage: "contacted", reservoir_state: "queued",
    });
    // stage and revenue_stage both say CONTACTED; reservoir says CONTACT_READY,
    // which is EARLIER — so the conflict rule demotes.
    expect(reading.stage).toBe("CONTACT_READY");
    expect(reading.conflicted).toBe(true);
    expect(reading.confidence).toBe("CONFLICTED");
  });

  it("reports OBSERVED when all mapped columns land on one stage", () => {
    const reading = resolveStage("MERCHANT_ACQUISITION", {
      stage: "contacted", revenue_stage: "contacted",
    });
    expect(reading.stage).toBe("CONTACTED");
    expect(reading.conflicted).toBe(false);
    expect(reading.confidence).toBe("OBSERVED");
  });

  it("refuses to call a lead won because the reservoir says converted", () => {
    const reading = resolveStage("MERCHANT_ACQUISITION", {
      stage: "contacted", reservoir_state: "converted",
    });
    // This is the case the rule exists for: a suspicious reservoir row must not
    // turn a contacted lead into a won deal.
    expect(reading.stage).toBe("CONTACTED");
    expect(reading.stage).not.toBe("WON");
    expect(reading.conflicted).toBe(true);
    expect(reading.readings.find((r) => r.column === "reservoir_state").canonical).toBe("WON");
  });

  it("keeps every reading so the discarded one is inspectable", () => {
    const reading = resolveStage("MERCHANT_ACQUISITION", {
      stage: "won", revenue_stage: "engaged", reservoir_state: "ready",
    });
    expect(reading.stage).toBe("CONTACT_READY");
    expect(reading.readings).toHaveLength(3);
    expect(reading.readings.map((r) => r.canonical).sort()).toEqual(["CONTACT_READY", "ENGAGED", "WON"]);
  });

  it("returns a null stage and UNKNOWN when nothing is readable", () => {
    const reading = resolveStage("MERCHANT_ACQUISITION", {});
    // Never a default of the first stage: an unread row must not look like a new one.
    expect(reading.stage).toBeNull();
    expect(reading.confidence).toBe("UNKNOWN");
    expect(reading.terminal).toBe(false);
  });

  it("records an unmapped value and demotes confidence to DERIVED", () => {
    const reading = resolveStage("MERCHANT_ACQUISITION", {
      stage: "contacted", revenue_stage: "brand_new_value",
    });
    expect(reading.stage).toBe("CONTACTED");
    expect(reading.unmapped_values).toEqual([{ column: "revenue_stage", raw: "brand_new_value" }]);
    expect(reading.confidence).toBe("DERIVED");
  });

  it("reads the single-column lanes without inventing a conflict", () => {
    expect(resolveStage("PARTNER_ACQUISITION", { stage: "replied" }).stage).toBe("ENGAGED");
    expect(resolveStage("PROVIDER_RELATIONS", { provider_monetization_status: "negotiating" }).stage).toBe("NEGOTIATION_OPEN");
    expect(resolveStage("MERCHANT_LIFECYCLE", { status: "live" }).stage).toBe("LIVE");
  });

  it("survives a null row", () => {
    expect(resolveStage("MERCHANT_ACQUISITION", null).confidence).toBe("UNKNOWN");
  });
});

describe("C2 — direction is derived from order, not asserted", () => {
  it("recognises forward, backward and terminal", () => {
    expect(transitionDirection("MERCHANT_ACQUISITION", "DISCOVERED", "CONTACTED")).toBe("FORWARD");
    expect(transitionDirection("MERCHANT_ACQUISITION", "CONTACTED", "DISCOVERED")).toBe("BACKWARD");
    expect(transitionDirection("MERCHANT_ACQUISITION", "CONTACTED", "LOST")).toBe("TERMINAL");
  });

  it("treats a first observation as forward", () => {
    expect(transitionDirection("MERCHANT_ACQUISITION", null, "DISCOVERED")).toBe("FORWARD");
  });
});

describe("C2 — a transition must be justified", () => {
  it("refuses an automatic move to CONTACTED with no source event", () => {
    const result = checkTransition({
      lane: "MERCHANT_ACQUISITION", from: "CONTACT_READY", to: "CONTACTED", automatic: true,
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("automatic_transition_requires_source_event");
  });

  it("accepts it with the canonical delivery event", () => {
    const result = checkTransition({
      lane: "MERCHANT_ACQUISITION", from: "CONTACT_READY", to: "CONTACTED",
      automatic: true, source_event_type: "message_delivered_observed",
    });
    expect(result.allowed).toBe(true);
  });

  it("refuses a source event that does not justify the stage", () => {
    // A model saying a lead sounds interested is not an observed reply.
    const result = checkTransition({
      lane: "MERCHANT_ACQUISITION", from: "CONTACTED", to: "ENGAGED",
      automatic: true, source_event_type: "model_thinks_interested",
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers.some((b) => b.startsWith("source_event_not_allowed_for_stage"))).toBe(true);
  });

  it("allows a manual move without a source event", () => {
    const result = checkTransition({
      lane: "MERCHANT_ACQUISITION", from: "CONTACT_READY", to: "CONTACTED", automatic: false,
    });
    expect(result.allowed).toBe(true);
  });

  it("requires a reason code for a loss", () => {
    expect(checkTransition({ lane: "MERCHANT_ACQUISITION", from: "CONTACTED", to: "LOST", automatic: false }).blockers)
      .toContain("reason_code_required");
    expect(checkTransition({ lane: "MERCHANT_ACQUISITION", from: "CONTACTED", to: "LOST", automatic: false, reason_code: "no_budget" }).allowed)
      .toBe(true);
  });

  it("requires a reason code for a disqualification", () => {
    expect(checkTransition({ lane: "MERCHANT_ACQUISITION", from: "DISCOVERED", to: "DISQUALIFIED", automatic: false }).allowed)
      .toBe(false);
  });

  it("refuses any write to the projection-only lifecycle lane", () => {
    const result = checkTransition({
      lane: "MERCHANT_LIFECYCLE", from: "REGISTERED", to: "LIVE", automatic: false,
    });
    // DealActivation already has a guarded transition authority. Writing here
    // would create a second one.
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("lane_is_projection_only");
    expect(laneAuthority("MERCHANT_LIFECYCLE").projection_only).toBe(true);
  });

  it("refuses unknown lanes and stages", () => {
    expect(checkTransition({ lane: "MADE_UP", from: null, to: "X", automatic: false }).blockers)
      .toContain("unknown_lane");
    expect(checkTransition({ lane: "MERCHANT_ACQUISITION", from: null, to: "NOT_A_STAGE", automatic: false }).blockers)
      .toContain("unknown_target_stage");
  });

  it("WON does not imply a merchant was created", () => {
    // The registry states it; this pins the statement so it cannot be dropped.
    expect(stageDefinition("MERCHANT_ACQUISITION", "WON").note).toContain("does not create a merchant");
  });
});

describe("C2 — the dead authority is refused by name", () => {
  it("declares DealApplication retired with zero producers", () => {
    expect(RETIRED_AUTHORITY.entity).toBe("DealApplication");
    expect(RETIRED_AUTHORITY.state).toBe("ZERO_PRODUCERS");
    expect(isRetiredAuthority("DealApplication")).toBe(true);
    expect(isRetiredAuthority("OutboundLead")).toBe(false);
  });

  it("appears in no lane authority", () => {
    for (const lane of LANES) {
      expect(laneAuthority(lane).entity, lane).not.toBe("DealApplication");
    }
  });
});
