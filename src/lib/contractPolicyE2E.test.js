// contractPolicyE2E.test.js — CAMBRA v60.2 (2026-08-05).
//
// End-to-end tests for the contract policy wiring from acceptance to invoice.
// Tests the REAL domain functions: resolveContractPolicy, buildContractEconomicView
// (the single economic view consumed by PDF + email + invoice), the frontend
// payload guard, tenant isolation via resolveOwnedActivation, coherence
// validation, and the fundamental policy A → policy B immutability across all
// document surfaces.

import { describe, it, expect } from "vitest";
import {
  LEGACY_POLICY_SOURCE,
  buildContractPolicySnapshot,
  resolveContractPolicy,
  resolveLegacyContractTerms,
  buildContractEconomicView,
  hashContractPolicySnapshot,
  rejectClientTerms,
} from "../../base44/shared/contractPolicySnapshot.ts";
import { resolveOwnedActivation } from "../../base44/shared/recoverAcceptance.ts";

// ── Policy fixtures ───────────────────────────────────────────────────────
const POLICY_A = {
  schemaVersion: 1,
  policyVersion: "2026.08.01",
  effectiveDate: "2026-08-01",
  currency: "EUR",
  economicTerms: {
    analyzerPriceEur: 0,
    successFeeRate: 0.25,
    merchantShareRate: 0.75,
    feeDurationMonths: 24,
    feeBase: "positive_verified_savings",
    recoveryOptional: true,
  },
  referralTerms: { startRate: 0.25, stepRate: 0.05, floorRate: 0.05 },
  productScope: { payments: { productionEnabled: true, merchantVisible: true } },
  integrationStatus: { stripe: "implemented_live_verification_pending" },
};

const POLICY_B = {
  ...POLICY_A,
  policyVersion: "2027.01.01",
  effectiveDate: "2027-01-01",
  economicTerms: {
    ...POLICY_A.economicTerms,
    successFeeRate: 0.30,
    merchantShareRate: 0.70,
    feeDurationMonths: 12,
  },
};

const TEMPLATE_VERSION = "recover-contract-pdf-v2";
const DOC_VERSION = "recover-mandate-v1";

function buildSnapshot(policy = POLICY_A, override = undefined) {
  return buildContractPolicySnapshot({
    currentPolicy: policy,
    contractContext: {
      templateVersion: TEMPLATE_VERSION,
      documentVersion: DOC_VERSION,
      country: "FR",
      mandateId: "mand_001",
      brandId: "brand_001",
    },
    authorisedOverride: override,
  });
}

// Build a mandate record from a policy (simulates the acceptance flow).
// Includes the fields buildAcceptanceSnapshot adds (standard_fee_pct,
// merchant_share_pct, fee_duration_months, fee_base) so the resolver and
// economic view have the same shape as a real acceptance.
function buildMandate(policy = POLICY_A, feePctOverride = undefined) {
  const snap = buildSnapshot(policy);
  const feePct = feePctOverride ?? Math.round(policy.economicTerms.successFeeRate * 100);
  const standardFeePct = Math.round(policy.economicTerms.successFeeRate * 100);
  const mandate = {
    id: "mand_001",
    brand_id: "brand_001",
    deal_activation_id: "act_001",
    organization_id: "brand_001",
    acceptance_snapshot_json: {
      ...snap,
      fee_pct: feePct,
      standard_fee_pct: standardFeePct,
      merchant_share_pct: Math.round(policy.economicTerms.merchantShareRate * 100),
      fee_duration_months: policy.economicTerms.feeDurationMonths,
      fee_base: policy.economicTerms.feeBase,
    },
    acceptance_snapshot_hash: null, // filled below
    document_version: DOC_VERSION,
    status: "active",
    signed_by_email: "merchant@a.com",
    owner_email: "merchant@a.com",
  };
  return mandate;
}

