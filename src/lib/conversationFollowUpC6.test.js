// CAMP-C6 (2026-08-16) — SLA, follow-up queue, escalation and reply drafts
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C6).
//
// The two properties that matter most: an uncomputable SLA is never reported
// as compliant, and escalation is decided from what the counterparty actually
// wrote — not from how confident the classifier was.
import { describe, expect, it } from "vitest";
import {
  buildFollowUpQueue,
  buildReplyDraftEnvelope,
  evaluateEscalation,
  evaluateThreadSla,
  FOLLOW_UP_BUCKETS,
} from "../../base44/shared/conversationFollowUp.ts";

const NOW = "2026-08-16T12:00:00.000Z";
const inMinutes = (minutes) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

describe("C6 — SLA evaluation", () => {
  it("reports ON_TIME, DUE_SOON and BREACHED against a real deadline", () => {
    expect(evaluateThreadSla({ thread: { first_response_due_at: inMinutes(600) }, now: NOW }).status).toBe("ON_TIME");
    expect(evaluateThreadSla({ thread: { first_response_due_at: inMinutes(30) }, now: NOW }).status).toBe("DUE_SOON");
    const breached = evaluateThreadSla({ thread: { first_response_due_at: inMinutes(-30) }, now: NOW });
    expect(breached.status).toBe("BREACHED");
    expect(breached.minutes_remaining).toBe(-30);
  });

  it("reports UNKNOWN — never ON_TIME — when no deadline was recorded", () => {
    const result = evaluateThreadSla({ thread: { operational_status: "NEEDS_HUMAN" }, now: NOW });
    expect(result.status).toBe("UNKNOWN");
    expect(result.reason).toBe("no_sla_deadline_recorded");
    expect(result.due_at).toBeNull();
  });

  it("reports UNKNOWN when the recorded deadline is unparseable", () => {
    const result = evaluateThreadSla({ thread: { first_response_due_at: "next tuesday" }, now: NOW });
    expect(result.status).toBe("UNKNOWN");
    expect(result.reason).toBe("unparseable_due_at");
  });

  it("reports UNKNOWN when the reference time itself is invalid", () => {
    expect(evaluateThreadSla({ thread: { first_response_due_at: inMinutes(60) }, now: "nonsense" }).status).toBe("UNKNOWN");
  });

  it("is NOT_APPLICABLE only when the ball is genuinely not with us", () => {
    expect(evaluateThreadSla({ thread: { operational_status: "WAITING_ON_COUNTERPARTY" }, now: NOW }).status).toBe("NOT_APPLICABLE");
    expect(evaluateThreadSla({ thread: { status: "closed" }, now: NOW }).status).toBe("NOT_APPLICABLE");
    expect(evaluateThreadSla({ thread: { operational_status: "COMPLETED" }, now: NOW }).status).toBe("NOT_APPLICABLE");
  });

  it("falls back to next_action_due_at when there is no first-response deadline", () => {
    const result = evaluateThreadSla({ thread: { next_action_due_at: inMinutes(-5) }, now: NOW });
    expect(result.status).toBe("BREACHED");
  });
});

describe("C6 — follow-up queue", () => {
  it("places each thread in exactly one bucket", () => {
    const threads = [
      { id: "overdue", operational_status: "NEEDS_HUMAN", first_response_due_at: inMinutes(-60) },
      { id: "due", operational_status: "NEEDS_HUMAN", first_response_due_at: inMinutes(20) },
      { id: "review", operational_status: "REVIEW_REQUIRED" },
      { id: "unclassified", operational_status: "AI_TRIAGE", last_inbound_at: NOW },
      { id: "waiting_us", operational_status: "WAITING_ON_US", classification: "MORE_INFORMATION" },
      { id: "waiting_them", operational_status: "WAITING_ON_COUNTERPARTY", classification: "NOT_NOW", last_message_at: NOW },
      { id: "stale", operational_status: "WAITING_ON_COUNTERPARTY", classification: "NOT_NOW", last_message_at: "2026-06-01T00:00:00.000Z" },
    ];
    const queue = buildFollowUpQueue({ threads, now: NOW });
    expect(queue.total).toBe(7);
    // The sum of the buckets equals the number of queued threads: no double counting.
    expect(Object.values(queue.counts).reduce((sum, value) => sum + value, 0)).toBe(7);
    const byId = Object.fromEntries(queue.rows.map((row) => [row.thread_id, row.bucket]));
    expect(byId.overdue).toBe("OVERDUE");
    expect(byId.due).toBe("DUE_TODAY");
    expect(byId.review).toBe("REVIEW_REQUIRED");
    expect(byId.unclassified).toBe("UNCLASSIFIED_REPLY");
    expect(byId.waiting_us).toBe("WAITING_ON_US");
    expect(byId.waiting_them).toBe("WAITING_ON_THEM");
    expect(byId.stale).toBe("STALE");
  });

  it("only uses buckets from the canonical list", () => {
    const queue = buildFollowUpQueue({
      threads: [{ id: "t", operational_status: "NEEDS_HUMAN", first_response_due_at: inMinutes(-1) }],
      now: NOW,
    });
    for (const row of queue.rows) expect(FOLLOW_UP_BUCKETS).toContain(row.bucket);
  });

  it("surfaces the SLA reason on a queued row so an unknown deadline is visible", () => {
    const queue = buildFollowUpQueue({
      threads: [{ id: "t", operational_status: "NEEDS_HUMAN" }],
      now: NOW,
    });
    expect(queue.rows[0].sla_status).toBe("UNKNOWN");
    expect(queue.rows[0].sla_reason).toBe("no_sla_deadline_recorded");
  });

  it("reports UNAVAILABLE without leaking rows when the source failed", () => {
    const queue = buildFollowUpQueue({ threads: [{ id: "leaked" }], now: NOW, available: false });
    expect(queue.data_status).toBe("UNAVAILABLE");
    expect(queue.rows).toEqual([]);
    expect(queue.total).toBe(0);
  });
});

