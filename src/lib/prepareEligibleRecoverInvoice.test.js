// prepareEligibleRecoverInvoice.test — CAMBRA v61 (2026-08-06).
//
// Tests the PURE validation core that createEligibleRecoverInvoices uses.
// This is the exact function the handler executes before ANY Stripe call:
// every "blocked → zero Stripe side effects" guarantee is proven here, and
// the handler-order guarantee (core before stripeRequest) is enforced by the
// static drift guards in productPolicyDrift.test.js as a secondary defense.
import { describe, it, expect } from "vitest";
import { prepareEligibleRecoverInvoice } from "../../base44/shared/prepareEligibleRecoverInvoice.ts";
import { eurToMinor } from "../../base44/shared/recoverBillingMath.ts";

const NOW = new Date("2026-04-10T12:00:00Z");

function modernSnap(overrides = {}) {
  return {
    policy_version: "2026.08.01",
    policy_source: "product_policy_registry",
    fee_pct: 25,
    standard_fee_pct: 25,
    merchant_share_pct: 75,
    fee_duration_months: 24,
    currency: "EUR",
    ...overrides,
  };
}

function fixtures(over = {}) {
  const snap = over.snap ?? modernSnap();
  const mandate = {
    id: "m1",
    deal_activation_id: "a1",
    status: "active",
    acceptance_snapshot_json: snap,
    acceptance_snapshot_hash: "hashA",
    document_version: "recover-mandate-v1",
    ...over.mandate,
  };
  const activation = {
    id: "a1",
    brand_id: "b1",
    vertical: "payments",
    conditions_activated_at: "2026-01-15T10:00:00Z",
    payment_method_status: "ready",
    stripe_payment_method_id: "pm_1",
    ...over.activation,
  };
  const brand = { id: "b1", stripe_customer_id: "cus_1", stripe_billing_mode: "test", ...over.brand };
  const report = {
    id: "r1",
    deal_activation_id: "a1",
    brand_id: "b1",
    month: "2026-03",
    billing_eligibility_status: "eligible",
    currency: "EUR",
    savings: 1000,
    standard_fee_pct: 25,
    effective_fee_pct: 25,
    fee_net_amount: 250,
    policy_version: "2026.08.01",
    snapshot_hash: "hashA",
    ...over.report,
  };
  return {
    report,
    activation,
    mandate,
    brand,
    taxContext: over.taxContext ?? { treatment: "FR_STANDARD_TVA", tax_rate_bps: 2000, blockers: [] },
    billingMode: over.billingMode ?? "test",
    existingInvoices: over.existingInvoices ?? [],
    now: NOW,
  };
}

describe("prepareEligibleRecoverInvoice — happy path", () => {
  it("eligible report produces frozen amounts, provenance and idempotency identity", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures());
    expect(prep.eligible).toBe(true);
    expect(prep.blockers).toEqual([]);
    expect(prep.amountMinor).toBe(25000); // 1000€ × 25% = 250€ = 25000 cents
    expect(prep.currency).toBe("EUR");
    expect(prep.policyVersion).toBe("2026.08.01");
    expect(prep.policySource).toBe("product_policy_registry");
    expect(prep.snapshotHash).toBe("hashA");
    expect(prep.idempotencyIdentity).toEqual({
      monthly_savings_report_id: "r1",
      deal_activation_id: "a1",
      month: "2026-03",
      brand_id: "b1",
      mandate_id: "m1",
      currency: "EUR",
    });
    expect(prep.economicView.merchantSharePct).toBe(75);
    expect(prep.economicView.feeDurationMonths).toBe(24);
  });

  it("amount in minor units is IDENTICAL to the approved figure", () => {
    const f = fixtures();
    const prep = prepareEligibleRecoverInvoice(f);
    expect(prep.amountMinor).toBe(eurToMinor(f.report.fee_net_amount));
  });
});

describe("prepareEligibleRecoverInvoice — policy resolution BEFORE any effect", () => {
  it("unresolvable contract → not eligible (zero Stripe calls possible)", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      mandate: { acceptance_snapshot_json: null, acceptance_snapshot_hash: null },
      report: { effective_fee_pct: undefined, policy_version: undefined, snapshot_hash: undefined },
    }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("contract_policy_unresolvable");
    expect(prep.amounts).toBeNull();
  });

  it("INCOMPLETE modern snapshot → unresolvable, never completed with 75/24", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      snap: modernSnap({ merchant_share_pct: undefined }),
      report: { policy_version: undefined, snapshot_hash: undefined, effective_fee_pct: undefined },
    }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("contract_policy_unresolvable");
  });

  it("snapshot hash mismatch → blocked", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { snapshot_hash: "TAMPERED" } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("snapshot_hash_mismatch");
  });

  it("policy version mismatch → blocked", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { policy_version: "2099.01.01" } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("policy_version_mismatch");
  });

  it("contract accepted under policy A keeps A even when a newer policy exists", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      snap: modernSnap({ policy_version: "2025.01.01-vA", fee_pct: 20, standard_fee_pct: 20 }),
      report: { policy_version: "2025.01.01-vA", standard_fee_pct: 20, effective_fee_pct: 20, fee_net_amount: 200 },
    }));
    expect(prep.eligible).toBe(true);
    // The resolver never consults the LIVE policy (2026.08.01 / 25%).
    expect(prep.policyVersion).toBe("2025.01.01-vA");
    expect(prep.amounts.effective_fee_pct).toBe(20);
    expect(prep.amountMinor).toBe(20000);
  });
});

