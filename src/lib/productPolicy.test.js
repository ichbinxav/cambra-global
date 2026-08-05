import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
import {
  validateProductPolicy,
  buildArtifacts,
} from "@/lib/productPolicySchema";
import {
  POLICY_VERSION,
  EFFECTIVE_DATE,
  ECONOMIC_TERMS_POLICY,
  REFERRAL_POLICY,
  PRODUCT_SCOPE_POLICY,
  INTEGRATION_STATUS,
  getSuccessFeePct,
  getMerchantSharePct,
  getFeeDurationMonths,
  getAnalyzerPriceEur,
  getReferralStartPct,
  getReferralStepPct,
  getReferralFloorPct,
  isMerchantVisible,
  isProductionEnabled,
  getMerchantVisibleVerticals,
  getIntegrationStatus,
} from "@/lib/productPolicy";
import {
  ECONOMIC_TERMS,
  RECOVERY_FEE_PCT,
  RECOVERY_DURATION_MONTHS,
  REFERRAL_FLOOR_PCT,
  REFERRAL_STEP_PCT,
  REFERRAL_START_PCT,
  MERCHANT_SHARE_PCT,
  ANALYZER_FEE_EUR,
  ECONOMIC_SUMMARY_EN,
} from "@/lib/economicTerms";
import {
  FEATURE_SCOPE,
  isProductionEnabled as fsIsProductionEnabled,
  isMerchantVisible as fsIsMerchantVisible,
  getMerchantVisibleVerticals as fsGetVisible,
  getDormantVerticals as fsGetDormant,
} from "@/lib/featureScope";
import { BASE_FEE_PCT, STEP_POINTS, FLOOR_FEE_PCT } from "@/lib/referralProgram";

const root = process.cwd();
const read = (rel) => readFileSync(join(root, rel), "utf-8");
const POLICY_JSON = JSON.parse(read("config/product-policy.json"));