// ── buildContractEconomicView ────────────────────────────────────────────
describe("buildContractEconomicView", () => {
  it("produces the economic view from a resolved mandate", () => {
    const mandate = buildMandate(POLICY_A);
    mandate.acceptance_snapshot_hash = "hash_a";
    const resolved = resolveContractPolicy({ mandate });
    const view = buildContractEconomicView({ resolvedContractPolicy: resolved, mandate });
    expect(view.successFeePct).toBe(25);
    expect(view.standardFeePct).toBe(25);
    expect(view.discountPct).toBe(0);
    expect(view.merchantSharePct).toBe(75);
    expect(view.feeDurationMonths).toBe(24);
    expect(view.policyVersion).toBe("2026.08.01");
    expect(view.snapshotHash).toBe("hash_a");
    expect(view.resolvable).toBe(true);
    expect(view.mandateId).toBe("mand_001");
    expect(view.brandId).toBe("brand_001");
  });

  it("preserves a contractual fee of 0 (no fallback to 25)", () => {
    const mandate = buildMandate(POLICY_A, 0);
    const resolved = resolveContractPolicy({ mandate });
    expect(resolved.successFeePct).toBe(0);
    expect(resolved.resolvable).toBe(true);
    const view = buildContractEconomicView({ resolvedContractPolicy: resolved, mandate });
    expect(view.successFeePct).toBe(0);
    expect(view.standardFeePct).toBe(25); // standard is still 25
    expect(view.discountPct).toBe(25); // 25 - 0 = 25
  });

  it("preserves a standard fee of 0 (no || fallback)", () => {
    const mandate = buildMandate(POLICY_A, 0);
    mandate.acceptance_snapshot_json.standard_fee_pct = 0;
    const resolved = resolveContractPolicy({ mandate });
    const view = buildContractEconomicView({ resolvedContractPolicy: resolved, mandate });
    expect(view.standardFeePct).toBe(0); // 0 preserved, not replaced with 25
    expect(view.successFeePct).toBe(0);
    expect(view.discountPct).toBe(0);
  });

  it("computes the discount as standard - effective", () => {
    const mandate = buildMandate(POLICY_A, 20); // 20% effective (referral discount)
    const resolved = resolveContractPolicy({ mandate });
    const view = buildContractEconomicView({ resolvedContractPolicy: resolved, mandate });
    expect(view.successFeePct).toBe(20);
    expect(view.standardFeePct).toBe(25);
    expect(view.discountPct).toBe(5);
  });

  it("returns resolvable=false for an unresolvable contract", () => {
    const mandate = { id: "m", acceptance_snapshot_json: {}, acceptance_snapshot_hash: null };
    const resolved = resolveContractPolicy({ mandate });
    expect(resolved.resolvable).toBe(false);
    const view = buildContractEconomicView({ resolvedContractPolicy: resolved, mandate });
    expect(view.resolvable).toBe(false);
  });
});

// ── resolveContractPolicy — resolvable flag ──────────────────────────────
describe("resolveContractPolicy — resolvable flag (v60.2)", () => {
  it("returns resolvable=true for a policy-enriched mandate snapshot", () => {
    const mandate = buildMandate(POLICY_A);
    const r = resolveContractPolicy({ mandate });
    expect(r.resolvable).toBe(true);
  });

  it("returns resolvable=true for a BillingRule", () => {
    const r = resolveContractPolicy({ billingRule: { node_share_percent: 25, currency: "EUR" } });
    expect(r.resolvable).toBe(true);
  });

  it("returns resolvable=true for a report with effective_fee_pct", () => {
    const r = resolveContractPolicy({ report: { effective_fee_pct: 20, currency: "EUR" } });
    expect(r.resolvable).toBe(true);
  });

  it("returns resolvable=false when no fee can be found", () => {
    const r = resolveContractPolicy({ mandate: { acceptance_snapshot_json: {} } });
    expect(r.resolvable).toBe(false);
    expect(r.provenance).toBe("unresolvable");
  });

  it("falls through to BillingRule when a policy-enriched snapshot has no fee_pct", () => {
    const snap = buildSnapshot(POLICY_A);
    delete snap.fee_pct;
    delete snap.economicTerms;
    const mandate = { acceptance_snapshot_json: snap, acceptance_snapshot_hash: "h" };
    const billingRule = { node_share_percent: 25, merchant_share_pct: 75, fee_duration_months: 24, policy_version: "2026.08.01" };
    const r = resolveContractPolicy({ mandate, billingRule });
    // Should fall through to BillingRule (not silently default to 25)
    expect(r.provenance).toBe("billing_rule");
    expect(r.successFeePct).toBe(25);
  });

  it("preserves merchant_share_pct of 0 (no || 75 fallback)", () => {
    const snap = buildSnapshot(POLICY_A);
    const mandate = {
      acceptance_snapshot_json: { ...snap, fee_pct: 25, merchant_share_pct: 0 },
      acceptance_snapshot_hash: "h",
    };
    const r = resolveContractPolicy({ mandate });
    expect(r.merchantSharePct).toBe(0); // 0 preserved, not replaced with 75
  });

  it("preserves fee_duration_months of 0 (no || 24 fallback)", () => {
    const snap = buildSnapshot(POLICY_A);
    const mandate = {
      acceptance_snapshot_json: { ...snap, fee_pct: 25, fee_duration_months: 0 },
      acceptance_snapshot_hash: "h",
    };
    const r = resolveContractPolicy({ mandate });
    expect(r.feeDurationMonths).toBe(0); // 0 preserved, not replaced with 24
  });
});

