import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
import { validateProductPolicy, buildArtifacts } from "@/lib/productPolicySchema";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf-8");
const POLICY_JSON = JSON.parse(read("config/product-policy.json"));
const EXPECTED = buildArtifacts(validateProductPolicy(POLICY_JSON));

describe("policy:check — no drift between config and generated artifacts", () => {
  it("frontend artifact matches the canonical generation", () => {
    expect(read("src/lib/generated/productPolicy.js")).toBe(EXPECTED);
  });
  it("backend artifact matches the canonical generation", () => {
    expect(read("base44/shared/generated/productPolicy.ts")).toBe(EXPECTED);
  });
  it("drift is detectable (a tampered artifact would not match)", () => {
    const tampered = EXPECTED.replace("successFeeRate * 100", "successFeeRate * 100 /*x*/");
    expect(tampered).not.toBe(EXPECTED);
  });
});

describe("policy drift guards — critical-surface hardcodes", () => {
  it("OPERATIONS_STATUS records the honest Stripe classification", () => {
    expect(read("src/docs/OPERATIONS_STATUS.md")).toContain("implemented_live_verification_pending");
  });
  it("no second executable definition of productScope booleans (adapter only)", () => {
    expect(read("src/lib/featureScope.js")).not.toMatch(/productionEnabled:\s*(true|false)/);
  });
  it("generated artifacts carry the DO-NOT-EDIT header", () => {
    expect(read("src/lib/generated/productPolicy.js")).toContain("GENERATED FILE — DO NOT EDIT DIRECTLY");
    expect(read("base44/shared/generated/productPolicy.ts")).toContain("GENERATED FILE — DO NOT EDIT DIRECTLY");
  });
  it("Pricing.jsx no longer hardcodes the 75/25 split literals", () => {
    const src = read("src/pages/Pricing.jsx");
    // The structural split must come from helpers, not literals.
    expect(src).not.toMatch(/>75%</);
    expect(src).not.toMatch(/>25%</);
  });
  it("PricingDual.jsx no longer hardcodes the recover price literal", () => {
    const src = read("src/components/landing/PricingDual.jsx");
    expect(src).not.toMatch(/price="25%"/);
  });
});

describe("policy drift guards — backend economic hardcodes (v60.1)", () => {
  it("billingFee.ts no longer hardcodes the success-fee fallback literal", () => {
    const src = read("base44/shared/billingFee.ts");
    expect(src).not.toMatch(/fallbackPct\s*=\s*25\b/);
    expect(src).not.toMatch(/\?\?\s*25\b/);
    expect(src).toContain("getSuccessFeePct");
  });
  it("referralProgram.ts imports the ladder from the generated policy", () => {
    const src = read("base44/shared/referralProgram.ts");
    expect(src).toContain("getReferralStartPct");
    expect(src).toContain("getReferralFloorPct");
    expect(src).not.toMatch(/export const BASE_FEE_PCT = 25/);
  });
  it("referralProgram.js imports the ladder from the generated policy", () => {
    const src = read("src/lib/referralProgram.js");
    expect(src).toContain("getReferralStartPct");
    expect(src).not.toMatch(/export const BASE_FEE_PCT = 25/);
  });
  it("recoverContractPdf.ts derives the standard fee via resolveContractPolicy (v60.2)", () => {
    const src = read("base44/shared/recoverContractPdf.ts");
    expect(src).not.toMatch(/const standard = 25/);
    // v60.2: the PDF resolves terms from the contract snapshot, not the live policy.
    expect(src).toContain("resolveContractPolicy");
    expect(src).toContain("buildContractEconomicView");
  });
  it("acceptance flow imports the generated fee/duration", () => {
    expect(read("base44/functions/startRecoverAcceptance/entry.ts")).toContain("getFeeDurationMonths");
    expect(read("base44/functions/acceptRecoverMandate/entry.ts")).toContain("getSuccessFeePct");
  });
  it("acceptance snapshot carries policy_version", () => {
    expect(read("base44/shared/recoverAcceptance.ts")).toContain("policy_version");
    expect(read("base44/shared/recoverAcceptance.ts")).toContain("PRODUCT_POLICY.policyVersion");
  });
  it("referralBilling stamps policy_version on new rules", () => {
    expect(read("base44/shared/referralBilling.ts")).toContain("policy_version");
  });
  it("contractPolicySnapshot module exists", () => {
    expect(read("base44/shared/contractPolicySnapshot.ts")).toContain("buildContractPolicySnapshot");
    expect(read("base44/shared/contractPolicySnapshot.ts")).toContain("resolveContractPolicy");
    expect(read("base44/shared/contractPolicySnapshot.ts")).toContain("resolveLegacyContractTerms");
  });
  it("buildContractEconomicView exists for the common economic contract (v60.2)", () => {
    expect(read("base44/shared/contractPolicySnapshot.ts")).toContain("buildContractEconomicView");
  });
  it("resolver returns a resolvable flag (v60.2)", () => {
    expect(read("base44/shared/contractPolicySnapshot.ts")).toContain("resolvable");
  });
});