describe("C6 — escalation is decided from content, not from confidence", () => {
  it("escalates a savings guarantee request even when the classification looks routine", () => {
    const result = evaluateEscalation({
      message_text: "Can you guarantee we will save money?",
      classification: "MORE_INFORMATION",
    });
    expect(result.escalation_required).toBe(true);
    expect(result.triggers.map((row) => row.trigger)).toContain("SAVINGS_GUARANTEE_REQUESTED");
    expect(result.required_authority).toBe("FOUNDER");
  });

  it("escalates contracts, exclusivity, legal action, security, privacy, complaints and billing", () => {
    const cases = [
      ["Please send the contract to sign", "CONTRACT_OR_MANDATE"],
      ["We would need exclusivity in Spain", "EXCLUSIVITY"],
      ["Our lawyer will contact you", "LEGAL_ACTION"],
      ["We had a security incident last month", "SECURITY_INCIDENT"],
      ["Please delete my data under GDPR", "PRIVACY_OR_DELETION"],
      ["This is spam, I will file a complaint", "COMPLAINT"],
      ["There is an issue with the invoice", "BILLING_DISPUTE"],
      ["What discount can you offer?", "PRICING_OR_DISCOUNT"],
    ];
    for (const [message, trigger] of cases) {
      const result = evaluateEscalation({ message_text: message });
      expect(result.escalation_required, message).toBe(true);
      expect(result.triggers.map((row) => row.trigger), message).toContain(trigger);
    }
  });

  it("escalates in Spanish and French too", () => {
    expect(evaluateEscalation({ message_text: "¿Podéis garantizar el ahorro?" }).escalation_required).toBe(true);
    expect(evaluateEscalation({ message_text: "Envoyez-moi le contrat à signer" }).escalation_required).toBe(true);
  });

  it("escalates when CAMBRA does not know the answer or sources conflict", () => {
    expect(evaluateEscalation({ message_text: "How does your pricing model work?", answer_unknown: true }).triggers
      .map((row) => row.trigger)).toContain("ANSWER_UNKNOWN");
    expect(evaluateEscalation({ message_text: "Which provider do we use?", source_conflict: true }).triggers
      .map((row) => row.trigger)).toContain("SOURCE_CONFLICT");
  });

  it("escalates on the classification alone for the five human-only categories", () => {
    for (const classification of ["LEGAL_QUESTION", "SECURITY_QUESTION", "COMPLAINT", "PROVIDER_PROPOSAL", "INVOICE_ISSUE"]) {
      const result = evaluateEscalation({ message_text: "Hello", classification });
      expect(result.escalation_required, classification).toBe(true);
    }
  });

  it("does not escalate an ordinary informational reply", () => {
    const result = evaluateEscalation({
      message_text: "Thanks, could you tell me more about how the analysis works?",
      classification: "MORE_INFORMATION",
    });
    expect(result.escalation_required).toBe(false);
    expect(result.required_authority).toBe("CAMBRA");
    expect(result.recommended_safe_response).toBeNull();
  });

  it("offers a safe response that commits to nothing when escalating", () => {
    const result = evaluateEscalation({ message_text: "We need a guarantee and a contract" });
    expect(result.recommended_safe_response).toContain("no commercial, legal or economic commitment");
  });
});

describe("C6 — reply drafts never send", () => {
  it("always reports send_performed false and surfaces the review reasons", () => {
    const envelope = buildReplyDraftEnvelope({
      draft_text: "Thanks for your reply — I will come back with detail.",
      thread: { id: "t1" },
      autonomy: { may_send_autonomously: false, blockers: ["founder_permit_unavailable"] },
      escalation: { escalation_required: true, triggers: [{ trigger: "CONTRACT_OR_MANDATE" }] },
      source_facts: ["Campaign C1 sent on 2026-08-15"],
      assumptions: ["Recipient is the finance decision maker"],
      unanswered_questions: ["What contract terms are they expecting?"],
      model: "claude",
      cost_minor: 3,
    });
    expect(envelope.send_performed).toBe(false);
    expect(envelope.external_send_performed).toBe(false);
    expect(envelope.requires_human_review).toBe(true);
    expect(envelope.review_reasons).toContain("escalation_required");
    expect(envelope.review_reasons).toContain("founder_permit_unavailable");
    expect(envelope.source_facts).toHaveLength(1);
    expect(envelope.unanswered_questions).toHaveLength(1);
  });

  it("still requires human review when autonomy is not granted, even without escalation", () => {
    const envelope = buildReplyDraftEnvelope({
      draft_text: "Sure — here is how it works.",
      thread: { id: "t1" },
      autonomy: { may_send_autonomously: false, blockers: ["policy_does_not_allow_autonomous_replies"] },
      escalation: { escalation_required: false, triggers: [] },
    });
    expect(envelope.requires_human_review).toBe(true);
    expect(envelope.review_reasons).toEqual(["policy_does_not_allow_autonomous_replies"]);
  });
});