describe("Product Policy — canonical JSON", () => {
  it("validates against the Zod schema", () => {
    expect(() => validateProductPolicy(POLICY_JSON)).not.toThrow();
  });
  it("policyVersion is non-empty", () => {
    expect(POLICY_JSON.policyVersion).toBeTruthy();
  });
  it("effectiveDate is YYYY-MM-DD", () => {
    expect(POLICY_JSON.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("successFeeRate is 0.25", () => {
    expect(POLICY_JSON.economicTerms.successFeeRate).toBe(0.25);
  });
  it("merchantShareRate is 0.75", () => {
    expect(POLICY_JSON.economicTerms.merchantShareRate).toBe(0.75);
  });
  it("fee + share sum to 1", () => {
    expect(
      POLICY_JSON.economicTerms.successFeeRate + POLICY_JSON.economicTerms.merchantShareRate,
    ).toBeCloseTo(1, 9);
  });
  it("feeDurationMonths is 24", () => {
    expect(POLICY_JSON.economicTerms.feeDurationMonths).toBe(24);
  });
  it("Analyzer is free (0 EUR)", () => {
    expect(POLICY_JSON.economicTerms.analyzerPriceEur).toBe(0);
  });
  it("recoveryOptional is true", () => {
    expect(POLICY_JSON.economicTerms.recoveryOptional).toBe(true);
  });
  it("payments is the only production+visible vertical", () => {
    expect(getMerchantVisibleVerticals()).toEqual(["payments"]);
    expect(Object.keys(PRODUCT_SCOPE_POLICY).filter(isProductionEnabled)).toEqual(["payments"]);
  });
  it("every non-payments vertical is dormant", () => {
    for (const v of ["shipping", "saas", "insurance", "telecom", "energy", "banking", "financing"]) {
      expect(isProductionEnabled(v)).toBe(false);
      expect(isMerchantVisible(v)).toBe(false);
    }
  });
  it("referral start/step/floor are 0.25/0.05/0.05", () => {
    expect(REFERRAL_POLICY.startRate).toBe(0.25);
    expect(REFERRAL_POLICY.stepRate).toBe(0.05);
    expect(REFERRAL_POLICY.floorRate).toBe(0.05);
  });
  it("referral floor does not exceed start", () => {
    expect(REFERRAL_POLICY.floorRate).toBeLessThanOrEqual(REFERRAL_POLICY.startRate);
  });
  it("Stripe is classified implemented_live_verification_pending", () => {
    expect(INTEGRATION_STATUS.stripe).toBe("implemented_live_verification_pending");
    expect(getIntegrationStatus("stripe")).toBe("implemented_live_verification_pending");
  });
});

describe("Product Policy — generated artifacts", () => {
  it("frontend and backend artifacts are byte-identical (parity)", () => {
    expect(read("src/lib/generated/productPolicy.js")).toBe(read("base44/shared/generated/productPolicy.ts"));
  });
  it("generation is deterministic", () => {
    const a = buildArtifacts(validateProductPolicy(POLICY_JSON));
    const b = buildArtifacts(validateProductPolicy(POLICY_JSON));
    expect(a).toBe(b);
    expect(a).toBe(read("src/lib/generated/productPolicy.js"));
  });
  it("POLICY_VERSION / EFFECTIVE_DATE are exposed", () => {
    expect(POLICY_VERSION).toBe(POLICY_JSON.policyVersion);
    expect(EFFECTIVE_DATE).toBe(POLICY_JSON.effectiveDate);
  });
  it("helpers derive integer percents from fractions", () => {
    expect(getSuccessFeePct()).toBe(25);
    expect(getMerchantSharePct()).toBe(75);
    expect(getFeeDurationMonths()).toBe(24);
    expect(getAnalyzerPriceEur()).toBe(0);
    expect(getReferralStartPct()).toBe(25);
    expect(getReferralStepPct()).toBe(5);
    expect(getReferralFloorPct()).toBe(5);
  });
  it("PRODUCT_POLICY sub-objects are frozen", () => {
    expect(Object.isFrozen(ECONOMIC_TERMS_POLICY)).toBe(true);
    expect(Object.isFrozen(PRODUCT_SCOPE_POLICY)).toBe(true);
    expect(Object.isFrozen(INTEGRATION_STATUS)).toBe(true);
  });
});

describe("Product Policy — adapters derive from the policy (no duplication)", () => {
  it("economicTerms values equal policy-derived helpers", () => {
    expect(RECOVERY_FEE_PCT).toBe(getSuccessFeePct());
    expect(RECOVERY_DURATION_MONTHS).toBe(getFeeDurationMonths());
    expect(REFERRAL_FLOOR_PCT).toBe(getReferralFloorPct());
    expect(REFERRAL_STEP_PCT).toBe(getReferralStepPct());
    expect(REFERRAL_START_PCT).toBe(getReferralStartPct());
    expect(MERCHANT_SHARE_PCT).toBe(getMerchantSharePct());
    expect(ANALYZER_FEE_EUR).toBe(getAnalyzerPriceEur());
  });
  it("ECONOMIC_TERMS is frozen", () => {
    expect(Object.isFrozen(ECONOMIC_TERMS)).toBe(true);
  });
  it("ECONOMIC_SUMMARY_EN still carries 25% / 24 / 5 (byte-stable)", () => {
    expect(ECONOMIC_SUMMARY_EN).toContain("25%");
    expect(ECONOMIC_SUMMARY_EN).toContain("24 months");
    expect(ECONOMIC_SUMMARY_EN).toContain("Referral floor 5%");
  });
  it("featureScope booleans equal policy booleans", () => {
    expect(fsIsMerchantVisible("payments")).toBe(PRODUCT_SCOPE_POLICY.payments.merchantVisible);
    expect(fsIsProductionEnabled("payments")).toBe(PRODUCT_SCOPE_POLICY.payments.productionEnabled);
    expect(fsGetVisible()).toEqual(["payments"]);
    expect(fsGetDormant()).toEqual(["shipping", "saas", "insurance", "telecom", "energy", "banking", "financing"]);
  });
  it("FEATURE_SCOPE is frozen and carries labels", () => {
    expect(Object.isFrozen(FEATURE_SCOPE)).toBe(true);
    expect(FEATURE_SCOPE.payments.label).toBeTruthy();
    expect(FEATURE_SCOPE.shipping.dormantReason).toBeTruthy();
  });
  it("referral ladder constants equal the policy (characterization parity)", () => {
    expect(BASE_FEE_PCT).toBe(getReferralStartPct());
    expect(STEP_POINTS).toBe(getReferralStepPct());
    expect(FLOOR_FEE_PCT).toBe(getReferralFloorPct());
  });
  it("featureScope.js no longer defines productionEnabled booleans (single source)", () => {
    const src = read("src/lib/featureScope.js");
    expect(src).not.toMatch(/productionEnabled:\s*(true|false)/);
    expect(src).toContain('from "@/lib/generated/productPolicy.js"');
  });
  it("economicTerms.js no longer hardcodes the numeric values (single source)", () => {
    const src = read("src/lib/economicTerms.js");
    expect(src).not.toMatch(/recoveryFeePct:\s*25/);
    expect(src).not.toMatch(/recoveryDurationMonths:\s*24/);
    expect(src).toContain('from "@/lib/generated/productPolicy.js"');
  });
});

describe("Product Policy — public surfaces consume the registry", () => {
  it("Pricing.jsx imports productPolicy helpers for the 75/25 split", () => {
    const src = read("src/pages/Pricing.jsx");
    expect(src).toContain('from "@/lib/productPolicy"');
    expect(src).toContain("getMerchantSharePct");
    expect(src).toContain("getSuccessFeePct");
  });
  it("PricingDual.jsx derives the recover price from the policy", () => {
    const src = read("src/components/landing/PricingDual.jsx");
    expect(src).toContain('from "@/lib/productPolicy"');
    expect(src).toContain("getSuccessFeePct");
  });
});

describe("Product Policy — snapshot contract (Mandate)", () => {
  it("Mandate schema declares acceptance_snapshot_json (the snapshot home)", () => {
    const src = read("base44/entities/Mandate.jsonc");
    expect(src).toContain('"acceptance_snapshot_json"');
    expect(src).toContain('"acceptance_snapshot_hash"');
    expect(src).toContain('"document_version"');
  });
  it("Mandate RLS is tenant-safe (owner_email / signed_by_email)", () => {
    const src = read("base44/entities/Mandate.jsonc");
    expect(src).toContain("owner_email");
    expect(src).toContain("signed_by_email");
  });
  it("the registry exposes policyVersion + fee + duration for embedding", () => {
    expect(typeof POLICY_VERSION).toBe("string");
    expect(getSuccessFeePct()).toBe(25);
    expect(getFeeDurationMonths()).toBe(24);
  });
});

describe("Product Policy — schema rejects invalid policies", () => {
  it("rejects a policy where fee + share != 1", () => {
    const bad = JSON.parse(JSON.stringify(POLICY_JSON));
    bad.economicTerms.merchantShareRate = 0.7;
    expect(() => validateProductPolicy(bad)).toThrow();
  });
  it("rejects a policy where a dormant vertical is enabled", () => {
    const bad = JSON.parse(JSON.stringify(POLICY_JSON));
    bad.productScope.shipping.merchantVisible = true;
    expect(() => validateProductPolicy(bad)).toThrow();
  });
  it("rejects a policy where stripe is 'live'", () => {
    const bad = JSON.parse(JSON.stringify(POLICY_JSON));
    bad.integrationStatus.stripe = "live";
    expect(() => validateProductPolicy(bad)).toThrow();
  });
  it("rejects a policy where referral floor > start", () => {
    const bad = JSON.parse(JSON.stringify(POLICY_JSON));
    bad.referralTerms.floorRate = 0.3;
    expect(() => validateProductPolicy(bad)).toThrow();
  });
});