describe("prepareEligibleRecoverInvoice — fee 0 is NEVER 25", () => {
  it("missing standard_fee_pct blocks (standard_fee_missing_reapprove), never defaults to 25", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { standard_fee_pct: undefined } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("standard_fee_missing_reapprove");
    expect(prep.amounts).toBeNull(); // no amount was ever computed with 25
  });

  it("contractual fee of 0 is preserved as 0 (existing zero-fee rule unchanged: no invoice)", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      snap: modernSnap({ fee_pct: 0, standard_fee_pct: 0 }),
      report: { standard_fee_pct: 0, effective_fee_pct: 0, fee_net_amount: 0 },
    }));
    expect(prep.eligible).toBe(false);
    // Characterized behavior: zero fee does not invoice — but it NEVER became 25.
    expect(prep.blockers).toContain("fee_rounds_to_zero");
  });

  it("missing effective_fee_pct blocks", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { effective_fee_pct: undefined } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("effective_fee_missing_reapprove");
  });

  it("drifted stored fee blocks with calculation_mismatch_reapprove", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { fee_net_amount: 999.99 } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("calculation_mismatch_reapprove");
  });
});

describe("prepareEligibleRecoverInvoice — tenant / relation guards", () => {
  it("report belonging to another brand is blocked before anything else", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { brand_id: "b2-OTHER-TENANT" } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("cross_tenant_report_brand_mismatch");
  });

  it("mandate from another activation is blocked", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ mandate: { deal_activation_id: "a2-OTHER" } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("relation_mandate_activation_mismatch");
  });

  it("inactive mandate is blocked", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ mandate: { status: "revoked" } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("mandate_not_active");
  });

  it("missing context is blocked", () => {
    const f = fixtures();
    const prep = prepareEligibleRecoverInvoice({ ...f, brand: null });
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain("context_missing");
  });
});

describe("prepareEligibleRecoverInvoice — operational gates", () => {
  it("non-approved report → report_not_approved", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { billing_eligibility_status: "not_ready" } }));
    expect(prep.blockers).toContain("report_not_approved");
  });

  it("non-EUR currency → currency_mismatch", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { currency: "USD" } }));
    expect(prep.blockers).toContain("currency_mismatch:USD");
  });

  it("tax blockers → tax_blocked", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      taxContext: { treatment: "TAX_REVIEW_REQUIRED", tax_rate_bps: 0, blockers: ["vies_invalid"] },
    }));
    expect(prep.blockers).toContain("tax_blocked:vies_invalid");
  });

  it("payment method not ready → blocked", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ activation: { payment_method_status: "none", stripe_payment_method_id: "" } }));
    expect(prep.blockers).toContain("payment_method_not_ready");
  });

  it("Stripe mode mismatch (sandbox customer, live run) → blocked", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ brand: { stripe_billing_mode: "live" } }));
    expect(prep.blockers).toContain("stripe_customer_missing_or_mode_mismatch");
  });

  it("activation month is never billable (calendar)", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { month: "2026-01" } }));
    expect(prep.blockers[0].startsWith("calendar:")).toBe(true);
  });

  it("shipping vertical is blocked by the backend product scope gate", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ activation: { vertical: "shipping" } }));
    expect(prep.blockers).toContain("product_scope_blocked:shipping");
  });

  it("saas vertical is blocked by the backend product scope gate", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ activation: { vertical: "saas" } }));
    expect(prep.blockers).toContain("product_scope_blocked:saas");
  });
});

describe("prepareEligibleRecoverInvoice — idempotency (report-keyed)", () => {
  it("existing FULLY ISSUED invoice for the SAME report → resume, no duplication", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      existingInvoices: [{ id: "inv1", status: "issued", invoice_number: "STRIPE-0001", monthly_savings_report_id: "r1" }],
    }));
    expect(prep.eligible).toBe(true);
    expect(prep.resume).toEqual({ invoice_id: "inv1", invoice_number: "STRIPE-0001", fully_issued: true });
    expect(prep.conflict).toBeNull();
  });

  it("existing DRAFT invoice for the SAME report → resume the draft", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      existingInvoices: [{ id: "inv1", status: "draft", invoice_number: "", monthly_savings_report_id: "r1" }],
    }));
    expect(prep.eligible).toBe(true);
    expect(prep.resume.fully_issued).toBe(false);
  });

  it("same activation+month, DIFFERENT report → typed conflict, no reuse", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      existingInvoices: [{ id: "inv1", status: "issued", invoice_number: "STRIPE-0001", monthly_savings_report_id: "rOTHER" }],
    }));
    expect(prep.eligible).toBe(false);
    expect(prep.conflict).toEqual({
      code: "idempotency_conflict_different_report",
      existing_invoice_id: "inv1",
      existing_report_id: "rOTHER",
    });
  });

  it("unattributed existing invoice (no report pointer) → typed conflict, never silently adopted", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      existingInvoices: [{ id: "inv1", status: "issued", invoice_number: "STRIPE-0001" }],
    }));
    expect(prep.eligible).toBe(false);
    expect(prep.conflict.code).toBe("idempotency_conflict_unattributed_invoice");
  });

  it("VOID invoices are ignored (legal/void rule preserved — never reused as active)", () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({
      existingInvoices: [{ id: "inv0", status: "void", invoice_number: "STRIPE-0000", monthly_savings_report_id: "rOTHER" }],
    }));
    expect(prep.eligible).toBe(true);
    expect(prep.conflict).toBeNull();
    expect(prep.resume).toBeNull();
  });

  it("retry with the same inputs is deterministic (same identity, same amount)", () => {
    const a = prepareEligibleRecoverInvoice(fixtures());
    const b = prepareEligibleRecoverInvoice(fixtures());
    expect(a.idempotencyIdentity).toEqual(b.idempotencyIdentity);
    expect(a.amountMinor).toBe(b.amountMinor);
    expect(a.snapshotHash).toBe(b.snapshotHash);
  });
});