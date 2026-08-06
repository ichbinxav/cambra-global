// productScopeGuard.test — CAMBRA v61 (2026-08-06). Audit finding #4/#12.
//
// The backend product-scope gate: only production-enabled verticals (payments)
// may produce reports, savings, fees or invoices. Derived exclusively from the
// generated policy artifact — a policy change flips the gate, code does not.
import { describe, it, expect } from "vitest";
import {
  assertProductionEnabledVertical,
  assertMerchantVisibleVertical,
  getProductionVerticals,
  ProductScopeError,
} from "../../base44/shared/productScopeGuard.ts";

describe("productScopeGuard — production gate", () => {
  it("payments is the only production-enabled vertical", () => {
    expect(getProductionVerticals()).toEqual(["payments"]);
  });

  it("payments passes the assertion", () => {
    expect(() => assertProductionEnabledVertical("payments")).not.toThrow();
  });

  it.each(["shipping", "saas", "insurance", "telecom", "energy", "banking", "financing"])(
    "%s is blocked with a typed ProductScopeError",
    (vertical) => {
      expect(() => assertProductionEnabledVertical(vertical)).toThrow(ProductScopeError);
      try {
        assertProductionEnabledVertical(vertical);
      } catch (e) {
        expect(e.code).toBe(`product_scope_blocked:${vertical}`);
        expect(e.vertical).toBe(vertical);
      }
    },
  );

  it("unknown / empty verticals are blocked, never allowed by default", () => {
    expect(() => assertProductionEnabledVertical("lending")).toThrow(ProductScopeError);
    expect(() => assertProductionEnabledVertical("")).toThrow(ProductScopeError);
    expect(() => assertProductionEnabledVertical(undefined)).toThrow(ProductScopeError);
    expect(() => assertProductionEnabledVertical(null)).toThrow(ProductScopeError);
  });
});

describe("productScopeGuard — merchant visibility gate", () => {
  it("payments is merchant visible", () => {
    expect(() => assertMerchantVisibleVertical("payments")).not.toThrow();
  });

  it("dormant verticals are not merchant visible", () => {
    expect(() => assertMerchantVisibleVertical("shipping")).toThrow(ProductScopeError);
    expect(() => assertMerchantVisibleVertical("saas")).toThrow(ProductScopeError);
  });
});