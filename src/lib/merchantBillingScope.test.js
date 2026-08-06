// merchantBillingScope.test.js — v61 Checkpoint D (2026-08-06).
//
// TENANT ISOLATION MATRIX for the merchant billing scope, plus a static tripwire
// that merchant pages do not read billing entities from the browser.
// Imports the EXACT module the backend function imports (no mirror to drift).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeEmail,
  isBrandOwnedBy,
  pickOwnedBrand,
  keepRowsForBrand,
  projectInvoice,
  projectReport,
  projectBaseline,
} from "../../base44/shared/merchantBillingScope.ts";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

const A = "a@tenant-a.com";
const B = "b@tenant-b.com";
const brandA = { id: "brand_A", contact_email: A, created_by: "service@base44" };
const brandB = { id: "brand_B", contact_email: B, created_by: "service@base44" };

describe("tenant isolation matrix — brand ownership", () => {
  it("A owns A's brand, B does not", () => {
    expect(isBrandOwnedBy(brandA, A)).toBe(true);
    expect(isBrandOwnedBy(brandA, B)).toBe(false);
    expect(isBrandOwnedBy(brandB, B)).toBe(true);
    expect(isBrandOwnedBy(brandB, A)).toBe(false);
  });

  it("ownership is case/whitespace insensitive on both pivots", () => {
    expect(isBrandOwnedBy(brandA, "  A@Tenant-A.com ")).toBe(true);
    expect(isBrandOwnedBy({ id: "x", created_by: "A@TENANT-A.COM" }, A)).toBe(true);
  });

  it("denies by default: no email, no brand, no id, no owner fields", () => {
    expect(isBrandOwnedBy(brandA, "")).toBe(false);
    expect(isBrandOwnedBy(brandA, null)).toBe(false);
    expect(isBrandOwnedBy(null, A)).toBe(false);
    expect(isBrandOwnedBy({ contact_email: A }, A)).toBe(false); // no id
    expect(isBrandOwnedBy({ id: "x" }, A)).toBe(false); // no owner
  });

  it("pickOwnedBrand never returns another tenant's brand, even first in the list", () => {
    expect(pickOwnedBrand([brandB, brandA], A)).toBe(brandA);
    expect(pickOwnedBrand([brandB], A)).toBe(null);
    expect(pickOwnedBrand([], A)).toBe(null);
    expect(pickOwnedBrand(null, A)).toBe(null);
  });

  it("normalizeEmail is total (non-strings never become a matchable value)", () => {
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(123)).toBe("");
    expect(normalizeEmail(" X@Y.COM ")).toBe("x@y.com");
  });
});

describe("tenant isolation matrix — row scoping (defense-in-depth)", () => {
  const rows = [
    { id: "i1", brand_id: "brand_A" },
    { id: "i2", brand_id: "brand_B" },
    { id: "i3" },
    { id: "i4", brand_id: "" },
  ];

  it("keeps only the resolved brand's rows", () => {
    expect(keepRowsForBrand(rows, "brand_A").map((r) => r.id)).toEqual(["i1"]);
    expect(keepRowsForBrand(rows, "brand_B").map((r) => r.id)).toEqual(["i2"]);
  });

  it("drops unattributed rows instead of assuming they are yours", () => {
    expect(keepRowsForBrand(rows, "brand_A").some((r) => !r.brand_id)).toBe(false);
  });

  it("an empty/absent brand id matches NOTHING (never everything)", () => {
    expect(keepRowsForBrand(rows, "")).toEqual([]);
    expect(keepRowsForBrand(rows, null)).toEqual([]);
    expect(keepRowsForBrand(rows, undefined)).toEqual([]);
  });
});

describe("projections are an allowlist, not a spread", () => {
  it("invoice projection drops internal accounting/tax/Stripe evidence", () => {
    const out = projectInvoice({
      id: "inv_1",
      brand_id: "brand_A",
      total_amount: 120,
      hosted_invoice_url: "https://pay",
      billing_snapshot_json: { secret: 1 },
      vies_evidence_json: { secret: 1 },
      customer_vat_number: "FR123",
      stripe_invoice_id: "in_1",
      processor_customer_id: "cus_1",
      processor_payment_intent_id: "pi_1",
      invoice_snapshot_hash: "h",
      future_field: "leak?",
    });
    expect(out.total_amount).toBe(120);
    expect(out.hosted_invoice_url).toBe("https://pay");
    for (const k of [
      "billing_snapshot_json",
      "vies_evidence_json",
      "customer_vat_number",
      "stripe_invoice_id",
      "processor_customer_id",
      "processor_payment_intent_id",
      "invoice_snapshot_hash",
      "future_field",
    ]) {
      expect(Object.keys(out)).not.toContain(k);
    }
  });

  it("report projection drops the audit snapshot and admin-only block reasons", () => {
    const out = projectReport({
      id: "r1",
      month: "2026-07",
      savings: 400,
      effective_fee_pct: 20,
      supporting_snapshot_json: { secret: 1 },
      calculation_hash: "h",
      billing_block_reason: "blocked_tax",
      resolution_warnings: "x",
      future_field: "leak?",
    });
    expect(out.savings).toBe(400);
    expect(out.effective_fee_pct).toBe(20);
    for (const k of [
      "supporting_snapshot_json",
      "calculation_hash",
      "billing_block_reason",
      "resolution_warnings",
      "future_field",
    ]) {
      expect(Object.keys(out)).not.toContain(k);
    }
  });

  it("baseline projection drops the raw provider snapshot", () => {
    const out = projectBaseline({ id: "b1", locked: true, snapshot_json: { raw: 1 }, future_field: "x" });
    expect(out.locked).toBe(true);
    expect(Object.keys(out)).not.toContain("snapshot_json");
    expect(Object.keys(out)).not.toContain("future_field");
  });

  it("projections never leak brand_id-adjacent identity of other tenants", () => {
    // brand_id itself is not part of any projection — the caller already knows
    // which brand it asked about, and echoing ids invites client-side scoping.
    expect(Object.keys(projectInvoice({ id: "x", brand_id: "brand_B" }))).not.toContain("brand_id");
    expect(Object.keys(projectReport({ id: "x", brand_id: "brand_B" }))).not.toContain("brand_id");
  });
});

describe("static tripwire — merchant pages must not read billing entities client-side", () => {
  const MERCHANT_PAGES = ["src/pages/Invoices.jsx", "src/pages/Reports.jsx"];
  const FORBIDDEN = ["Invoice", "MonthlySavingsReport", "Baseline", "BillingRule", "Mandate"];

  it("no direct entity reads of billing/contract entities on merchant pages", () => {
    const violations = [];
    for (const f of MERCHANT_PAGES) {
      const src = read(f);
      for (const e of FORBIDDEN) {
        if (new RegExp(`entities\\.${e}\\.`).test(src)) violations.push(`${f} → ${e}`);
      }
    }
    expect(
      violations,
      `Merchant pages must read billing records through getMyBillingRecords ` +
        `(server-side tenant scope), never with a client-supplied brand_id:\n  ` +
        violations.join("\n  ")
    ).toEqual([]);
  });

  it("the getter never accepts a brand_id from the request", () => {
    const src = read("base44/functions/getMyBillingRecords/entry.ts");
    expect(src).toContain("auth.me()");
    expect(src).toContain("status: 401");
    expect(src).toContain("pickOwnedBrand");
    expect(src).toContain("keepRowsForBrand");
    // No body parsing at all — there is nothing the client may influence.
    expect(src).not.toMatch(/req\.json\(\)/);
    expect(src).not.toMatch(/body\?\.brand_id|body\.brand_id/);
  });
});