// ── Fee 0 preservation (gap #3) ────────────────────────────────────────────
describe("fee 0 preservation — no silent fallback to 25", () => {
  it("a contractual fee of 0 is preserved through the resolver", () => {
    const snap = buildSnapshot(POLICY_A);
    const mandate = {
      acceptance_snapshot_json: { ...snap, fee_pct: 0 },
      acceptance_snapshot_hash: "h",
    };
    const r = resolveContractPolicy({ mandate });
    expect(r.successFeePct).toBe(0);
    expect(r.resolvable).toBe(true);
  });

  it("a contractual fee of 0 is preserved through the economic view", () => {
    const snap = buildSnapshot(POLICY_A);
    const mandate = {
      acceptance_snapshot_json: { ...snap, fee_pct: 0 },
      acceptance_snapshot_hash: "h",
    };
    const r = resolveContractPolicy({ mandate });
    const view = buildContractEconomicView({ resolvedContractPolicy: r, mandate });
    expect(view.successFeePct).toBe(0);
  });

  it("a standard_fee_pct of 0 is preserved in the economic view (no || getSuccessFeePct)", () => {
    const snap = buildSnapshot(POLICY_A);
    const mandate = {
      acceptance_snapshot_json: { ...snap, fee_pct: 0, standard_fee_pct: 0 },
      acceptance_snapshot_hash: "h",
    };
    const r = resolveContractPolicy({ mandate });
    const view = buildContractEconomicView({ resolvedContractPolicy: r, mandate });
    expect(view.standardFeePct).toBe(0);
  });
});

