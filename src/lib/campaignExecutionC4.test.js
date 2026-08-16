// CAMP-C4 (2026-08-16) — behavior tests for the campaign execution engine
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C4, spec §8).
//
// The three properties under test are the ones that decide whether this system
// can ever be trusted with a real mailbox:
//   1. The immediate pre-effect gates actually stop a send when state changed.
//   2. Provider acceptance is never reported as delivery.
//   3. Post-effect ambiguity never becomes a blind retry.
import { describe, expect, it } from "vitest";
import {
  buildEffectIdentity,
  buildEnrollments,
  dryRunTransport,
  evaluatePreEffectGates,
  projectProviderEventOntoEnrollment,
  settleSendAttempt,
  TERMINAL_ENROLLMENT_STATES,
} from "../../base44/shared/campaignExecutionEngine.ts";

const FROZEN_AUDIENCE = { id: "av1", status: "FROZEN" };
const CAMPAIGN = { id: "c1", lane: "MERCHANT_ACQUISITION", objective_type: "BOOK_MEETING", status: "RUNNING" };
const MEMBERS = [
  { subject_id: "l1", subject_type: "OutboundLead", lead_id: "l1", email_normalized: "cfo@acme.example", company_key: "acme", country: "ES", company_contact_rank: 1 },
  { subject_id: "l2", subject_type: "OutboundLead", lead_id: "l2", email_normalized: "cfo@globex.example", company_key: "globex", country: "ES", company_contact_rank: 1 },
];

function healthyContext(overrides = {}) {
  return {
    campaign: CAMPAIGN,
    enrollment: {
      state: "QUEUED", email_normalized: "cfo@acme.example",
      contact_id: "c-1", company_key: "acme", campaign_id: "c1",
    },
    suppressions: [],
    suppressionsAvailable: true,
    threadHasReply: false,
    policyActive: true,
    marketEligible: true,
    sendingProfileHealthy: true,
    budgetRemainingMinor: 10_000,
    emergency: { safe_mode: false, communications_paused: false, control_revision: 7 },
    emergencyAvailable: true,
    capturedEmergencyRevision: 7,
    ...overrides,
  };
}

describe("C4 — effect identity is shared across execution paths", () => {
  it("produces the same keys for the same campaign/enrollment/step", () => {
    const manual = buildEffectIdentity({ campaign_id: "c1", enrollment_id: "e1", sequence_step: 2 });
    const scheduled = buildEffectIdentity({ campaign_id: "c1", enrollment_id: "e1", sequence_step: 2 });
    const command = buildEffectIdentity({ campaign_id: "c1", enrollment_id: "e1", sequence_step: "2" });
    expect(manual).toEqual(scheduled);
    expect(manual).toEqual(command);
  });

  it("produces different keys for a different step so step 2 cannot replay step 1", () => {
    const first = buildEffectIdentity({ campaign_id: "c1", enrollment_id: "e1", sequence_step: 1 });
    const second = buildEffectIdentity({ campaign_id: "c1", enrollment_id: "e1", sequence_step: 2 });
    expect(first.effect_key).not.toBe(second.effect_key);
  });
});

describe("C4 — enrollment creation", () => {
  it("refuses to create enrollments from an audience that is not frozen", () => {
    for (const status of ["READY", "BUILDING", "DRAFT", "REVIEW_REQUIRED", ""]) {
      const result = buildEnrollments({
        campaign: CAMPAIGN, audienceVersion: { id: "av1", status }, members: MEMBERS,
      });
      expect(result.ok, status).toBe(false);
      expect(result.error, status).toBe("audience_version_must_be_frozen");
      expect(result.enrollments, status).toEqual([]);
    }
  });

  it("creates one canonical enrollment per member with a stable key and effect identity", () => {
    const result = buildEnrollments({
      campaign: CAMPAIGN, audienceVersion: FROZEN_AUDIENCE, members: MEMBERS,
      content_version_id: "cv1", sequence_version_id: "sv1",
    });
    expect(result.ok).toBe(true);
    expect(result.enrollments).toHaveLength(2);
    const [first] = result.enrollments;
    expect(first.state).toBe("ELIGIBLE");
    expect(first.current_step).toBe(0);
    expect(first.operation_key).toContain("campaign-send:");
    expect(first.effect_key).toContain("campaign-effect:");
    expect(first.content_version_id).toBe("cv1");
    expect(first.enrollment_key).toContain("cfo@acme.example");
    // Enrollment creation contacts nobody.
    expect(first).not.toHaveProperty("provider_message_id");
  });

  it("keeps enrollment keys unique per recipient", () => {
    const result = buildEnrollments({ campaign: CAMPAIGN, audienceVersion: FROZEN_AUDIENCE, members: MEMBERS });
    const keys = new Set(result.enrollments.map((row) => row.enrollment_key));
    expect(keys.size).toBe(2);
  });
});

