import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  selectLeastRecentlyReconciledInvoices,
} from "../../base44/shared/economicExecution.ts";

const read = (path) =>
  fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

function invoice(id, lastReconciledAt = null) {
  return {
    id,
    payment_provider: "stripe",
    monthly_savings_report_id: `report-${id}`,
    stripe_invoice_id: `in_${id}`,
    last_reconciled_at: lastReconciledAt,
  };
}

function authorityWindow(rows, limit) {
  return [...rows]
    .sort((left, right) => {
      const leftTime = left.last_reconciled_at
        ? new Date(left.last_reconciled_at).getTime()
        : Number.NEGATIVE_INFINITY;
      const rightTime = right.last_reconciled_at
        ? new Date(right.last_reconciled_at).getTime()
        : Number.NEGATIVE_INFINITY;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    })
    .slice(0, limit + 1);
}

describe("Recover billing least-recently-reconciled selection", () => {
  it("covers more than two batches across consecutive bounded cycles", () => {
    const limit = 100;
    const rows = Array.from(
      { length: 205 },
      (_, index) => invoice(String(index).padStart(3, "0")),
    );
    const covered = new Set();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const selection = selectLeastRecentlyReconciledInvoices(
        authorityWindow(rows, limit),
        limit,
      );
      expect(selection.candidates).toHaveLength(limit);
      expect(selection.observed_count).toBe(limit + 1);
      expect(selection.backlog).toBe(true);
      expect(selection.coverage_status).toBe("BOUNDED_BACKLOG");

      const attemptedAt = `2026-08-14T00:0${cycle}:00.000Z`;
      for (const selected of selection.candidates) {
        covered.add(selected.id);
        selected.last_reconciled_at = attemptedAt;
      }
    }

    expect(covered.size).toBe(205);
    expect([...covered].sort()).toEqual(rows.map((row) => row.id));
  });

  it("prioritizes never-attempted and malformed timestamps, then timestamp and id", () => {
    const rows = [
      invoice("z", "2026-08-14T00:00:00.000Z"),
      invoice("b", null),
      invoice("a", "not-a-date"),
      invoice("c", "2026-08-13T00:00:00.000Z"),
    ];

    const selected = selectLeastRecentlyReconciledInvoices(rows, 3);

    expect(selected.candidates.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(selected.invalid_timestamp_count).toBe(1);
    expect(selected.backlog).toBe(true);
    expect(selected.read_cap).toBe(4);
  });

  it("fails closed on unavailable, over-cap, duplicate, or unbound authority rows", () => {
    expect(() => selectLeastRecentlyReconciledInvoices(null, 10)).toThrow(
      "recover_reconciliation_invoice_authority_unavailable",
    );
    expect(() =>
      selectLeastRecentlyReconciledInvoices(
        Array.from({ length: 12 }, (_, index) => invoice(String(index))),
        10,
      )
    ).toThrow("recover_reconciliation_bounded_read_overflow");
    expect(() =>
      selectLeastRecentlyReconciledInvoices(
        [invoice("same"), invoice("same")],
        2,
      )
    ).toThrow("recover_reconciliation_invoice_authority_ambiguous");
    expect(() =>
      selectLeastRecentlyReconciledInvoices([
        { ...invoice("unbound"), stripe_invoice_id: "" },
      ], 1)
    ).toThrow("recover_reconciliation_candidate_binding_invalid");
  });

  it("wires cap+1 authority, durable attempt progress and canonical report projection", () => {
    const source = read("base44/functions/reconcileRecoverBilling/entry.ts");
    const select = source.indexOf(
      "selectLeastRecentlyReconciledInvoices(rows, limit)",
    );
    const attempt = source.indexOf("Invoice.update(candidate.id", select);
    const attemptReadback = source.indexOf(
      '"recover_reconciler_attempt"',
      attempt,
    );
    const stripeRead = source.indexOf("stripeRequest(", attemptReadback);

    expect(source).toContain('monthly_savings_report_id: { $nin: [null, ""] }');
    expect(source).toContain('stripe_invoice_id: { $nin: [null, ""] }');
    expect(source).toMatch(/"last_reconciled_at",\s*limit \+ 1/);
    expect(select).toBeGreaterThan(-1);
    expect(attempt).toBeGreaterThan(select);
    expect(attemptReadback).toBeGreaterThan(attempt);
    expect(stripeRead).toBeGreaterThan(attemptReadback);
    expect(source).toContain("recover_reconciler_attempt_not_observed");
    expect(source).toContain("recoverReportProjectionForInvoiceStatus(");
    expect(source).toContain("coverage_status: selection.coverage_status");
    expect(source).not.toContain('-created_date",\n      250');
  });
});
