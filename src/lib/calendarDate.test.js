import { describe, it, expect } from "vitest";
import { isCalendarDate } from "@/lib/calendarDate";
import { productPolicySchema } from "@/lib/productPolicySchema";
import POLICY_JSON from "../../config/product-policy.json";

describe("isCalendarDate", () => {
  it("accepts real dates, including leap days", () => {
    expect(isCalendarDate("2026-08-01")).toBe(true);
    expect(isCalendarDate("2024-02-29")).toBe(true);
  });

  it("rejects shapes a regex would accept", () => {
    expect(isCalendarDate("2026-99-99")).toBe(false);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(isCalendarDate("2026-00-10")).toBe(false);
    expect(isCalendarDate("2026-02-29")).toBe(false); // 2026 is not a leap year
  });

  it("rejects malformed or non-string values", () => {
    expect(isCalendarDate("2026-8-1")).toBe(false);
    expect(isCalendarDate("2026/08/01")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
    expect(isCalendarDate(null)).toBe(false);
    expect(isCalendarDate(20260801)).toBe(false);
  });
});

describe("product policy effectiveDate", () => {
  it("the shipped policy carries a real calendar date", () => {
    expect(isCalendarDate(POLICY_JSON.effectiveDate)).toBe(true);
    expect(() => productPolicySchema.parse(POLICY_JSON)).not.toThrow();
  });

  it("a non-existent date is rejected by the schema, not just the regex", () => {
    const bad = { ...POLICY_JSON, effectiveDate: "2026-02-30" };
    expect(() => productPolicySchema.parse(bad)).toThrow();
  });
});