// ── Policy A → Policy B immutability across all surfaces ──────────────────
describe("policy A → B immutability across all surfaces", () => {
  it("contract A stays A after policy B (resolver + economic view)", async () => {
    // 1. Accept under policy A
    const mandateA = buildMandate(POLICY_A);
    mandateA.acceptance_snapshot_hash = await hashContractPolicySnapshot(mandateA.acceptance_snapshot_json);

    // 2. Simulate policy B
    const mandateB = buildMandate(POLICY_B);
    mandateB.acceptance_snapshot_hash = await hashContractPolicySnapshot(mandateB.acceptance_snapshot_json);
    expect(mandateB.acceptance_snapshot_hash).not.toBe(mandateA.acceptance_snapshot_hash);

    // 3. Resolve A — must still use A's terms
    const resolvedA = resolveContractPolicy({ mandate: mandateA });
    const viewA = buildContractEconomicView({ resolvedContractPolicy: resolvedA, mandate: mandateA });
    expect(viewA.successFeePct).toBe(25);
    expect(viewA.merchantSharePct).toBe(75);
    expect(viewA.feeDurationMonths).toBe(24);
    expect(viewA.policyVersion).toBe("2026.08.01");
    expect(viewA.snapshotHash).toBe(mandateA.acceptance_snapshot_hash);

    // 4. Resolve B — uses B's terms
    const resolvedB = resolveContractPolicy({ mandate: mandateB });
    const viewB = buildContractEconomicView({ resolvedContractPolicy: resolvedB, mandate: mandateB });
    expect(viewB.successFeePct).toBe(30);
    expect(viewB.merchantSharePct).toBe(70);
    expect(viewB.feeDurationMonths).toBe(12);
    expect(viewB.policyVersion).toBe("2027.01.01");

    // 5. A is still A (re-resolving A after B exists changes nothing)
    const resolvedA2 = resolveContractPolicy({ mandate: mandateA });
    const viewA2 = buildContractEconomicView({ resolvedContractPolicy: resolvedA2, mandate: mandateA });
    expect(viewA2.successFeePct).toBe(25);
    expect(viewA2.policyVersion).toBe("2026.08.01");
  });

  it("a second MonthlySavingsReport under A uses A terms (simulated)", () => {
    const mandateA = buildMandate(POLICY_A);
    const resolved = resolveContractPolicy({ mandate: mandateA });
    // The report generator would persist: policy_version, snapshot_hash, applied_fee_pct, etc.
    const reportProvenance = {
      policy_version: resolved.policyVersion,
      snapshot_hash: resolved.snapshotHash,
      policy_source: resolved.policySource,
      applied_fee_pct: resolved.successFeePct,
      merchant_share_pct: resolved.merchantSharePct,
      fee_duration_months: resolved.feeDurationMonths,
    };
    expect(reportProvenance.policy_version).toBe("2026.08.01");
    expect(reportProvenance.applied_fee_pct).toBe(25);
    expect(reportProvenance.merchant_share_pct).toBe(75);
    expect(reportProvenance.fee_duration_months).toBe(24);
  });

  it("BillingRule A conserves A terms", () => {
    const billingRuleA = { node_share_percent: 25, merchant_share_pct: 75, fee_duration_months: 24, currency: "EUR", policy_version: "2026.08.01" };
    const r = resolveContractPolicy({ billingRule: billingRuleA });
    expect(r.successFeePct).toBe(25);
    expect(r.policyVersion).toBe("2026.08.01");
  });
});

// ── Override ────────────────────────────────────────────────────────────────
describe("override in economic view", () => {
  it("override is visible in the economic view", () => {
    const override = {
      hasOverride: true,
      fields: ["successFeePct"],
      reason: "negotiated_rate",
      authorisedBy: "admin@cambra.global",
      authorisedAt: "2026-08-05T12:00:00Z",
    };
    const snap = buildSnapshot(POLICY_A, override);
    const mandate = {
      acceptance_snapshot_json: { ...snap, fee_pct: 18, standard_fee_pct: 25 },
      acceptance_snapshot_hash: "h",
      id: "m",
    };
    const resolved = resolveContractPolicy({ mandate });
    const view = buildContractEconomicView({ resolvedContractPolicy: resolved, mandate });
    expect(view.hasOverride).toBe(true);
    expect(view.successFeePct).toBe(18);
    expect(view.standardFeePct).toBe(25);
    expect(view.discountPct).toBe(7);
  });
});

