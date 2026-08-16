// CAMP-C7 (2026-08-16) — sender health, containment, suppressions and
// provider-event normalization (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C7).
//
// The rule under test throughout: health is evidence PLUS freshness. A stale
// green reading is UNKNOWN, never "still healthy" — treating it as healthy is
// how a degraded mailbox keeps sending.
import { describe, expect, it } from "vitest";
import {
  buildSuppressionRecord,
  evaluateSenderContainment,
  evaluateSuppressionRemoval,
  HEALTH_OBSERVATION_TTL_HOURS,
  normalizeProviderEvent,
  projectSenderHealth,
  SENDER_HEALTH_STATES,
  SUPPRESSION_CANONICAL_REASONS,
} from "../../base44/shared/senderHealthAndSuppressions.ts";

const NOW = "2026-08-16T12:00:00.000Z";
const hoursAgo = (hours) => new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();

function profile(overrides = {}) {
  return {
    profile_key: "p1", status: "active", webhook_status: "ACTIVE",
    current_daily_cap: 50, target_daily_cap: 50,
    bounce_rate_pct: 0.5, complaint_rate_pct: 0.01,
    last_provider_health_at: hoursAgo(1),
    ...overrides,
  };
}

describe("C7 — sender health requires evidence AND freshness", () => {
  it("reports HEALTHY only with a fresh, clean observation", () => {
    const health = projectSenderHealth({ profile: profile(), now: NOW });
    expect(health.health).toBe("HEALTHY");
    expect(health.can_send).toBe(true);
    expect(health.freshness_hours).toBe(1);
  });

  it("reports UNKNOWN — not HEALTHY — when the observation is stale", () => {
    const health = projectSenderHealth({
      profile: profile({ last_provider_health_at: hoursAgo(HEALTH_OBSERVATION_TTL_HOURS + 1) }),
      now: NOW,
    });
    expect(health.health).toBe("UNKNOWN");
    expect(health.reasons).toContain("health_observation_stale");
    expect(health.can_send).toBe(false);
  });

  it("reports UNKNOWN when there is no observation at all", () => {
    const health = projectSenderHealth({ profile: profile({ last_provider_health_at: null }), now: NOW });
    expect(health.health).toBe("UNKNOWN");
    expect(health.reasons).toContain("no_health_observation");
  });

  it("puts hard operational states above metrics", () => {
    for (const [status, expected] of [["blocked", "BLOCKED"], ["quarantined", "QUARANTINED"], ["paused", "PAUSED"]]) {
      // Even with perfect metrics, the operational state wins.
      const health = projectSenderHealth({ profile: profile({ status }), now: NOW });
      expect(health.health, status).toBe(expected);
      expect(health.can_send, status).toBe(false);
    }
  });

  it("reports AUTH_EXPIRED from an explicit status or an elapsed expiry", () => {
    expect(projectSenderHealth({ profile: profile({ auth_status: "expired" }), now: NOW }).health).toBe("AUTH_EXPIRED");
    expect(projectSenderHealth({ profile: profile({ auth_expires_at: hoursAgo(1) }), now: NOW }).health).toBe("AUTH_EXPIRED");
  });

  it("degrades when the webhook is not active — outcomes cannot be observed", () => {
    const health = projectSenderHealth({ profile: profile({ webhook_status: "FAILING" }), now: NOW });
    expect(health.health).toBe("DEGRADED");
    expect(health.reasons).toContain("webhook_failing");
  });

  it("degrades above the bounce and complaint pause thresholds, throttles above the slow threshold", () => {
    expect(projectSenderHealth({ profile: profile({ bounce_rate_pct: 6 }), now: NOW }).health).toBe("DEGRADED");
    expect(projectSenderHealth({ profile: profile({ complaint_rate_pct: 0.4 }), now: NOW }).health).toBe("DEGRADED");
    expect(projectSenderHealth({ profile: profile({ complaint_rate_pct: 0.15 }), now: NOW }).health).toBe("THROTTLED");
  });

  it("reports WARMING below the target cap and THROTTLED with no capacity", () => {
    expect(projectSenderHealth({ profile: profile({ current_daily_cap: 10, target_daily_cap: 50 }), now: NOW }).health).toBe("WARMING");
    expect(projectSenderHealth({ profile: profile({ current_daily_cap: 0 }), now: NOW }).health).toBe("THROTTLED");
  });

  it("only ever returns a state from the canonical list", () => {
    const cases = [profile(), profile({ status: "blocked" }), profile({ last_provider_health_at: null }), profile({ bounce_rate_pct: 99 })];
    for (const candidate of cases) {
      expect(SENDER_HEALTH_STATES).toContain(projectSenderHealth({ profile: candidate, now: NOW }).health);
    }
  });
});