describe("C4 — immediate pre-effect gates (spec §8.3)", () => {
  it("allows a send only when every gate is satisfied", () => {
    const result = evaluatePreEffectGates(healthyContext());
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("STOPS the follow-up when a reply arrived between scheduling and effect", () => {
    const result = evaluatePreEffectGates(healthyContext({ threadHasReply: true }));
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("reply_received_before_effect");
  });

  it("stops when a suppression landed during the claim", () => {
    const result = evaluatePreEffectGates(healthyContext({
      suppressions: [{ email: "cfo@acme.example", active: true, reason: "opt_out" }],
    }));
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("recipient_suppressed");
  });

  it("blocks when the suppression ledger cannot be read — never sends on an unknown", () => {
    const result = evaluatePreEffectGates(healthyContext({ suppressionsAvailable: false }));
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("suppression_ledger_unavailable");
  });

  it("blocks under SAFE MODE and under a communications pause", () => {
    expect(evaluatePreEffectGates(healthyContext({
      emergency: { safe_mode: true, control_revision: 7 },
    })).blockers).toContain("emergency_pause_active");
    expect(evaluatePreEffectGates(healthyContext({
      emergency: { communications_paused: true, control_revision: 7 },
    })).blockers).toContain("emergency_pause_active");
  });

  it("blocks when the emergency epoch moved since the claim", () => {
    const result = evaluatePreEffectGates(healthyContext({
      emergency: { safe_mode: false, communications_paused: false, control_revision: 8 },
      capturedEmergencyRevision: 7,
    }));
    expect(result.blockers).toContain("emergency_epoch_changed_during_claim");
  });

  it("blocks when the emergency authority itself is unreadable", () => {
    expect(evaluatePreEffectGates(healthyContext({ emergencyAvailable: false })).blockers)
      .toContain("emergency_authority_unavailable");
  });

  it("blocks on an inactive policy, an ineligible market and a degraded profile", () => {
    expect(evaluatePreEffectGates(healthyContext({ policyActive: false })).blockers).toContain("commercial_policy_not_active");
    expect(evaluatePreEffectGates(healthyContext({ marketEligible: false })).blockers).toContain("market_not_eligible");
    expect(evaluatePreEffectGates(healthyContext({ sendingProfileHealthy: false })).blockers).toContain("sending_profile_not_healthy");
  });

  it("treats an unreadable budget as a blocker, not as headroom", () => {
    expect(evaluatePreEffectGates(healthyContext({ budgetRemainingMinor: null })).blockers).toContain("budget_unknown");
    expect(evaluatePreEffectGates(healthyContext({ budgetRemainingMinor: 0 })).blockers).toContain("budget_exhausted");
  });

  it("never sends to an enrollment already in a terminal state", () => {
    for (const state of TERMINAL_ENROLLMENT_STATES) {
      const result = evaluatePreEffectGates(healthyContext({
        enrollment: { state, email_normalized: "cfo@acme.example" },
      }));
      expect(result.allowed, state).toBe(false);
      expect(result.blockers, state).toContain("enrollment_terminal");
    }
  });

  it("blocks when the campaign itself is not in a sending state", () => {
    for (const status of ["DRAFT", "PAUSED", "STOPPED", "COMPLETED", "REVIEW_REQUIRED"]) {
      const result = evaluatePreEffectGates(healthyContext({ campaign: { ...CAMPAIGN, status } }));
      expect(result.blockers, status).toContain("campaign_not_running");
    }
  });
});

describe("C4 — settlement is conservative (spec §8.5)", () => {
  it("reports provider acceptance as PROVIDER_ACCEPTED and never as delivered", () => {
    const result = settleSendAttempt({
      transport: { effect_started: true, accepted: true, provider: "resend", provider_message_id: "m1" },
      dry_run: false,
    });
    expect(result.state).toBe("PROVIDER_ACCEPTED");
    expect(result.delivered).toBe(false);
    expect(result.delivery_evidence_required).toBe(true);
  });

  it("converges to REVIEW_REQUIRED — not a retry — when the outcome is ambiguous after the effect started", () => {
    const result = settleSendAttempt({
      transport: { effect_started: true, ambiguous: true, provider: "resend" },
      dry_run: false,
    });
    expect(result.state).toBe("REVIEW_REQUIRED");
    expect(result.retry_safe).toBe(false);
  });

  it("allows a safe retry only when the failure happened BEFORE the provider was touched", () => {
    const preEffect = settleSendAttempt({
      transport: { effect_started: false, accepted: false, error: "connection_refused" },
      dry_run: false,
    });
    expect(preEffect.material_effect_state).toBe("FAILED_PRE_EFFECT");
    expect(preEffect.retry_safe).toBe(true);
    expect(preEffect.state).toBe("QUEUED");

    const postEffect = settleSendAttempt({
      transport: { effect_started: true, accepted: false, error: "timeout_after_send" },
      dry_run: false,
    });
    expect(postEffect.material_effect_state).toBe("FAILED_POST_EFFECT");
    expect(postEffect.retry_safe).toBe(false);
    expect(postEffect.state).toBe("REVIEW_REQUIRED");
  });

  it("the dry-run transport performs no external effect and still settles honestly", () => {
    const transport = dryRunTransport();
    expect(transport.effect_started).toBe(false);
    const result = settleSendAttempt({ transport, dry_run: true });
    expect(result.external_effect_performed).toBe(false);
    expect(result.dry_run).toBe(true);
    expect(result.delivered).toBe(false);
  });
});

describe("C4 — provider events only promote what they actually observe", () => {
  it("promotes an observed delivery to DELIVERED_OBSERVED", () => {
    const result = projectProviderEventOntoEnrollment({
      current_state: "PROVIDER_ACCEPTED", normalized_event_type: "DELIVERED",
    });
    expect(result.state).toBe("DELIVERED_OBSERVED");
    expect(result.changed).toBe(true);
  });

  it("never invents a delivery from a deferral, a soft bounce or an unknown event", () => {
    for (const event of ["DEFERRED", "SOFT_BOUNCE", "ACCOUNT_ERROR", "AUTH_ERROR", "WEBHOOK_ERROR", "UNKNOWN", "SEND_REQUESTED"]) {
      const result = projectProviderEventOntoEnrollment({
        current_state: "PROVIDER_ACCEPTED", normalized_event_type: event,
      });
      expect(result.state, event).toBe("PROVIDER_ACCEPTED");
      expect(result.changed, event).toBe(false);
    }
  });

  it("maps replies, bounces, complaints and unsubscribes onto their canonical states", () => {
    const cases = [
      ["REPLY_RECEIVED", "REPLIED"],
      ["HARD_BOUNCE", "BOUNCED"],
      ["COMPLAINT", "COMPLAINT"],
      ["UNSUBSCRIBE", "UNSUBSCRIBED"],
      ["OPENED", "OPEN_OBSERVED"],
      ["CLICKED", "CLICK_OBSERVED"],
    ];
    for (const [event, expected] of cases) {
      expect(projectProviderEventOntoEnrollment({ current_state: "DELIVERED_OBSERVED", normalized_event_type: event }).state, event)
        .toBe(expected);
    }
  });

  it("does not downgrade a booked meeting because a late open event arrived", () => {
    const result = projectProviderEventOntoEnrollment({
      current_state: "MEETING_BOOKED", normalized_event_type: "OPENED",
    });
    expect(result.state).toBe("MEETING_BOOKED");
    expect(result.reason).toBe("terminal_state_preserved");
  });

  it("still applies an unsubscribe or complaint on top of a terminal commercial state", () => {
    expect(projectProviderEventOntoEnrollment({ current_state: "MEETING_BOOKED", normalized_event_type: "UNSUBSCRIBE" }).state)
      .toBe("UNSUBSCRIBED");
    expect(projectProviderEventOntoEnrollment({ current_state: "QUALIFIED", normalized_event_type: "COMPLAINT" }).state)
      .toBe("COMPLAINT");
  });
});

describe("C4 — the follow-up race (spec §8.7)", () => {
  it("a reply observed before EFFECT_STARTED produces zero follow-up sends", () => {
    // The scheduler claimed the slot, then the reply landed. The gate must
    // refuse before anything touches a provider.
    const gates = evaluatePreEffectGates(healthyContext({ threadHasReply: true }));
    expect(gates.allowed).toBe(false);
    // Because the gate refused, no transport call happens at all.
    let transportCalls = 0;
    if (gates.allowed) { transportCalls += 1; }
    expect(transportCalls).toBe(0);
  });

  it("a reply that lands AFTER the provider effect keeps both facts and stops the next step", () => {
    // The send already happened: it settles honestly as accepted...
    const settled = settleSendAttempt({
      transport: { effect_started: true, accepted: true, provider: "resend", provider_message_id: "m1" },
      dry_run: false,
    });
    expect(settled.state).toBe("PROVIDER_ACCEPTED");
    // ...and the reply event then moves the enrollment to REPLIED.
    const afterReply = projectProviderEventOntoEnrollment({
      current_state: settled.state, normalized_event_type: "REPLY_RECEIVED",
    });
    expect(afterReply.state).toBe("REPLIED");
    // REPLIED is terminal, so the NEXT step's gate refuses.
    const nextStep = evaluatePreEffectGates(healthyContext({
      enrollment: { state: afterReply.state, email_normalized: "cfo@acme.example" },
    }));
    expect(nextStep.allowed).toBe(false);
    expect(nextStep.blockers).toContain("enrollment_terminal");
  });
});