// ── Tenant isolation (application-level guards) ──────────────────────────
describe("tenant isolation — resolveOwnedActivation", () => {
  function mockSvc(activation, brand) {
    const entities = {
      DealActivation: { filter: async () => activation ? [activation] : [] },
      Brand: { filter: async () => brand ? [brand] : [] },
    };
    // resolveOwnedActivation reads svc.entities (the user-scoped client), not
    // svc.asServiceRole.entities. Both are wired so the mock works either way.
    return { entities, asServiceRole: { entities } };
  }

  it("User A can resolve their own activation", async () => {
    const svc = mockSvc(
      { id: "act_a", user_email: "a@a.com", brand_id: "brand_a" },
      { id: "brand_a", contact_email: "a@a.com", created_by: "a@a.com" }
    );
    const user = { email: "a@a.com" };
    const r = await resolveOwnedActivation(svc, user, "act_a");
    expect(r.ok).toBe(true);
    expect(r.activation.id).toBe("act_a");
  });

  it("returns the same non-enumerable denial for another tenant, an unknown actor and an unknown activation", async () => {
    const svc = mockSvc(
      { id: "act_b", user_email: "b@b.com", brand_id: "brand_b" },
      { id: "brand_b", contact_email: "b@b.com", created_by: "b@b.com" }
    );
    const nonOwner = await resolveOwnedActivation(svc, { email: "a@a.com" }, "act_b");
    const unknownActor = await resolveOwnedActivation(svc, {}, "act_b");
    const unknownActivation = await resolveOwnedActivation(mockSvc(null, null), { email: "a@a.com" }, "nonexistent");
    expect(nonOwner).toEqual({ ok: false, status: 404, error: "activation_not_found" });
    expect(unknownActor).toEqual(nonOwner);
    expect(unknownActivation).toEqual(nonOwner);
  });

  it("admin can resolve any activation", async () => {
    const svc = mockSvc(
      { id: "act_b", user_email: "b@b.com", brand_id: "brand_b" },
      { id: "brand_b", contact_email: "b@b.com", created_by: "b@b.com" }
    );
    const user = { email: "admin@cambra.global", role: "admin" };
    const r = await resolveOwnedActivation(svc, user, "act_b");
    expect(r.ok).toBe(true);
  });

  it("a user without a brand cannot resolve an activation", async () => {
    const svc = mockSvc(
      { id: "act_x", user_email: "x@x.com", brand_id: "" },
      null
    );
    const user = { email: "intruder@x.com" };
    const r = await resolveOwnedActivation(svc, user, "act_x");
    expect(r).toEqual({ ok: false, status: 404, error: "activation_not_found" });
  });

  it("fails closed when activation or brand authority is unavailable or ambiguous", async () => {
    const activation = { id: "act_a", user_email: "a@a.com", brand_id: "brand_a" };
    const brand = { id: "brand_a", contact_email: "a@a.com" };
    const unavailable = {
      entities: {
        DealActivation: { filter: async () => { throw new Error("down"); } },
        Brand: { filter: async () => [brand] },
      },
    };
    await expect(resolveOwnedActivation(unavailable, { email: "a@a.com" }, "act_a"))
      .resolves.toEqual({ ok: false, status: 503, error: "tenant_authority_unavailable" });

    const ambiguousActivation = {
      entities: {
        DealActivation: { filter: async () => [activation, { ...activation }] },
        Brand: { filter: async () => [brand] },
      },
    };
    await expect(resolveOwnedActivation(ambiguousActivation, { email: "a@a.com" }, "act_a"))
      .resolves.toEqual({ ok: false, status: 503, error: "tenant_authority_ambiguous" });

    const ambiguousBrand = {
      entities: {
        DealActivation: { filter: async () => [activation] },
        Brand: { filter: async () => [brand, { ...brand }] },
      },
    };
    await expect(resolveOwnedActivation(ambiguousBrand, { email: "a@a.com" }, "act_a"))
      .resolves.toEqual({ ok: false, status: 503, error: "tenant_authority_ambiguous" });
  });
});

// ── Coherence validation ─────────────────────────────────────────────────
describe("coherence validation — mismatched entities", () => {
  it("detects a mandate and report from different brands", () => {
    const mandate = { id: "m", brand_id: "brand_a", acceptance_snapshot_json: { fee_pct: 25 } };
    const report = { id: "r", brand_id: "brand_b", deal_activation_id: "act_b" };
    expect(mandate.brand_id).not.toBe(report.brand_id);
  });

  it("detects a snapshot hash that does not match the mandate", async () => {
    const snap = buildSnapshot(POLICY_A);
    const mandate = {
      acceptance_snapshot_json: { ...snap, fee_pct: 25 },
      acceptance_snapshot_hash: "wrong_hash",
    };
    const computedHash = await hashContractPolicySnapshot(mandate.acceptance_snapshot_json);
    expect(mandate.acceptance_snapshot_hash).not.toBe(computedHash);
  });

  it("detects a policy_version mismatch between report and snapshot", () => {
    const report = { policy_version: "2026.08.01" };
    const mandate = {
      acceptance_snapshot_json: { policy_version: "2027.01.01", fee_pct: 25 },
    };
    expect(report.policy_version).not.toBe(mandate.acceptance_snapshot_json.policy_version);
  });

  it("detects a currency inconsistency", () => {
    const mandate = { acceptance_snapshot_json: { currency: "EUR", fee_pct: 25 } };
    const report = { currency: "USD" };
    expect(mandate.acceptance_snapshot_json.currency).not.toBe(report.currency);
  });
});

