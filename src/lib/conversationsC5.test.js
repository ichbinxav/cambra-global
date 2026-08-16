// CAMP-C5 (2026-08-16) — behavior tests for inbound thread resolution,
// classification and autonomy/takeover (PROMPT_FIX_DISCOVERY_V2 Parte 4, C5).
//
// The property that matters most here: an inbound message attaches to the
// RIGHT thread or to NO thread. A wrong attachment leaks one counterparty's
// words into another's history, so ambiguity must be REVIEW_REQUIRED.
import { describe, expect, it } from "vitest";
import {
  applyTakeoverAction,
  CONVERSATION_CLASSIFICATIONS,
  ESCALATION_REQUIRED_CLASSIFICATIONS,
  evaluateAutonomyDecision,
  recordClassification,
  resolveInboundThread,
} from "../../base44/shared/conversationResolution.ts";

const AT = "2026-08-16T12:00:00.000Z";

const THREADS = [
  {
    id: "t1", external_thread_id: "prov-1", external_provider: "resend",
    internet_message_ids: ["<a@mail>"], enrollment_id: "e1",
    counterparty_email: "cfo@acme.example", campaign_id: "c1", status: "open",
    brand_id: "",
  },
  {
    id: "t2", external_thread_id: "prov-2", external_provider: "resend",
    internet_message_ids: ["<b@mail>"], enrollment_id: "e2",
    counterparty_email: "cfo@acme.example", campaign_id: "c2", status: "open",
    brand_id: "",
  },
];

describe("C5 — inbound thread resolution ladder", () => {
  it("resolves on the exact provider thread id first", () => {
    const result = resolveInboundThread({
      envelope: { provider: "resend", provider_thread_id: "prov-2", from_email: "cfo@acme.example" },
      threads: THREADS,
    });
    expect(result.status).toBe("RESOLVED");
    expect(result.thread.id).toBe("t2");
    expect(result.strategy).toBe("PROVIDER_THREAD_ID");
  });

  it("falls back to internet message references", () => {
    const result = resolveInboundThread({
      envelope: { in_reply_to: "<b@mail>", from_email: "cfo@acme.example" },
      threads: THREADS,
    });
    expect(result.status).toBe("RESOLVED");
    expect(result.thread.id).toBe("t2");
    expect(result.strategy).toBe("INTERNET_MESSAGE_REFERENCES");
  });

  it("falls back to the enrollment reference", () => {
    const result = resolveInboundThread({
      envelope: { enrollment_id: "e1", from_email: "cfo@acme.example" },
      threads: THREADS,
    });
    expect(result.status).toBe("RESOLVED");
    expect(result.thread.id).toBe("t1");
    expect(result.strategy).toBe("ENROLLMENT_OR_CAMPAIGN_REF");
  });

  it("only uses email matching when scoped to a campaign, and never for a closed thread", () => {
    const scoped = resolveInboundThread({
      envelope: { from_email: "cfo@acme.example", campaign_id: "c1" },
      threads: THREADS,
    });
    expect(scoped.status).toBe("RESOLVED");
    expect(scoped.thread.id).toBe("t1");

    // Same address, no campaign scope: must NOT guess between two threads.
    const unscoped = resolveInboundThread({
      envelope: { from_email: "cfo@acme.example" },
      threads: THREADS,
    });
    expect(unscoped.status).toBe("UNRESOLVED");

    const closed = resolveInboundThread({
      envelope: { from_email: "cfo@acme.example", campaign_id: "c1" },
      threads: [{ ...THREADS[0], status: "closed" }],
    });
    expect(closed.status).toBe("UNRESOLVED");
  });

  it("returns REVIEW_REQUIRED — and no thread — when several candidates match equally", () => {
    const duplicated = [THREADS[0], { ...THREADS[0], id: "t1-dup" }];
    const result = resolveInboundThread({
      envelope: { provider: "resend", provider_thread_id: "prov-1" },
      threads: duplicated,
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.thread).toBeNull();
    expect(result.candidates).toEqual(["t1", "t1-dup"]);
    expect(result.reason).toBe("ambiguous_thread_candidates");
  });

  it("refuses a cross-tenant match however strong the technical evidence", () => {
    const result = resolveInboundThread({
      envelope: { provider: "resend", provider_thread_id: "prov-1" },
      threads: [{ ...THREADS[0], brand_id: "brand-A" }],
      expected_tenant: "brand-B",
    });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.thread).toBeNull();
    expect(result.reason).toBe("cross_tenant_thread_match_refused");
  });

  it("reports UNRESOLVED rather than attaching to an unrelated thread", () => {
    const result = resolveInboundThread({
      envelope: { from_email: "stranger@nowhere.example" },
      threads: THREADS,
    });
    expect(result.status).toBe("UNRESOLVED");
    expect(result.thread).toBeNull();
    expect(result.reason).toBe("no_thread_matched");
  });

  it("does not match a provider thread id belonging to another provider", () => {
    const result = resolveInboundThread({
      envelope: { provider: "instantly", provider_thread_id: "prov-1" },
      threads: THREADS,
    });
    expect(result.status).toBe("UNRESOLVED");
  });
});

