import { describe, it, expect } from "vitest";
import { FEATURE_SCOPE, isProductionEnabled, isMerchantVisible, getMerchantVisibleVerticals, getDormantVerticals } from "@/lib/featureScope";

// P0.9 — Feature-scope registry tests. Payments is the only production-enabled
// and merchant-visible vertical. All other verticals are dormant.

describe("Feature scope registry (P0.9)", () => {
  it("payments is production-enabled and merchant-visible", () => {
    expect(isProductionEnabled("payments")).toBe(true);
    expect(isMerchantVisible("payments")).toBe(true);
  });

  it("shipping is dormant (not production, not merchant-visible)", () => {
    expect(isProductionEnabled("shipping")).toBe(false);
    expect(isMerchantVisible("shipping")).toBe(false);
  });

  it("saas is dormant", () => {
    expect(isProductionEnabled("saas")).toBe(false);
    expect(isMerchantVisible("saas")).toBe(false);
  });

  it("insurance is dormant", () => {
    expect(isProductionEnabled("insurance")).toBe(false);
    expect(isMerchantVisible("insurance")).toBe(false);
  });

  it("telecom is dormant", () => {
    expect(isProductionEnabled("telecom")).toBe(false);
    expect(isMerchantVisible("telecom")).toBe(false);
  });

  it("energy is dormant", () => {
    expect(isProductionEnabled("energy")).toBe(false);
    expect(isMerchantVisible("energy")).toBe(false);
  });

  it("banking is dormant", () => {
    expect(isProductionEnabled("banking")).toBe(false);
    expect(isMerchantVisible("banking")).toBe(false);
  });

  it("financing is dormant", () => {
    expect(isProductionEnabled("financing")).toBe(false);
    expect(isMerchantVisible("financing")).toBe(false);
  });

  it("only payments is in the merchant-visible list", () => {
    expect(getMerchantVisibleVerticals()).toEqual(["payments"]);
  });

  it("all non-payments verticals are in the dormant list", () => {
    const dormant = getDormantVerticals();
    expect(dormant).toContain("shipping");
    expect(dormant).toContain("saas");
    expect(dormant).toContain("insurance");
    expect(dormant).toContain("telecom");
    expect(dormant).toContain("energy");
    expect(dormant).toContain("banking");
    expect(dormant).toContain("financing");
    expect(dormant).not.toContain("payments");
  });

  it("FEATURE_SCOPE is frozen", () => {
    expect(Object.isFrozen(FEATURE_SCOPE)).toBe(true);
  });
});