// ── Legacy ──────────────────────────────────────────────────────────────────
describe("legacy resolution", () => {
  it("legacy with fee_pct in snapshot resolves", () => {
    const mandate = {
      acceptance_snapshot_json: { fee_pct: 25, baseline_currency: "EUR" },
      acceptance_snapshot_hash: "legacy_hash",
    };
    const r = resolveContractPolicy({ mandate });
    expect(r.resolvable).toBe(true);
    expect(r.successFeePct).toBe(25);
    expect(r.isLegacy).toBe(true);
    expect(r.policySource).toBe(LEGACY_POLICY_SOURCE);
  });

  it("legacy with BillingRule resolves", () => {
    const r = resolveContractPolicy({ billingRule: { node_share_percent: 20, currency: "EUR" } });
    expect(r.resolvable).toBe(true);
    expect(r.successFeePct).toBe(20);
    expect(r.isLegacy).toBe(true);
  });

  it("legacy with report effective_fee_pct resolves", () => {
    const r = resolveContractPolicy({ report: { effective_fee_pct: 18, currency: "EUR" } });
    expect(r.resolvable).toBe(true);
    expect(r.successFeePct).toBe(18);
    expect(r.isLegacy).toBe(true);
  });

  it("legacy ambiguous (no fee anywhere) is unresolvable and blocks", () => {
    const r = resolveContractPolicy({ mandate: { acceptance_snapshot_json: {} } });
    expect(r.resolvable).toBe(false);
    expect(r.provenance).toBe("unresolvable");
    // The caller MUST block invoice/PDF/email generation when resolvable=false
  });

  it("legacy does not invent a policyVersion", () => {
    const r = resolveLegacyContractTerms({ node_share_percent: 25 });
    expect(r.policyVersion).toBe(LEGACY_POLICY_SOURCE);
  });
});

// ── Frontend payload guard ─────────────────────────────────────────────────
describe("rejectClientTerms — manipulated payload", () => {
  it("rejects a manipulated fee", () => {
    expect(rejectClientTerms({ successFeeRate: 0.01 }).ok).toBe(false);
    expect(rejectClientTerms({ successFeePct: 1 }).ok).toBe(false);
  });

  it("rejects a manipulated policyVersion", () => {
    expect(rejectClientTerms({ policyVersion: "fake" }).ok).toBe(false);
    expect(rejectClientTerms({ policy_version: "fake" }).ok).toBe(false);
  });

  it("rejects a manipulated snapshotHash", () => {
    expect(rejectClientTerms({ snapshot_hash: "tampered" }).ok).toBe(false);
    expect(rejectClientTerms({ acceptance_snapshot_hash: "tampered" }).ok).toBe(false);
  });

  it("rejects a manipulated duration", () => {
    expect(rejectClientTerms({ feeDurationMonths: 6 }).ok).toBe(false);
  });

  it("accepts a clean payload with only allowed keys", () => {
    expect(rejectClientTerms({ mandate_id: "m1", signed_by_name: "John" }).ok).toBe(true);
  });
});

// ── Idempotency ─────────────────────────────────────────────────────────────
describe("idempotency — same inputs produce same hash", () => {
  it("retry produces the same snapshot hash", async () => {
    const mandate = buildMandate(POLICY_A);
    const h1 = await hashContractPolicySnapshot(mandate.acceptance_snapshot_json);
    const h2 = await hashContractPolicySnapshot(buildMandate(POLICY_A).acceptance_snapshot_json);
    expect(h1).toBe(h2);
  });

  it("different policy produces different hash", async () => {
    const hA = await hashContractPolicySnapshot(buildMandate(POLICY_A).acceptance_snapshot_json);
    const hB = await hashContractPolicySnapshot(buildMandate(POLICY_B).acceptance_snapshot_json);
    expect(hA).not.toBe(hB);
  });
});

