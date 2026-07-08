/**
 * Tests for verificationStatus.js (Chunk 6 helper).
 *
 * Pure, read-only, no side effects. Verifies the 4 canonical cases:
 *   1. Estimated (classic wizard result)
 *   2. Verified · high        (Stripe bridge, 3 months of data)
 *   3. Verified · provisional (Stripe bridge, partial data)
 *   4. Mixed                  (payments verified, shipping/saas estimated)
 *
 * Plus edge cases:
 *   • Empty scope + verified status → falls back to estimated (defensive).
 *   • Missing assumptions → defaults sensibly.
 *   • Assumption line variants (with count, without count).
 */

import { describe, it, expect } from "vitest";
import { getVerificationStatus, __test } from "./verificationStatus";

const VERIFIED_HIGH_ROW = {
  id: "res-high",
  verification_status: "verified",
  verification_scope: ["payments", "shipping", "saas"],
  source_integration_id: "int-stripe",
  assumptions: [
    "Rate = sum(fee)/sum(amount) on successful charges.",
    "data_confidence: high (67 active day(s), 412 charges).",
  ],
};

const VERIFIED_PROVISIONAL_PAYMENTS_ONLY = {
  id: "res-prov",
  verification_status: "verified",
  verification_scope: ["payments"],
  source_integration_id: "int-stripe",
  assumptions: [
    "data_confidence: provisional (14 active day(s), 63 charges).",
  ],
};

const ESTIMATED_ROW = {
  id: "res-est",
  verification_status: "estimated",
  verification_scope: [],
  source_integration_id: null,
  assumptions: [],
};

describe("getVerificationStatus", () => {
  it("returns estimated for a classic wizard row (no verification_scope)", () => {
    const v = getVerificationStatus(ESTIMATED_ROW);
    expect(v.overall).toBe("estimated");
    expect(v.data_confidence).toBeNull();
    expect(v.verticals.payments.status).toBe("estimated");
    expect(v.verticals.shipping.status).toBe("estimated");
    expect(v.verticals.saas.status).toBe("estimated");
    expect(v.verified_verticals).toEqual([]);
    expect(v.estimated_verticals).toEqual(["payments", "shipping", "saas"]);
  });

  it("returns verified · high when all 3 verticals in scope + high confidence", () => {
    const v = getVerificationStatus(VERIFIED_HIGH_ROW);
    expect(v.overall).toBe("verified");
    expect(v.data_confidence).toBe("high");
    expect(v.active_days).toBe(67);
    expect(v.charge_count).toBe(412);
    expect(v.verticals.payments.status).toBe("verified");
    expect(v.verticals.payments.confidence).toBe("high");
    expect(v.verticals.payments.source).toBe("stripe");
  });

  it("returns mixed when payments is verified but shipping/saas are not", () => {
    const v = getVerificationStatus(VERIFIED_PROVISIONAL_PAYMENTS_ONLY);
    expect(v.overall).toBe("mixed");
    expect(v.data_confidence).toBe("provisional");
    expect(v.verticals.payments.status).toBe("verified");
    expect(v.verticals.payments.confidence).toBe("provisional");
    expect(v.verticals.shipping.status).toBe("estimated");
    expect(v.verticals.saas.status).toBe("estimated");
    expect(v.verified_verticals).toEqual(["payments"]);
    expect(v.estimated_verticals).toEqual(["shipping", "saas"]);
  });

  it("falls back to estimated when verification_status='verified' but scope is empty", () => {
    const v = getVerificationStatus({
      verification_status: "verified",
      verification_scope: [],
      assumptions: ["data_confidence: high (30 active day(s), 100 charges)."],
    });
    // No vertical is in scope → each vertical stays estimated → overall is estimated.
    // This is the defensive behavior for corrupt/legacy rows.
    expect(v.overall).toBe("estimated");
    expect(v.verticals.payments.status).toBe("estimated");
  });

  it("still returns overall verified when 3/3 in scope even if confidence missing", () => {
    const v = getVerificationStatus({
      verification_status: "verified",
      verification_scope: ["payments", "shipping", "saas"],
      source_integration_id: "int-x",
      assumptions: [],
    });
    expect(v.overall).toBe("verified");
    expect(v.data_confidence).toBeNull();
    // Defaults to "high" so the emerald pill still renders for downstream callers.
    expect(v.verticals.payments.confidence).toBe("high");
  });

  it("propagates data_source from analyzerInput when provided", () => {
    const v = getVerificationStatus(VERIFIED_HIGH_ROW, { data_source: "api" });
    expect(v.data_source).toBe("api");
  });

  it("handles a completely missing result gracefully", () => {
    const v = getVerificationStatus(null);
    expect(v.overall).toBe("estimated");
    expect(v.verticals.payments.status).toBe("estimated");
    expect(v.verticals.shipping.status).toBe("estimated");
    expect(v.verticals.saas.status).toBe("estimated");
  });
});

describe("extractConfidenceFromAssumptions (regex parser)", () => {
  const { extractConfidenceFromAssumptions } = __test;

  it("parses the canonical line 5A writes", () => {
    const r = extractConfidenceFromAssumptions([
      "some other note",
      "data_confidence: high (67 active day(s), 412 charges).",
    ]);
    expect(r.confidence).toBe("high");
    expect(r.activeDays).toBe(67);
    expect(r.chargeCount).toBe(412);
  });

  it("handles singular 'day' and 'charge' (charge_count === 1)", () => {
    const r = extractConfidenceFromAssumptions([
      "data_confidence: insufficient (1 active day(s), 1 charge).",
    ]);
    expect(r.confidence).toBe("insufficient");
    expect(r.activeDays).toBe(1);
    expect(r.chargeCount).toBe(1);
  });

  it("softly matches the label when parenthetical is missing", () => {
    const r = extractConfidenceFromAssumptions([
      "data_confidence: provisional",
    ]);
    expect(r.confidence).toBe("provisional");
    expect(r.activeDays).toBeNull();
    expect(r.chargeCount).toBeNull();
  });

  it("returns nulls when no matching line exists", () => {
    const r = extractConfidenceFromAssumptions([
      "just some methodology note",
      "another assumption",
    ]);
    expect(r.confidence).toBeNull();
  });

  it("handles a null/undefined assumptions array without crashing", () => {
    expect(extractConfidenceFromAssumptions(null).confidence).toBeNull();
    expect(extractConfidenceFromAssumptions(undefined).confidence).toBeNull();
  });
});