describe("C7 — auto-containment pauses without destroying", () => {
  it("contains a degraded, auth-expired, blocked, quarantined or unknown profile", () => {
    for (const health of ["DEGRADED", "AUTH_EXPIRED", "BLOCKED", "QUARANTINED", "UNKNOWN"]) {
      const result = evaluateSenderContainment({
        health: { health, reasons: [] },
        emergency: { safe_mode: false }, emergencyAvailable: true,
      });
      expect(result.contain, health).toBe(true);
      expect(result.pause_new_sends, health).toBe(true);
      expect(result.incident_required, health).toBe(true);
      // Containment never deletes work.
      expect(result.campaigns_preserved, health).toBe(true);
      expect(result.enrollments_preserved, health).toBe(true);
    }
  });

  it("does not contain a healthy profile", () => {
    const result = evaluateSenderContainment({
      health: { health: "HEALTHY", reasons: [] },
      emergency: { safe_mode: false }, emergencyAvailable: true,
    });
    expect(result.contain).toBe(false);
    expect(result.incident_required).toBe(false);
  });

  it("contains on an emergency pause and on an unreadable emergency authority", () => {
    expect(evaluateSenderContainment({
      health: { health: "HEALTHY", reasons: [] },
      emergency: { safe_mode: true }, emergencyAvailable: true,
    }).contain).toBe(true);
    expect(evaluateSenderContainment({
      health: { health: "HEALTHY", reasons: [] },
      emergency: null, emergencyAvailable: false,
    }).contain).toBe(true);
  });

  it("raises a critical incident for auth/blocked/quarantined and a warning otherwise", () => {
    expect(evaluateSenderContainment({ health: { health: "AUTH_EXPIRED" }, emergency: {}, emergencyAvailable: true }).incident_severity).toBe("critical");
    expect(evaluateSenderContainment({ health: { health: "DEGRADED" }, emergency: {}, emergencyAvailable: true }).incident_severity).toBe("warning");
  });
});

describe("C7 — suppression records", () => {
  it("scopes an unsubscribe to the address and marks it permanent", () => {
    const result = buildSuppressionRecord({
      reason: "UNSUBSCRIBE", email: "Ana@Acme.example", source: "inbound_reply", at: NOW, actor: "system",
    });
    expect(result.ok).toBe(true);
    expect(result.record.scope_type).toBe("EMAIL");
    expect(result.record.scope_value).toBe("ana@acme.example");
    expect(result.record.active).toBe(true);
    expect(result.record.expires_at).toBeNull();
    expect(result.permanent).toBe(true);
    // The legacy enum is preserved so existing readers keep working.
    expect(result.record.reason).toBe("opt_out");
    expect(result.record.canonical_reason).toBe("UNSUBSCRIBE");
  });

  it("does NOT blacklist the company when a contact is the wrong person", () => {
    const result = buildSuppressionRecord({
      reason: "WRONG_PERSON", email: "ana@acme.example", company_key: "acme", source: "reply", at: NOW,
    });
    expect(result.record.scope_type).toBe("EMAIL");
    expect(result.scope_policy_note).toContain("company stays contactable");
  });

  it("expires a temporary soft bounce and keeps everything else permanent", () => {
    const soft = buildSuppressionRecord({ reason: "SOFT_BOUNCE_TEMPORARY", email: "a@x.com", source: "webhook", at: NOW });
    expect(soft.record.expires_at).toBeTruthy();
    expect(soft.permanent).toBe(false);
    const hard = buildSuppressionRecord({ reason: "HARD_BOUNCE", email: "a@x.com", source: "webhook", at: NOW });
    expect(hard.record.expires_at).toBeNull();
    expect(hard.permanent).toBe(true);
  });

  it("uses a company scope for a company block and a domain scope for a domain block", () => {
    expect(buildSuppressionRecord({ reason: "COMPANY_BLOCK", company_key: "acme", source: "founder", at: NOW }).record.scope_type).toBe("COMPANY");
    expect(buildSuppressionRecord({ reason: "DOMAIN_BLOCK", domain: "acme.example", source: "founder", at: NOW }).record.scope_type).toBe("DOMAIN");
  });

  it("refuses an unsupported reason and a missing scope value", () => {
    expect(buildSuppressionRecord({ reason: "BECAUSE_I_SAID_SO", email: "a@x.com", source: "x", at: NOW }).ok).toBe(false);
    expect(buildSuppressionRecord({ reason: "UNSUBSCRIBE", source: "x", at: NOW }).ok).toBe(false);
  });

  it("supports every canonical reason", () => {
    for (const reason of SUPPRESSION_CANONICAL_REASONS) {
      const result = buildSuppressionRecord({
        reason, email: "a@x.com", company_key: "acme", domain: "x.com", source: "test", at: NOW,
      });
      expect(result.ok, reason).toBe(true);
    }
  });
});