// ── v60.2 drift guards — unsafe fallback elimination ─────────────────────
describe("policy drift guards — v60.2 unsafe fallback elimination", () => {
  it("PDF uses resolveContractPolicy, not a local || getSuccessFeePct() fallback", () => {
    const src = read("base44/shared/recoverContractPdf.ts");
    // The old `|| getSuccessFeePct()` fallback that replaced a contractual 0 with 25 is gone.
    expect(src).not.toMatch(/\|\|\s*getSuccessFeePct\(\)/);
    // The PDF now calls resolveContractPolicy + buildContractEconomicView.
    expect(src).toContain("resolveContractPolicy");
    expect(src).toContain("buildContractEconomicView");
    // An unresolvable contract must block generation.
    expect(src).toContain("_resolved.resolvable");
  });

  it("MonthlySavingsReport schema has policy provenance fields (v60.2)", () => {
    const src = read("base44/entities/MonthlySavingsReport.jsonc");
    expect(src).toContain("policy_source");
    expect(src).toContain("mandate_id");
    expect(src).toContain("billing_rule_id");
    expect(src).toContain("applied_fee_pct");
    expect(src).toContain("merchant_share_pct");
    expect(src).toContain("fee_duration_months");
    expect(src).toContain("resolution_warnings");
    expect(src).toContain("generated_by");
  });

  it("generateMonthlySavingsReport persists contract policy provenance", () => {
    const src = read("base44/functions/generateMonthlySavingsReport/entry.ts");
    expect(src).toContain("resolveContractPolicy");
    expect(src).toContain("contractResolved");
    expect(src).toContain("policy_version");
    expect(src).toContain("snapshot_hash");
    expect(src).toContain("mandate_id");
    expect(src).toContain("applied_fee_pct");
  });

  it("approveRecoverReportForInvoicing uses resolveContractPolicy and getSuccessFeePct", () => {
    const src = read("base44/functions/approveRecoverReportForInvoicing/entry.ts");
    expect(src).toContain("resolveContractPolicy");
    expect(src).toContain("buildContractEconomicView");
    expect(src).toContain("getSuccessFeePct");
    expect(src).not.toMatch(/const STANDARD_FEE_PCT = 25/);
    // Immutability guard present.
    expect(src).toContain("provenance_mismatch");
  });

  it("createEligibleRecoverInvoices freezes policy provenance in billing_snapshot_json", () => {
    const src = read("base44/functions/createEligibleRecoverInvoices/entry.ts");
    // v61: policy resolution moved into the pure core the handler imports;
    // provenance still freezes on the invoice record and its snapshot.
    expect(src).toContain("prepareEligibleRecoverInvoice");
    expect(read("base44/shared/prepareEligibleRecoverInvoice.ts")).toContain("resolveContractPolicy");
    expect(src).toContain("policy_version");
    expect(src).toContain("policy_source");
    expect(src).toContain("snapshot_hash");
  });

  it("Invoice schema has policy provenance fields (v60.2)", () => {
    const src = read("base44/entities/Invoice.jsonc");
    expect(src).toContain("policy_version");
    expect(src).toContain("snapshot_hash");
    expect(src).toContain("policy_source");
  });

  it("no new hardcode 25/24/75 on contract surfaces (allowlisted exceptions only)", () => {
    // The resolver and legacy fallback use 75/24 as defaults for missing
    // merchant_share/duration — this is a Number.isFinite default, NOT a || fallback.
    // The PDF and approval no longer hardcode 25.
    const pdf = read("base44/shared/recoverContractPdf.ts");
    expect(pdf).not.toMatch(/const standard = 25/);
    const approval = read("base44/functions/approveRecoverReportForInvoicing/entry.ts");
    // getSuccessFeePct() replaces the old `= 25` literal.
    expect(approval).not.toMatch(/const STANDARD_FEE_PCT = 25/);
  });

  it("v61: invoice handler resolves policy via the pure core BEFORE any Stripe call", () => {
    const src = read("base44/functions/createEligibleRecoverInvoices/entry.ts");
    expect(src).toContain("prepareEligibleRecoverInvoice");
    // Order guard: the pure core (which resolves the contract policy) is
    // invoked before the first Stripe invoice call in the handler body.
    const coreIdx = src.indexOf("prepareEligibleRecoverInvoice({");
    const stripeIdx = src.indexOf("stripeRequest(mode, 'POST', 'invoices'");
    expect(coreIdx).toBeGreaterThan(-1);
    expect(stripeIdx).toBeGreaterThan(-1);
    expect(coreIdx).toBeLessThan(stripeIdx);
    // The old post-finalize resolution is gone.
    expect(src).not.toMatch(/standard_fee_pct \|\| 25/);
  });

  it("v61: idempotency identity is keyed on the report id", () => {
    const core = read("base44/shared/prepareEligibleRecoverInvoice.ts");
    expect(core).toContain("monthly_savings_report_id: String(report.id)");
    expect(core).toContain("idempotency_conflict_different_report");
    const entry = read("base44/functions/createEligibleRecoverInvoices/entry.ts");
    expect(entry).toContain("r4:inv:create:${report.id}");
    expect(entry).toContain("r4:inv:fin:${report.id}");
  });

  it("v61: monthly report generator is payments-only and gated server-side", () => {
    const src = read("base44/functions/generateMonthlySavingsReport/entry.ts");
    expect(src).toContain("assertProductionEnabledVertical");
    expect(src).not.toMatch(/vertical === 'shipping'/);
    expect(src).not.toMatch(/vertical === 'saas'/);
    expect(src).not.toMatch(/node_share_percent \|\| 25/);
    // Honest measurement copy — no "live Stripe" claim while verification is pending.
    expect(src).not.toMatch(/live Stripe/i);
    expect(src).toContain("connected Stripe data");
  });

  it("v61: productScopeGuard exists and derives from the generated artifact", () => {
    const src = read("base44/shared/productScopeGuard.ts");
    expect(src).toContain("assertProductionEnabledVertical");
    expect(src).toContain("./generated/productPolicy.ts");
    expect(src).toContain("ProductScopeError");
  });

  it("v61: modern incomplete snapshots are unresolvable (no 75/24 completion)", () => {
    const src = read("base44/shared/contractPolicySnapshot.ts");
    expect(src).toContain("mandate_snapshot_incomplete");
    expect(src).not.toContain("mandate_snapshot_share_defaulted");
    expect(src).not.toContain("mandate_snapshot_duration_defaulted");
  });

  it("resolver no longer uses || 25 / || 75 / || 24 fallbacks (uses Number.isFinite)", () => {
    const src = read("base44/shared/contractPolicySnapshot.ts");
    // The mandate_snapshot branch must not use `|| 25`, `|| 75`, `|| 24`.
    expect(src).not.toMatch(/feePct\) \|\| 25/);
    expect(src).not.toMatch(/merchantSharePct\) \|\| 75/);
    expect(src).not.toMatch(/feeDurationMonths\) \|\| 24/);
    // Number.isFinite is used instead.
    expect(src).toContain("Number.isFinite(feePct)");
  });
});