describe("C5 — classification keeps provenance and never deletes a prediction", () => {
  it("records a model classification with its confidence and model", () => {
    const result = recordClassification({
      classification: "POSITIVE_INTEREST", confidence: 0.82, model: "claude",
      source_message_id: "m1", policy_version: "3", at: AT,
    });
    expect(result.classification).toBe("POSITIVE_INTEREST");
    expect(result.classification_source).toBe("MODEL");
    expect(result.classification_confidence).toBe(0.82);
    expect(result.corrected_by).toBeNull();
  });

  it("a human correction supersedes the model WITHOUT deleting the original prediction", () => {
    const model = recordClassification({
      classification: "POSITIVE_INTEREST", confidence: 0.82, model: "claude", at: AT,
    });
    const corrected = recordClassification({
      existing: model, classification: "OBJECTION", corrected_by: "founder@cambra.global", at: AT,
    });
    expect(corrected.classification).toBe("OBJECTION");
    expect(corrected.classification_source).toBe("HUMAN");
    expect(corrected.classification_confidence).toBe(1);
    expect(corrected.superseded_prediction.classification).toBe("POSITIVE_INTEREST");
    expect(corrected.superseded_prediction.confidence).toBe(0.82);
    expect(corrected.superseded_prediction.model).toBe("claude");
  });

  it("maps an unsupported classification to REVIEW_REQUIRED and keeps the raw input visible", () => {
    const result = recordClassification({ classification: "DEFINITELY_BUY_NOW", at: AT });
    expect(result.classification).toBe("REVIEW_REQUIRED");
    expect(result.unsupported_classification_input).toBe("DEFINITELY_BUY_NOW");
  });

  it("flags escalation for every classification that must reach a human", () => {
    for (const value of ESCALATION_REQUIRED_CLASSIFICATIONS) {
      expect(recordClassification({ classification: value, at: AT }).escalation_required, value).toBe(true);
    }
    expect(recordClassification({ classification: "MORE_INFORMATION", at: AT }).escalation_required).toBe(false);
  });

  it("keeps the taxonomy aligned with the entity enum expectations", () => {
    expect(CONVERSATION_CLASSIFICATIONS).toContain("OUT_OF_OFFICE");
    expect(CONVERSATION_CLASSIFICATIONS).toContain("PROVIDER_PROPOSAL");
    expect(CONVERSATION_CLASSIFICATIONS).toContain("REVIEW_REQUIRED");
  });
});