describe("C7 — suppression removal is never automatic", () => {
  const SUPPRESSION = { scope_type: "EMAIL", scope_value: "a@x.com", canonical_reason: "NOT_INTERESTED", suppressed_at: NOW };

  it("requires an actor, an explicit reason and the confirmation token", () => {
    const result = evaluateSuppressionRemoval({ suppression: SUPPRESSION });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(["actor_required", "explicit_reason_required", "confirmation_required"]));
    expect(result.audit_required).toBe(true);
  });

  it("allows removal only with everything supplied", () => {
    const result = evaluateSuppressionRemoval({
      suppression: SUPPRESSION, actor: "founder@cambra.global",
      reason: "Contact asked to be re-added after a role change",
      confirmation: "REMOVE_SUPPRESSION",
    });
    expect(result.allowed).toBe(true);
    expect(result.preview.scope_value).toBe("a@x.com");
  });

  it("never allows lifting a complaint or a legal request through this path", () => {
    for (const canonical_reason of ["COMPLAINT", "LEGAL_REQUEST"]) {
      const result = evaluateSuppressionRemoval({
        suppression: { ...SUPPRESSION, canonical_reason }, actor: "founder@cambra.global",
        reason: "They said it was a mistake on the phone",
        confirmation: "REMOVE_SUPPRESSION",
      });
      expect(result.allowed, canonical_reason).toBe(false);
      expect(result.blockers, canonical_reason).toContain("reason_not_removable_without_legal_review");
    }
  });
});

describe("C7 — provider event normalization", () => {
  it("never processes an event whose signature is not verified", () => {
    const result = normalizeProviderEvent({ provider: "resend", raw_type: "delivered", signature_verified: false });
    expect(result.processable).toBe(false);
    expect(result.blocker).toBe("signature_not_verified");
  });

  it("normalizes the shared vocabulary across providers", () => {
    const cases = [
      ["delivered", "DELIVERED"], ["accepted", "PROVIDER_ACCEPTED"], ["deferred", "DEFERRED"],
      ["bounce", "HARD_BOUNCE"], ["soft_bounce", "SOFT_BOUNCE"], ["opened", "OPENED"],
      ["clicked", "CLICKED"], ["reply", "REPLY_RECEIVED"], ["complaint", "COMPLAINT"],
      ["unsubscribed", "UNSUBSCRIBE"], ["auth_error", "AUTH_ERROR"],
    ];
    for (const [raw, expected] of cases) {
      const result = normalizeProviderEvent({ provider: "resend", raw_type: raw, signature_verified: true });
      expect(result.normalized_event_type, raw).toBe(expected);
      expect(result.processable, raw).toBe(true);
    }
  });

  it("keeps an unrecognised event as UNKNOWN and refuses to process it", () => {
    const result = normalizeProviderEvent({ provider: "instantly", raw_type: "some_new_event", signature_verified: true });
    expect(result.normalized_event_type).toBe("UNKNOWN");
    expect(result.processable).toBe(false);
    expect(result.blocker).toBe("unknown_event_type");
  });
});
