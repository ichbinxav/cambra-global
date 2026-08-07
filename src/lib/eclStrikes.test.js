// v62.5 — ECL P3: functional strike tests (scoped, time-boxed, withdrawable).
import { describe, it, expect } from "vitest";
import {
  STRIKE_SCOPES,
  isStrikeActive,
  countActiveStrikesByScope,
  deriveStrikeExpiry,
  buildStrikeIntent,
  scopesRequiringEscalation,
  strikeScopeForDomain,
  EclStrikeError,
} from "./eclStrikes.js";
import { ECL_POLICY } from "./generated/eclPolicy.js";

const NOW = "2026-08-07T12:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const future = "2026-12-01T00:00:00.000Z";
const past = "2026-01-01T00:00:00.000Z";

describe("isStrikeActive", () => {
  it("counts only unwithdrawn strikes with a future, READABLE expiry", () => {
    expect(isStrikeActive({ scope: "payments", expires_at: future }, NOW_MS)).toBe(true);
    expect(isStrikeActive({ scope: "payments", expires_at: past }, NOW_MS)).toBe(false);
    expect(isStrikeActive({ scope: "payments", expires_at: future, withdrawn_at: NOW }, NOW_MS)).toBe(false);
    // an unreadable expiry can never punish a merchant
    expect(isStrikeActive({ scope: "payments", expires_at: "not-a-date" }, NOW_MS)).toBe(false);
    expect(isStrikeActive({ scope: "payments" }, NOW_MS)).toBe(false);
  });
});

describe("countActiveStrikesByScope", () => {
  it("returns every declared scope with an honest zero and never cross-counts", () => {
    const counts = countActiveStrikesByScope(
      [
        { scope: "payments", expires_at: future },
        { scope: "payments", expires_at: past },
        { scope: "commerce", expires_at: future, withdrawn_at: NOW },
        { scope: "unknown_scope", expires_at: future },
      ],
      NOW_MS,
    );
    expect(counts).toEqual({ payments: 1, commerce: 0, accounting: 0 });
    expect(Object.isFrozen(counts)).toBe(true);
  });
});

describe("deriveStrikeExpiry / buildStrikeIntent", () => {
  const INPUT = {
    brandId: "brand-1",
    ownerEmail: "m@x.com",
    scope: "payments",
    reasonCode: "evidence_contradiction:same_period_metric_mismatch",
    evidenceEntityType: "statement_import",
    evidenceId: "si-1",
    correlationId: "eclp3:corr",
  };

  it("expiry comes EXACTLY from policy.strikes.windowDays, no fallback", () => {
    const exp = deriveStrikeExpiry(NOW, ECL_POLICY);
    expect(Date.parse(exp) - NOW_MS).toBe(ECL_POLICY.strikes.windowDays * 86400000);
    expect(() => deriveStrikeExpiry(NOW, {})).toThrow(/no fallback/);
  });

  it("the idempotency key is derived from the INCIDENT, never from the instant", () => {
    const a = buildStrikeIntent(INPUT, ECL_POLICY, { now: NOW });
    const b = buildStrikeIntent(INPUT, ECL_POLICY, { now: "2026-09-01T00:00:00.000Z" });
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    const other = buildStrikeIntent({ ...INPUT, correlationId: "eclp3:other" }, ECL_POLICY, { now: NOW });
    expect(other.idempotencyKey).not.toBe(a.idempotencyKey);
  });

  it("record matches the P1 EvidenceStrike schema, scoped and time-boxed", () => {
    const { record, expiresAt } = buildStrikeIntent(INPUT, ECL_POLICY, { now: NOW });
    expect(record).toMatchObject({
      brand_id: "brand-1",
      owner_email: "m@x.com",
      scope: "payments",
      reason_code: INPUT.reasonCode,
      evidence_entity_type: "statement_import",
      evidence_id: "si-1",
    });
    expect(record.expires_at).toBe(expiresAt);
    expect(record.idempotency_key).toMatch(/^eclp3:/);
  });

  it("refuses an unknown scope or a missing incident identity", () => {
    expect(() => buildStrikeIntent({ ...INPUT, scope: "global" }, ECL_POLICY, { now: NOW })).toThrow(EclStrikeError);
    expect(() => buildStrikeIntent({ ...INPUT, correlationId: "" }, ECL_POLICY, { now: NOW })).toThrow(EclStrikeError);
  });
});

describe("scopesRequiringEscalation", () => {
  it("escalates exactly the scopes at or over the policy threshold", () => {
    const t = ECL_POLICY.strikes.threshold;
    const scopes = scopesRequiringEscalation({ payments: t, commerce: t - 1, accounting: 0 }, ECL_POLICY);
    expect(scopes).toEqual(["payments"]);
    expect(() => scopesRequiringEscalation({}, {})).toThrow(/no fallback/);
  });

  it("strikeScopeForDomain maps 1:1 and refuses unknown domains", () => {
    for (const s of STRIKE_SCOPES) expect(strikeScopeForDomain(s)).toBe(s);
    expect(() => strikeScopeForDomain("saas")).toThrow(EclStrikeError);
  });
});