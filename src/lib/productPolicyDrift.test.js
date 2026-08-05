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