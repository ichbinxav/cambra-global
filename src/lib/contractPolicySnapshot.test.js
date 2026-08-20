// contractPolicySnapshot.test.js — CAMBRA v60.1 (2026-08-05).
//
// Characterization + parity tests for the contract policy snapshot, resolver,
// legacy handler, hash determinism, override audit, frontend-payload guard,
// and the fundamental immutability test (policy A → policy B does not alter
// an accepted contract).

import { describe, it, expect } from "vitest";
import {
  SNAPSHOT_SCHEMA_VERSION,
  LEGACY_POLICY_SOURCE,
  POLICY_SOURCE_REGISTRY,
  buildContractPolicySnapshot,
  resolveContractPolicy,
  resolveLegacyContractTerms,
  canonicalStringify,
  hashContractPolicySnapshot,
  rejectClientTerms,
} from "../../base44/shared/contractPolicySnapshot.ts";

// ── Fixtures ─────────────────────────────────────────────────────────────
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

// ── Builder ──────────────────────────────────────────────────────────────
describe("buildContractPolicySnapshot", () => {
  it("produces a snapshot with the canonical schema version", () => {
    expect(buildSnapshot().snapshotSchemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
  });

  it("carries policyVersion and effectiveDate from the generated policy", () => {
    const s = buildSnapshot();
    expect(s.policyVersion).toBe("2026.08.01");
    expect(s.policyEffectiveDate).toBe("2026-08-01");
  });

  it("marks policySource as product_policy_registry", () => {
    expect(buildSnapshot().policySource).toBe(POLICY_SOURCE_REGISTRY);
  });

  it("stores success fee as both rate and pct", () => {
    const s = buildSnapshot();
    expect(s.economicTerms.successFeeRate).toBe(0.25);
    expect(s.economicTerms.successFeePct).toBe(25);
  });

  it("stores merchant share as both rate and pct", () => {
    const s = buildSnapshot();
    expect(s.economicTerms.merchantShareRate).toBe(0.75);
    expect(s.economicTerms.merchantSharePct).toBe(75);
  });

  it("stores the fee duration in months", () => {
    expect(buildSnapshot().economicTerms.feeDurationMonths).toBe(24);
  });

  it("stores the fee base", () => {
    expect(buildSnapshot().economicTerms.feeBase).toBe("positive_verified_savings");
  });

  it("stores the currency", () => {
    expect(buildSnapshot().currency).toBe("EUR");
  });

  it("stores template and document versions", () => {
    const s = buildSnapshot();
    expect(s.contract.templateVersion).toBe(TEMPLATE_VERSION);
    expect(s.contract.documentVersion).toBe(DOC_VERSION);
  });

  it("stores the referral ladder terms", () => {
    const s = buildSnapshot();
    expect(s.referralTerms.startRate).toBe(0.25);
    expect(s.referralTerms.stepRate).toBe(0.05);
    expect(s.referralTerms.floorRate).toBe(0.05);
  });

  it("stores the Stripe integration status at acceptance", () => {
    expect(buildSnapshot().integrationStatusAtAcceptance.stripe).toBe("implemented_live_verification_pending");
  });

  it("records contract identifiers", () => {
    const s = buildSnapshot();
    expect(s.contract.mandateId).toBe("mand_001");
    expect(s.contract.brandId).toBe("brand_001");
    expect(s.contract.country).toBe("FR");
  });

  it("defaults to no override", () => {
    const o = buildSnapshot().overrides;
    expect(o.hasOverride).toBe(false);
    expect(o.fields).toBeNull();
    expect(o.reason).toBeNull();
  });

  it("includes an authorised override when provided", () => {
    const override = {
      hasOverride: true,
      fields: ["successFeePct"],
      reason: "negotiated_rate",
      authorisedBy: "admin@cambra.global",
      authorisedAt: "2026-08-05T12:00:00Z",
    };
    const o = buildSnapshot(POLICY_A, override).overrides;
    expect(o.hasOverride).toBe(true);
    expect(o.fields).toEqual(["successFeePct"]);
    expect(o.authorisedBy).toBe("admin@cambra.global");
  });

  it("throws if the policy is missing", () => {
    expect(() => buildContractPolicySnapshot({ currentPolicy: null, contractContext: {} })).toThrow();
  });
});

// ── Resolver ────────────────────────────────────────────────────────────
describe("resolveContractPolicy", () => {
  it("resolves from a mandate snapshot with policy_version", () => {
    const snapshot = buildSnapshot();
    const mandate = {
      acceptance_snapshot_json: { ...snapshot, fee_pct: 25 },
      acceptance_snapshot_hash: "abc123",
      document_version: DOC_VERSION,
    };
    const r = resolveContractPolicy({ mandate });
    expect(r.successFeePct).toBe(25);
    expect(r.merchantSharePct).toBe(75);
    expect(r.feeDurationMonths).toBe(24);
    expect(r.policyVersion).toBe("2026.08.01");
    expect(r.policySource).toBe(POLICY_SOURCE_REGISTRY);
    expect(r.snapshotHash).toBe("abc123");
    expect(r.isLegacy).toBe(false);
    expect(r.provenance).toBe("mandate_snapshot");
  });

  it("resolves from a BillingRule with policy_version", () => {
    const r = resolveContractPolicy({ billingRule: { node_share_percent: 20, merchant_share_pct: 80, fee_duration_months: 24, currency: "EUR", policy_version: "2026.08.01" } });
    expect(r.successFeePct).toBe(20);
    expect(r.policyVersion).toBe("2026.08.01");
    expect(r.isLegacy).toBe(false);
    expect(r.provenance).toBe("billing_rule");
    expect(r.merchantSharePct).toBe(80);
    expect(r.feeDurationMonths).toBe(24);
  });

  it("fails closed for a policy BillingRule missing frozen share or duration", () => {
    const r = resolveContractPolicy({
      billingRule: {
        node_share_percent: 20,
        currency: "EUR",
        policy_version: "2026.08.01",
      },
    });
    expect(r.resolvable).toBe(false);
    expect(r.provenance).toBe("billing_rule_incomplete");
    expect(r.warnings).toEqual(expect.arrayContaining([
      "billing_rule_share_missing",
      "billing_rule_duration_missing",
    ]));
  });

  it("fails closed for a policy report missing frozen share or duration", () => {
    const r = resolveContractPolicy({
      report: {
        effective_fee_pct: 20,
        currency: "EUR",
        policy_version: "2026.08.01",
      },
    });
    expect(r.resolvable).toBe(false);
    expect(r.provenance).toBe("monthly_report_incomplete");
  });

  it("resolves from a BillingRule without policy_version as legacy", () => {
    const r = resolveContractPolicy({ billingRule: { node_share_percent: 25, currency: "EUR" } });
    expect(r.successFeePct).toBe(25);
    expect(r.isLegacy).toBe(true);
    expect(r.policySource).toBe(LEGACY_POLICY_SOURCE);
  });

  it("resolves from a MonthlySavingsReport", () => {
    const r = resolveContractPolicy({ report: { effective_fee_pct: 20, currency: "EUR" } });
    expect(r.successFeePct).toBe(20);
    expect(r.provenance).toBe("monthly_report");
    expect(r.isLegacy).toBe(true);
  });

  it("precedence: mandate snapshot wins over BillingRule", () => {
    const snapshot = buildSnapshot();
    const mandate = { acceptance_snapshot_json: { ...snapshot, fee_pct: 15 }, acceptance_snapshot_hash: "h" };
    const billingRule = { node_share_percent: 25, policy_version: "2026.08.01" };
    const r = resolveContractPolicy({ mandate, billingRule });
    expect(r.successFeePct).toBe(15);
    expect(r.provenance).toBe("mandate_snapshot");
  });
});

// ── Legacy ──────────────────────────────────────────────────────────────
describe("resolveLegacyContractTerms", () => {
  it("reads fee_pct from an old snapshot without policy_version", () => {
    const r = resolveLegacyContractTerms({ acceptance_snapshot_json: { fee_pct: 25, baseline_currency: "EUR" } });
    expect(r.successFeePct).toBe(25);
    expect(r.isLegacy).toBe(true);
    expect(r.policySource).toBe(LEGACY_POLICY_SOURCE);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("reads node_share_percent from a legacy BillingRule", () => {
    const r = resolveLegacyContractTerms({ node_share_percent: 20, currency: "EUR" });
    expect(r.successFeePct).toBe(20);
    expect(r.isLegacy).toBe(true);
    expect(r.provenance).toBe("legacy_billing_rule");
  });

  it("reads effective_fee_pct from a legacy report", () => {
    const r = resolveLegacyContractTerms({ effective_fee_pct: 18, currency: "EUR" });
    expect(r.successFeePct).toBe(18);
    expect(r.provenance).toBe("legacy_report");
  });

  it("does not invent a policyVersion for legacy records", () => {
    const r = resolveLegacyContractTerms({ node_share_percent: 25 });
    expect(r.policyVersion).toBe(LEGACY_POLICY_SOURCE);
  });

  it("returns unresolvable when no fee is present", () => {
    const r = resolveLegacyContractTerms({});
    expect(r.provenance).toBe("unresolvable");
    expect(r.warnings).toContain("unresolvable: no fee found on record");
  });
});

// ── Hash determinism ─────────────────────────────────────────────────────
describe("hash and canonical serialization", () => {
  it("same snapshot → same hash", async () => {
    const a = buildSnapshot();
    const b = buildSnapshot();
    expect(await hashContractPolicySnapshot(a)).toBe(await hashContractPolicySnapshot(b));
  });

  it("different fee → different hash", async () => {
    const a = buildSnapshot(POLICY_A);
    const b = buildSnapshot(POLICY_B);
    expect(await hashContractPolicySnapshot(a)).not.toBe(await hashContractPolicySnapshot(b));
  });

  it("key order does not change the hash", async () => {
    const s = buildSnapshot();
    const reordered = { currency: s.currency, policyVersion: s.policyVersion, snapshotSchemaVersion: s.snapshotSchemaVersion };
    // canonicalStringify sorts keys, so reordering is irrelevant
    expect(canonicalStringify({ a: 1, b: 2 })).toBe(canonicalStringify({ b: 2, a: 1 }));
  });

  it("retry produces the same hash (idempotency)", async () => {
    const mandate1 = { acceptance_snapshot_json: buildSnapshot(), acceptance_snapshot_hash: "h" };
    const mandate2 = { acceptance_snapshot_json: buildSnapshot(), acceptance_snapshot_hash: "h" };
    const h1 = await hashContractPolicySnapshot(mandate1.acceptance_snapshot_json);
    const h2 = await hashContractPolicySnapshot(mandate2.acceptance_snapshot_json);
    expect(h1).toBe(h2);
  });
});

// ── Override ────────────────────────────────────────────────────────────
describe("override audit", () => {
  it("override is recorded in the snapshot", () => {
    const override = {
      hasOverride: true,
      fields: ["successFeePct"],
      reason: "negotiated",
      authorisedBy: "admin@cambra.global",
      authorisedAt: "2026-08-05T10:00:00Z",
    };
    const s = buildSnapshot(POLICY_A, override);
    expect(s.overrides.hasOverride).toBe(true);
    expect(s.overrides.authorisedBy).toBe("admin@cambra.global");
  });

  it("resolver reports hasOverride from the snapshot", () => {
    const override = { hasOverride: true, fields: ["fee"], reason: "r", authorisedBy: "a", authorisedAt: "t" };
    const mandate = { acceptance_snapshot_json: { ...buildSnapshot(POLICY_A, override), fee_pct: 20 }, acceptance_snapshot_hash: "h" };
    expect(resolveContractPolicy({ mandate }).hasOverride).toBe(true);
  });

  it("a standard contract has no override", () => {
    const mandate = { acceptance_snapshot_json: { ...buildSnapshot(), fee_pct: 25 }, acceptance_snapshot_hash: "h" };
    expect(resolveContractPolicy({ mandate }).hasOverride).toBe(false);
  });
});

// ── Frontend payload guard ───────────────────────────────────────────────
describe("rejectClientTerms", () => {
  it("accepts an empty payload", () => {
    expect(rejectClientTerms({}).ok).toBe(true);
  });

  it("rejects a payload that carries successFeeRate", () => {
    const r = rejectClientTerms({ successFeeRate: 0.30 });
    expect(r.ok).toBe(false);
    expect(r.keys).toContain("successFeeRate");
  });

  it("rejects a payload that carries feeDurationMonths", () => {
    expect(rejectClientTerms({ feeDurationMonths: 12 }).ok).toBe(false);
  });

  it("rejects a payload that carries policy_version", () => {
    expect(rejectClientTerms({ policy_version: "fake" }).ok).toBe(false);
  });

  it("rejects a payload that carries snapshot_hash", () => {
    expect(rejectClientTerms({ snapshot_hash: "tampered" }).ok).toBe(false);
  });

  it("accepts unrelated payload keys (mandate_id, signed_by_name)", () => {
    expect(rejectClientTerms({ mandate_id: "m1", signed_by_name: "John" }).ok).toBe(true);
  });
});

// ── FASE 17: Fundamental immutability test ────────────────────────────────
describe("immutability — policy A → policy B", () => {
  it("an accepted contract under policy A is NOT altered by policy B", async () => {
    // 1. Accept under policy A
    const snapshotA = buildSnapshot(POLICY_A);
    const hashA = await hashContractPolicySnapshot(snapshotA);
    const mandateA = {
      acceptance_snapshot_json: { ...snapshotA, fee_pct: 25 },
      acceptance_snapshot_hash: hashA,
      document_version: DOC_VERSION,
    };

    // 2. Simulate policy B coming into force
    const snapshotB = buildSnapshot(POLICY_B);
    const hashB = await hashContractPolicySnapshot(snapshotB);
    expect(hashB).not.toBe(hashA);

    // 3. Resolve the accepted contract — must still use A
    const resolved = resolveContractPolicy({ mandate: mandateA });
    expect(resolved.successFeePct).toBe(25);
    expect(resolved.merchantSharePct).toBe(75);
    expect(resolved.feeDurationMonths).toBe(24);
    expect(resolved.policyVersion).toBe("2026.08.01");
    expect(resolved.snapshotHash).toBe(hashA);

    // 4. A NEW contract under policy B would use B's terms
    const mandateB = {
      acceptance_snapshot_json: { ...snapshotB, fee_pct: 30 },
      acceptance_snapshot_hash: hashB,
      document_version: DOC_VERSION,
    };
    const resolvedB = resolveContractPolicy({ mandate: mandateB });
    expect(resolvedB.successFeePct).toBe(30);
    expect(resolvedB.merchantSharePct).toBe(70);
    expect(resolvedB.feeDurationMonths).toBe(12);
    expect(resolvedB.policyVersion).toBe("2027.01.01");
  });

  it("hash A is stable across retries (idempotency)", async () => {
    const s = buildSnapshot(POLICY_A);
    const h1 = await hashContractPolicySnapshot(s);
    const h2 = await hashContractPolicySnapshot(buildSnapshot(POLICY_A));
    expect(h1).toBe(h2);
  });
});

// ── Parity: snapshot matches the generated policy ───────────────────────
describe("parity with generated policy constants", () => {
  it("snapshot economic terms match the policy values", () => {
    const s = buildSnapshot(POLICY_A);
    expect(s.economicTerms.successFeePct).toBe(25);
    expect(s.economicTerms.merchantSharePct).toBe(75);
    expect(s.economicTerms.feeDurationMonths).toBe(24);
  });

  it("snapshot referral terms match the policy values", () => {
    const s = buildSnapshot(POLICY_A);
    expect(s.referralTerms.startRate).toBe(0.25);
    expect(s.referralTerms.stepRate).toBe(0.05);
    expect(s.referralTerms.floorRate).toBe(0.05);
  });
});