describe("C5 — autonomy decision fails closed", () => {
  function autonomousContext(overrides = {}) {
    return {
      classification: "MORE_INFORMATION",
      ai_mode: "AUTONOMOUS",
      policy_autonomous_replies_enabled: true,
      founder_permit_available: true,
      human_takeover_at: null,
      emergency: { safe_mode: false, communications_paused: false },
      emergencyAvailable: true,
      sending_profile_healthy: true,
      within_business_hours: true,
      grounded: true,
      contains_material_terms: false,
      ...overrides,
    };
  }

  it("allows autonomous sending only when every condition holds", () => {
    const result = evaluateAutonomyDecision(autonomousContext());
    expect(result.decision).toBe("AUTONOMOUS");
    expect(result.may_send_autonomously).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("never handles a legal, security, complaint, provider-proposal or invoice thread autonomously", () => {
    for (const classification of ESCALATION_REQUIRED_CLASSIFICATIONS) {
      const result = evaluateAutonomyDecision(autonomousContext({ classification }));
      expect(result.may_send_autonomously, classification).toBe(false);
      expect(result.escalation_required, classification).toBe(true);
      expect(result.blockers, classification).toContain("classification_requires_human");
    }
  });

  it("refuses when the classification is UNKNOWN or absent", () => {
    for (const classification of ["UNKNOWN", "REVIEW_REQUIRED", ""]) {
      expect(evaluateAutonomyDecision(autonomousContext({ classification })).blockers, classification)
        .toContain("classification_not_confident");
    }
  });

  it("refuses without a FounderPermit — the authority absent on this tree", () => {
    const result = evaluateAutonomyDecision(autonomousContext({ founder_permit_available: false }));
    expect(result.may_send_autonomously).toBe(false);
    expect(result.blockers).toContain("founder_permit_unavailable");
  });

  it("refuses after a human takeover, under emergency, outside business hours and when ungrounded", () => {
    expect(evaluateAutonomyDecision(autonomousContext({ human_takeover_at: AT })).blockers).toContain("human_has_taken_over");
    expect(evaluateAutonomyDecision(autonomousContext({ emergency: { safe_mode: true } })).blockers).toContain("emergency_pause_active");
    expect(evaluateAutonomyDecision(autonomousContext({ within_business_hours: false })).blockers).toContain("outside_business_hours");
    expect(evaluateAutonomyDecision(autonomousContext({ grounded: false })).blockers).toContain("reply_not_grounded_in_evidence");
    expect(evaluateAutonomyDecision(autonomousContext({ contains_material_terms: true })).blockers).toContain("material_terms_require_founder");
  });

  it("may still DRAFT for a human when sending is blocked, but not during an emergency", () => {
    const blocked = evaluateAutonomyDecision(autonomousContext({ founder_permit_available: false }));
    expect(blocked.may_send_autonomously).toBe(false);
    expect(blocked.may_draft).toBe(true);

    const emergency = evaluateAutonomyDecision(autonomousContext({ emergency: { safe_mode: true } }));
    expect(emergency.may_draft).toBe(false);
  });

  it("treats an unreadable emergency authority as a blocker", () => {
    const result = evaluateAutonomyDecision(autonomousContext({ emergencyAvailable: false, emergency: null }));
    expect(result.blockers).toContain("emergency_authority_unavailable");
    expect(result.may_draft).toBe(false);
  });
});

describe("C5 — human takeover state machine", () => {
  const THREAD = { id: "t1", operational_status: "AI_HANDLING", next_action_due_at: AT };

  it("TAKE_OVER blocks auto-send immediately and records who took over", () => {
    const result = applyTakeoverAction({ thread: THREAD, action: "TAKE_OVER", actor: "founder@cambra.global", at: AT });
    expect(result.ok).toBe(true);
    expect(result.auto_send_blocked).toBe(true);
    expect(result.patch.ai_mode).toBe("OFF");
    expect(result.patch.owner_type).toBe("HUMAN");
    expect(result.patch.human_takeover_by).toBe("founder@cambra.global");
  });

  it("TAKE_OVER flags reconciliation when an effect is already in flight", () => {
    const result = applyTakeoverAction({
      thread: THREAD, action: "TAKE_OVER", actor: "founder@cambra.global", at: AT, effect_in_flight: true,
    });
    expect(result.reconciliation_required).toBe(true);
  });

  it("refuses RETURN_TO_CAMBRA while an effect is in flight", () => {
    const result = applyTakeoverAction({
      thread: THREAD, action: "RETURN_TO_CAMBRA", actor: "founder@cambra.global", at: AT, effect_in_flight: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("effect_in_flight_requires_reconciliation");
    expect(result.patch).toBeNull();
  });

  it("refuses RETURN_TO_CAMBRA on an unresolved escalation", () => {
    const result = applyTakeoverAction({
      thread: { id: "t1", operational_status: "ESCALATED", next_action_due_at: "" },
      action: "RETURN_TO_CAMBRA", actor: "founder@cambra.global", at: AT,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("escalation_must_be_resolved_before_return");
  });

  it("returns control in DRAFT_ONLY rather than straight back to autonomous", () => {
    const result = applyTakeoverAction({ thread: THREAD, action: "RETURN_TO_CAMBRA", actor: "founder@cambra.global", at: AT });
    expect(result.ok).toBe(true);
    expect(result.patch.owner_type).toBe("CAMBRA");
    expect(result.patch.ai_mode).toBe("DRAFT_ONLY");
    expect(result.auto_send_blocked).toBe(false);
  });

  it("supports pause, resume, escalate and close, and rejects an unknown action", () => {
    expect(applyTakeoverAction({ thread: THREAD, action: "PAUSE_AUTOMATION", actor: "f", at: AT }).patch.operational_status).toBe("PAUSED_BY_FOUNDER");
    expect(applyTakeoverAction({ thread: THREAD, action: "RESUME_AUTOMATION", actor: "f", at: AT }).patch.automation_paused).toBe(false);
    expect(applyTakeoverAction({ thread: THREAD, action: "ESCALATE", actor: "f", at: AT }).patch.operational_status).toBe("ESCALATED");
    expect(applyTakeoverAction({ thread: THREAD, action: "CLOSE_THREAD", actor: "f", at: AT }).patch.status).toBe("closed");
    const unknown = applyTakeoverAction({ thread: THREAD, action: "DELETE_EVERYTHING", actor: "f", at: AT });
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toBe("unsupported_takeover_action");
  });
});