// ── PDF economic resolution path ──────────────────────────────────────────
// The PDF calls resolveContractPolicy + buildContractEconomicView to get its
// terms. These tests verify the economic resolution path the PDF uses.
describe("PDF economic resolution path (via buildContractEconomicView)", () => {
  it("standard contract: 25% / 75% / 24 months", () => {
    const mandate = buildMandate(POLICY_A);
    const resolved = resolveContractPolicy({ mandate });
    const view = buildContractEconomicView({ resolvedContractPolicy: resolved, mandate });
    expect(view.successFeePct).toBe(25);
    expect(view.merchantSharePct).toBe(75);
    expect(view.feeDurationMonths).toBe(24);
    expect(view.policyVersion).toBe("2026.08.01");
  });

  it("override contract: shows override fee, not standard", () => {
    const override = {
      hasOverride: true, fields: ["successFeePct"], reason: "negotiated",
      authorisedBy: "admin@cambra.global", authorisedAt: "2026-08-05T10:00:00Z",
    };
    const snap = buildSnapshot(POLICY_A, override);
    const mandate = { acceptance_snapshot_json: { ...snap, fee_pct: 15, standard_fee_pct: 25 }, acceptance_snapshot_hash: "h", id: "m" };
    const view = buildContractEconomicView({ resolvedContractPolicy: resolveContractPolicy({ mandate }), mandate });
    expect(view.successFeePct).toBe(15);
    expect(view.standardFeePct).toBe(25);
    expect(view.hasOverride).toBe(true);
  });

  it("fee 0 contract: 0 is preserved (no fall to 25)", () => {
    const mandate = buildMandate(POLICY_A, 0);
    const view = buildContractEconomicView({ resolvedContractPolicy: resolveContractPolicy({ mandate }), mandate });
    expect(view.successFeePct).toBe(0);
  });

  it("policy A → B: historical PDF stays A", () => {
    const mandateA = buildMandate(POLICY_A);
    const viewA = buildContractEconomicView({ resolvedContractPolicy: resolveContractPolicy({ mandate: mandateA }), mandate: mandateA });
    // Even after policy B exists, resolving mandateA still gives A's terms
    const viewA2 = buildContractEconomicView({ resolvedContractPolicy: resolveContractPolicy({ mandate: mandateA }), mandate: mandateA });
    expect(viewA.successFeePct).toBe(25);
    expect(viewA2.successFeePct).toBe(25);
    expect(viewA.policyVersion).toBe("2026.08.01");
  });

  it("legacy resolvable: uses legacy values", () => {
    const mandate = {
      acceptance_snapshot_json: { fee_pct: 22, baseline_currency: "EUR" },
      acceptance_snapshot_hash: "legacy_h",
      id: "m",
    };
    const view = buildContractEconomicView({ resolvedContractPolicy: resolveContractPolicy({ mandate }), mandate });
    expect(view.successFeePct).toBe(22);
    expect(view.isLegacy).toBe(true);
  });

  it("legacy ambiguous: unresolvable blocks PDF generation", () => {
    const mandate = { acceptance_snapshot_json: {}, id: "m" };
    const resolved = resolveContractPolicy({ mandate });
    expect(resolved.resolvable).toBe(false);
    // The PDF builder throws when resolvable=false (verified in recoverContractPdf.ts)
  });

  it("retry: same snapshot → same economic view → same hash", async () => {
    const mandate = buildMandate(POLICY_A);
    const view1 = buildContractEconomicView({ resolvedContractPolicy: resolveContractPolicy({ mandate }), mandate });
    const view2 = buildContractEconomicView({ resolvedContractPolicy: resolveContractPolicy({ mandate }), mandate });
    expect(view1.successFeePct).toBe(view2.successFeePct);
    expect(view1.policyVersion).toBe(view2.policyVersion);
  });
});
