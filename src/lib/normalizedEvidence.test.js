// v62.4 — ECL P2: Normalized Evidence Model.
import { describe, it, expect } from "vitest";
import {
  normalizePaymentsEvidence,
  normalizeCommerceEvidence,
  normalizeAccountingEvidence,
  NORMALIZED_EVIDENCE_VERSION,
} from "@/lib/normalizedEvidence";

const basePayments = {
  evidenceType: "statement_csv",
  sourceType: "provider_statement",
  currency: "EUR",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  checksum: "abc",
  importId: "imp_1",
  parserVersion: "csv-1",
  grossAmountMinor: 10000000,
  feesAmountMinor: 175000,
  netAmountMinor: 9825000,
  feeRateBps: 175,
  transactionCount: 4200,
};

describe("normalizePaymentsEvidence — aggregates only", () => {
  it("does not throw when refunds/chargebacks are absent (the parser never emits them)", () => {
    expect(() => normalizePaymentsEvidence(basePayments)).not.toThrow();
    const r = normalizePaymentsEvidence(basePayments);
    expect(r.metrics.grossAmountMinor).toBe(10000000);
    expect(r.normalizedVersion).toBe(NORMALIZED_EVIDENCE_VERSION);
  });

  it("reports absent refunds in missingFields, never as zero", () => {
    const r = normalizePaymentsEvidence(basePayments);
    expect(r.missingFields).toContain("refundsAmountMinor");
    expect(r.missingFields).toContain("chargebacksAmountMinor");
    expect(r.metrics.refundsAmountMinor).toBeUndefined();
  });

  it("routes a present-but-invalid value to invalidFields, not missingFields", () => {
    const r = normalizePaymentsEvidence({ ...basePayments, feesAmountMinor: -5 });
    expect(r.invalidFields).toEqual(expect.arrayContaining([{ field: "feesAmountMinor", reason: "negative" }]));
    expect(r.missingFields).not.toContain("feesAmountMinor");
    expect(r.metrics.feesAmountMinor).toBeUndefined();
  });

  it("refuses a non-integer minor amount instead of rounding it", () => {
    const r = normalizePaymentsEvidence({ ...basePayments, grossAmountMinor: 1000.5 });
    expect(r.invalidFields).toEqual(
      expect.arrayContaining([{ field: "grossAmountMinor", reason: "minor_units_must_be_integer" }]),
    );
  });

  it("never reinterprets a major-unit value as minor units", () => {
    const { grossAmountMinor, ...noMinor } = basePayments;
    const r = normalizePaymentsEvidence({ ...noMinor, grossAmount: 100000 });
    expect(r.metrics.grossAmountMinor).toBeUndefined();
    expect(r.missingFields).toContain("grossAmountMinor");
    expect(r.normalizationWarnings.join(" ")).toMatch(/grossAmount present but ignored/);
  });

  it("never invents a currency", () => {
    const { currency, ...noCurrency } = basePayments;
    const r = normalizePaymentsEvidence(noCurrency);
    expect(r.currency).toBeNull();
    expect(r.missingFields).toContain("currency");
  });

  it("rejects a malformed currency code", () => {
    const r = normalizePaymentsEvidence({ ...basePayments, currency: "eur" });
    expect(r.currency).toBeNull();
    expect(r.invalidFields.some((f) => f.field === "currency")).toBe(true);
  });

  it("computes coverageDays inclusively", () => {
    expect(normalizePaymentsEvidence(basePayments).coverageDays).toBe(31);
    expect(normalizePaymentsEvidence({ ...basePayments, periodEnd: "2026-07-01" }).coverageDays).toBe(1);
  });

  it("treats an impossible date as invalid", () => {
    const r = normalizePaymentsEvidence({ ...basePayments, periodEnd: "2026-02-30" });
    expect(r.invalidFields).toEqual(
      expect.arrayContaining([{ field: "periodEnd", reason: "not_a_real_calendar_date" }]),
    );
    expect(r.coverageDays).toBeNull();
  });

  it("treats an inverted period as invalid on both bounds, never as negative coverage", () => {
    const r = normalizePaymentsEvidence({ ...basePayments, periodStart: "2026-07-31", periodEnd: "2026-07-01" });
    expect(r.coverageDays).toBeNull();
    expect(r.invalidFields.filter((f) => f.reason === "period_inverted")).toHaveLength(2);
  });

  it("applies NO confidence rule and NO threshold", () => {
    const r = normalizePaymentsEvidence(basePayments);
    expect(r.confidenceLevel).toBeUndefined();
    expect(r.freezeEligibility).toBeUndefined();
    expect(r.evidenceStatus).toBeUndefined();
  });

  it("survives a garbage input without throwing", () => {
    expect(() => normalizePaymentsEvidence(null)).not.toThrow();
    expect(normalizePaymentsEvidence(null).missingFields.length).toBeGreaterThan(0);
  });
});

describe("normalized evidence — REAL deep freeze", () => {
  it("freezes nested objects and arrays, not just the envelope", () => {
    const r = normalizePaymentsEvidence({ ...basePayments, feesAmountMinor: -5, refundsAmountMinor: 1.5 });
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.metrics)).toBe(true);
    expect(Object.isFrozen(r.missingFields)).toBe(true);
    expect(Object.isFrozen(r.invalidFields)).toBe(true);
    expect(Object.isFrozen(r.invalidFields[0])).toBe(true);
    expect(() => { r.invalidFields.push({ field: "x", reason: "y" }); }).toThrow();
    expect(() => { r.invalidFields[0].reason = "tampered"; }).toThrow();
    expect(() => { r.metrics.grossAmountMinor = 1; }).toThrow();
  });
});

describe("normalizeCommerceEvidence", () => {
  it("uses the commerce metric contract", () => {
    const r = normalizeCommerceEvidence({
      currency: "EUR",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      grossSalesAmountMinor: 12000000,
      orderCount: 900,
    });
    expect(r.domain).toBe("commerce");
    expect(r.metrics.grossSalesAmountMinor).toBe(12000000);
    expect(r.missingFields).toContain("netSalesAmountMinor");
    expect(r.metrics.grossAmountMinor).toBeUndefined();
  });
});

describe("normalizeAccountingEvidence", () => {
  const base = { currency: "EUR", periodStart: "2026-07-01", periodEnd: "2026-07-31", sourceSoftware: "pennylane" };

  it("normalizes entries with amountMinor, accountCode and entryPeriod", () => {
    const r = normalizeAccountingEvidence({
      ...base,
      entries: [{ amountMinor: 15000, accountCode: "627800", entryPeriod: "2026-07" }],
    });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].accountCode).toBe("627800");
    expect(Object.isFrozen(r.entries[0])).toBe(true);
  });

  it("reports an invalid entry amount per index and drops the entry", () => {
    const r = normalizeAccountingEvidence({ ...base, entries: [{ amountMinor: "x", accountCode: "6", entryPeriod: "2026-07" }] });
    expect(r.entries).toHaveLength(0);
    expect(r.invalidFields[0].field).toBe("entries[0].amountMinor");
  });

  it("reports a missing entries array", () => {
    expect(normalizeAccountingEvidence(base).missingFields).toContain("entries");
  });

  it("never converts a major-unit entry amount", () => {
    const r = normalizeAccountingEvidence({ ...base, entries: [{ amount: 150, accountCode: "6", entryPeriod: "2026-07" }] });
    expect(r.entries).toHaveLength(0);
    expect(r.normalizationWarnings.join(" ")).toMatch(/ignored/);
  });
});