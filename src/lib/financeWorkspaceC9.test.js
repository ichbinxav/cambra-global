// DASHBOARD-C9 (2026-08-17) — the Finance workspace, and the defects C9 found in C8.
//
// Three of these describe blocks exist because C8 shipped with real bugs that its own
// tests could not catch:
//
//   1. `figure()` never called `consolidate`, so a set spanning EUR and GBP reported
//      one confident number. The C8 test fixtures carried no currency at all.
//   2. `buildFinanceSnapshot` read `savings_minor` and `amount_paid_minor`, which do
//      not exist on MonthlySavingsReport or Invoice. Those entities store MAJOR units.
//      The fixtures invented the fields, so the tests agreed with the bug.
//   3. `computeMargin` added merchant and provider revenue without checking they were
//      denominated in the same currency.
//
// The fourth block is the one that matters most operationally: an address form was
// clearing the B2B tax gate that recoverTax.ts:224 uses to refuse invoicing.
import { describe, expect, it } from "vitest";
import { computeMargin, figure, toMinor } from "../../base44/shared/financeCore.ts";
import {
  applyBillingIdentity, BILLING_IDENTITY_FIELDS, BILLING_PROTECTED_FIELDS,
  buildMonthlySeries, buildRevenueProjection, confirmB2bStatus, FINANCE_TABS,
  previewBillingIdentity, readBillingIdentity, tabCombinationNote,
} from "../../base44/shared/financeWorkspaceCore.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (value) => `h:${JSON.stringify(value).length}:${JSON.stringify(value).slice(0, 24)}`;

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {}; const updates = [];
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      async list() { if (broken.includes(name)) throw new Error("down"); return stores[name].map((r) => ({ ...r })); },
      async filter(where) {
        if (broken.includes(name)) throw new Error("down");
        return stores[name].filter((r) => Object.entries(where || {}).every(([k, v]) => r[k] === v)).map((r) => ({ ...r }));
      },
      async update(id, patch) {
        if (broken.includes(`${name}:update`)) throw new Error("write refused");
        updates.push({ entity: name, id, patch });
        const row = stores[name].find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        return row;
      },
    };
    return built[name];
  };
  return { stores, updates, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

describe("C9 — unit conversion is explicit, because this repo stores both", () => {
  it("converts a MAJOR-unit float to cents", () => {
    expect(toMinor(4000, "MAJOR")).toBe(400000);
    expect(toMinor(12.34, "MAJOR")).toBe(1234);
    // 12.345 * 100 is 1234.5 in floating point; a half cent does not exist.
    expect(toMinor(12.345, "MAJOR")).toBe(1235);
  });

  it("passes a MINOR-unit value through", () => {
    expect(toMinor(1234, "MINOR")).toBe(1234);
  });

  it("keeps absent as absent in both units", () => {
    for (const unit of ["MAJOR", "MINOR"]) {
      expect(toMinor(null, unit)).toBeNull();
      expect(toMinor(undefined, unit)).toBeNull();
      expect(toMinor("", unit)).toBeNull();
    }
  });

  it("keeps a real zero", () => {
    expect(toMinor(0, "MAJOR")).toBe(0);
  });
});

describe("C9 — a figure refuses to sum across currencies", () => {
  const rows = (pairs) => pairs.map(([amount_minor, currency]) => ({ amount_minor, currency }));

  it("reports a single-currency total with its currency", () => {
    const out = figure({
      metric_key: "x", domain: "MERCHANT_REVENUE", basis: "COLLECTED",
      rows: rows([[100, "EUR"], [200, "EUR"]]), field: "amount_minor", truth_class: "VERIFIED",
    });
    expect(out.amount_minor).toBe(300);
    expect(out.currency).toBe("EUR");
    expect(out.mixed_currency).toBe(false);
  });

  it("reports NO total across currencies, keeps the breakdown, and drops to UNKNOWN", () => {
    const out = figure({
      metric_key: "x", domain: "MERCHANT_REVENUE", basis: "COLLECTED",
      rows: rows([[100, "EUR"], [200, "GBP"]]), field: "amount_minor", truth_class: "VERIFIED",
    });
    // This is the C8 bug: it used to return 300 and call it VERIFIED.
    expect(out.amount_minor).toBeNull();
    expect(out.amount_minor).not.toBe(300);
    expect(out.mixed_currency).toBe(true);
    expect(out.by_currency).toEqual({ EUR: 100, GBP: 200 });
    expect(out.truth_class).toBe("UNKNOWN");
    expect(out.claim_boundary).toContain("not money");
  });

  it("knowing every component does not mean knowing the total", () => {
    const out = figure({
      metric_key: "x", domain: "COSTS", basis: "ACCRUED",
      rows: rows([[100, "EUR"], [200, "USD"]]), field: "amount_minor", truth_class: "OBSERVED",
    });
    // Completeness is about rows; the currency conflict is about addability.
    expect(out.completeness).toBe("COMPLETE");
    expect(out.amount_minor).toBeNull();
  });

  it("suppresses the total when a row carries an amount but no currency", () => {
    const out = figure({
      metric_key: "x", domain: "COSTS", basis: "ACCRUED",
      rows: rows([[100, "EUR"], [50, ""]]), field: "amount_minor", truth_class: "OBSERVED",
    });
    expect(out.amount_minor).toBeNull();
    expect(out.currency_unknown_rows).toBe(1);
  });

  it("treats an empty set from a COMPLETE read as a real zero, not an unknown", () => {
    const out = figure({
      metric_key: "x", domain: "MERCHANT_REVENUE", basis: "COLLECTED",
      rows: [], field: "amount_minor", truth_class: "VERIFIED", rows_source_complete: true,
    });
    // "No paid invoices exist" is a fact. Rendering it as unknown teaches an operator
    // to ignore unknowns, which is how the real ones stop being read.
    expect(out.amount_minor).toBe(0);
    expect(out.completeness).toBe("COMPLETE");
    expect(out.claim_boundary).toContain("real zero");
  });

  it("still reports UNKNOWN for an empty set when the read is not declared complete", () => {
    const out = figure({
      metric_key: "x", domain: "MERCHANT_REVENUE", basis: "COLLECTED",
      rows: [], field: "amount_minor", truth_class: "VERIFIED",
    });
    expect(out.amount_minor).toBeNull();
    expect(out.truth_class).toBe("UNKNOWN");
  });
});

describe("C9 — margin refuses to cross currencies", () => {
  const fig = (amount, currency, completeness = "COMPLETE") => ({
    metric_key: "f", domain: "MERCHANT_REVENUE", basis: "COLLECTED",
    amount_minor: amount, currency, counted: 1, missing: 0, completeness,
    mixed_currency: false, by_currency: {}, currency_unknown_rows: 0,
    truth_class: "VERIFIED", claim_boundary: "",
  });

  it("computes a margin when all three sides share one currency", () => {
    const out = computeMargin({
      merchantRevenue: fig(1000, "EUR"), providerRevenue: fig(500, "EUR"), costs: fig(300, "EUR"),
    });
    expect(out.margin_minor).toBe(1200);
    expect(out.currency).toBe("EUR");
  });

  it("refuses when the cost side is in another currency", () => {
    const out = computeMargin({
      merchantRevenue: fig(1000, "EUR"), providerRevenue: fig(500, "EUR"), costs: fig(300, "GBP"),
    });
    // Subtracting a GBP cost from EUR revenue produces a number with no unit, and it
    // would have been printed as a margin.
    expect(out.margin_minor).toBeNull();
    expect(out.currency).toBeNull();
    expect(out.truth_class).toBe("UNKNOWN");
    expect(out.claim_boundary).toContain("EUR and GBP");
  });

  it("refuses when a side carries an amount with no currency", () => {
    const out = computeMargin({
      merchantRevenue: fig(1000, "EUR"), providerRevenue: fig(500, null), costs: fig(300, "EUR"),
    });
    expect(out.margin_minor).toBeNull();
    expect(out.claim_boundary).toContain("no currency");
  });

  it("ignores the currency of a side that carries no amount", () => {
    const out = computeMargin({
      merchantRevenue: fig(1000, "EUR"), providerRevenue: fig(null, null, "UNKNOWN"), costs: fig(300, "EUR"),
    });
    expect(out.margin_minor).toBe(700);
  });
});

describe("C9 — the revenue projection replaces the browser arithmetic", () => {
  const rows = {
    MonthlySavingsReport: [
      { id: "r1", verification_status: "realized", savings: 4000, currency: "EUR", provider_id: "p1" },
      { id: "r2", verification_status: "estimated", savings: 9999, currency: "EUR", provider_id: "p1" },
    ],
    Invoice: [
      { id: "i1", status: "paid", total_amount: 800, amount_paid: 800, currency: "EUR", provider_id: "p1", paid_at: "2026-08-04T10:00:00.000Z", deal_activation_id: "d1" },
      { id: "i2", status: "issued", total_amount: 200, currency: "EUR", provider_id: "p1", deal_activation_id: "d2" },
    ],
    DealActivation: [{ id: "d1", status: "live" }, { id: "d2", status: "churned" }],
    Provider: [{ id: "p1", name: "Stripe" }],
  };

  it("keeps billed and collected as separate figures", async () => {
    const out = await buildRevenueProjection({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    const byKey = new Map(out.kpis.map((k) => [k.metric_key, k]));
    // 800 + 200 billed; only 800 received. The old page showed one number for both.
    expect(byKey.get("merchant_revenue_invoiced").value).toBe(100000);
    expect(byKey.get("merchant_revenue_collected").value).toBe(80000);
  });

  it("excludes savings that are not realized", async () => {
    const out = await buildRevenueProjection({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    const savings = out.kpis.find((k) => k.metric_key === "realized_savings");
    expect(savings.value).toBe(400000);
  });

  it("never carries a KPI equal to savings plus revenue", async () => {
    const out = await buildRevenueProjection({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    // 400000 + 100000 is the double count that would look most plausible.
    expect(out.kpis.some((k) => k.value === 500000)).toBe(false);
    expect(out.combination_rule).toContain("counts the same euro twice");
  });

  it("keeps savings and revenue in separate columns per provider", async () => {
    const out = await buildRevenueProjection({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    const row = out.items.rows.find((r) => r.provider_id === "p1");
    expect(row.realized_savings_minor).toBe(400000);
    expect(row.revenue_invoiced_minor).toBe(100000);
    expect(row.provider_name).toBe("Stripe");
    expect(row.combination_note).toContain("same euro twice");
  });

  it("reports an unnamed provider as unnamed rather than printing its id as a name", async () => {
    const out = await buildRevenueProjection({
      svc: makeSvc({ ...rows, Provider: [] }), now: NOW, contextId: "c",
    });
    const row = out.items.rows.find((r) => r.provider_id === "p1");
    expect(row.provider_name_known).toBe(false);
  });

  it("reports null counts and no rows when a source is unreadable", async () => {
    const out = await buildRevenueProjection({
      svc: makeSvc(rows, ["Invoice"]), now: NOW, contextId: "c",
    });
    const byKey = new Map(out.kpis.map((k) => [k.metric_key, k]));
    // An unreadable Invoice source is not zero invoices.
    expect(byKey.get("contracts_with_revenue").value).toBeNull();
    expect(byKey.get("merchant_revenue_collected").value).toBeNull();
    expect(out.items.total).toBeNull();
    expect(out.context.degraded_sources).toContain("Invoice");
  });

  it("counts only live activations, and null when that source failed", async () => {
    const ok = await buildRevenueProjection({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    expect(ok.kpis.find((k) => k.metric_key === "live_activations").value).toBe(1);
    const broken = await buildRevenueProjection({ svc: makeSvc(rows, ["DealActivation"]), now: NOW, contextId: "c" });
    expect(broken.kpis.find((k) => k.metric_key === "live_activations").value).toBeNull();
  });
});

describe("C9 — the monthly series is UTC and reports what it cannot plot", () => {
  it("buckets a payment by its UTC month", () => {
    const series = buildMonthlySeries(
      [{ amount_paid: 100, currency: "EUR", paid_at: "2026-08-31T23:30:00.000Z" }],
      "2026-08-17T12:00:00.000Z",
    );
    const august = series.find((row) => row.month === "2026-08");
    // Bucketed by local month, this payment lands in September for any operator east
    // of London.
    expect(august.amount_minor).toBe(10000);
  });

  it("returns six months ending with the anchor month", () => {
    const series = buildMonthlySeries([], NOW);
    expect(series).toHaveLength(6);
    expect(series[5].month).toBe("2026-08");
    expect(series[0].month).toBe("2026-03");
  });

  it("reports a genuinely empty month as zero", () => {
    const series = buildMonthlySeries([], NOW);
    expect(series[0].amount_minor).toBe(0);
  });

  it("reports null for a month whose invoices span currencies", () => {
    const series = buildMonthlySeries([
      { amount_paid: 100, currency: "EUR", paid_at: "2026-08-04T00:00:00.000Z" },
      { amount_paid: 100, currency: "GBP", paid_at: "2026-08-05T00:00:00.000Z" },
    ], NOW);
    const august = series.find((row) => row.month === "2026-08");
    // A zero bar would read as "no revenue in August".
    expect(august.amount_minor).toBeNull();
    expect(august.mixed_currency).toBe(true);
  });
});

describe("C9 — the B2B tax gate cannot be cleared by an address form", () => {
  const brand = (extra = {}) => ({
    id: "b1", billing_legal_name: "Acme SAS", billing_address_line1: "1 rue X",
    billing_postal_code: "75001", billing_city: "Paris", billing_country: "FR",
    vat_number: "FR12345678901", vies_status: "valid",
    tax_customer_type: "business_taxable_person", tax_evidence_status: "vies_validated",
    ...extra,
  });

  it("does not accept tax_customer_type as an editable field", () => {
    expect([...BILLING_IDENTITY_FIELDS]).not.toContain("tax_customer_type");
    const protectedField = BILLING_PROTECTED_FIELDS.find((row) => row.field === "tax_customer_type");
    expect(protectedField.why).toContain("recoverTax.ts:224");
  });

  it("refuses a patch that tries to write a protected field, and says which", async () => {
    const out = await previewBillingIdentity({
      svc: makeSvc({ Brand: [brand()] }), brand_id: "b1",
      patch: { billing_city: "Lyon", tax_customer_type: "business_taxable_person" }, sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("protected_field_in_patch");
    expect(out.reason).toContain("requiring evidence");
  });

  it("names a field that would be cleared, which the old whole-form write did silently", async () => {
    const out = await previewBillingIdentity({
      svc: makeSvc({ Brand: [brand()] }), brand_id: "b1",
      patch: { vat_number: "" }, sha256,
    });
    expect(out.ok).toBe(true);
    expect(out.preview.changes[0].clears_existing_value).toBe(true);
    expect(out.preview.revokes_b2b_confirmation).toBe(true);
  });

  it("revokes the B2B confirmation and the VIES result when the VAT number changes", async () => {
    const svc = makeSvc({ Brand: [brand()] });
    const preview = await previewBillingIdentity({
      svc, brand_id: "b1", patch: { vat_number: "FR99999999999" }, sha256,
    });
    const out = await applyBillingIdentity({
      svc, actor: "founder@cambra", brand_id: "b1", patch: { vat_number: "FR99999999999" },
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    expect(out.ok).toBe(true);
    const stored = svc.stores.Brand[0];
    // A VIES validation attests to ONE number. It is not "still valid" for another.
    expect(stored.vies_status).toBe("not_checked");
    expect(stored.tax_customer_type).toBeNull();
    expect(stored.tax_evidence_status).toBe("vat_id_provided");
    expect(stored.vat_number_normalized).toBe("FR99999999999");
    expect(out.b2b_confirmation_revoked).toBe(true);
  });

  it("leaves the confirmation alone when only the address changes", async () => {
    const svc = makeSvc({ Brand: [brand()] });
    const preview = await previewBillingIdentity({ svc, brand_id: "b1", patch: { billing_city: "Lyon" }, sha256 });
    await applyBillingIdentity({
      svc, actor: "a", brand_id: "b1", patch: { billing_city: "Lyon" },
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    const stored = svc.stores.Brand[0];
    expect(stored.billing_city).toBe("Lyon");
    expect(stored.tax_customer_type).toBe("business_taxable_person");
    expect(stored.vies_status).toBe("valid");
  });

  it("refuses to apply a change the operator did not see", async () => {
    const svc = makeSvc({ Brand: [brand()] });
    const out = await applyBillingIdentity({
      svc, actor: "a", brand_id: "b1", patch: { billing_city: "Lyon" },
      expected_preview_hash: "stale", now: NOW, sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("preview_hash_mismatch");
    expect(svc.updates).toHaveLength(0);
  });

  it("refuses a country outside the two the entity supports", async () => {
    const out = await previewBillingIdentity({
      svc: makeSvc({ Brand: [brand()] }), brand_id: "b1",
      patch: { billing_country: "DE" }, sha256,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("country_not_billable");
    expect(out.reason).toContain("no determined tax treatment");
  });

  it("tells an unreadable Brand apart from a missing one", async () => {
    const missing = await previewBillingIdentity({
      svc: makeSvc({ Brand: [] }), brand_id: "b1", patch: { billing_city: "X" }, sha256,
    });
    expect(missing.error).toBe("brand_not_found");
    const unreadable = await previewBillingIdentity({
      svc: makeSvc({ Brand: [brand()] }, ["Brand"]), brand_id: "b1", patch: { billing_city: "X" }, sha256,
    });
    expect(unreadable.error).toBe("brand_unreadable");
  });
});

describe("C9 — confirming B2B status requires evidence that exists", () => {
  const base = {
    id: "b1", billing_country: "FR", billing_legal_name: "Acme",
    tax_evidence_status: "none", vies_status: "not_checked",
  };

  it("refuses with no VAT number, and writes nothing", async () => {
    const svc = makeSvc({ Brand: [{ ...base }] });
    const out = await confirmB2bStatus({ svc, actor: "a", brand_id: "b1", now: NOW });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("b2b_status_not_demonstrable");
    expect(out.reason).toContain("which is the correct outcome, not a bug");
    // A refused confirmation must leave the record exactly as it was.
    expect(svc.updates).toHaveLength(0);
    expect(svc.stores.Brand[0].tax_customer_type).toBeUndefined();
  });

  it("refuses a Spanish customer whose VAT number was never validated", async () => {
    const svc = makeSvc({ Brand: [{ ...base, billing_country: "ES", vat_number: "ESB12345678" }] });
    const out = await confirmB2bStatus({ svc, actor: "a", brand_id: "b1", now: NOW });
    expect(out.ok).toBe(false);
    expect(out.next_step).toBe("checkVatVies");
    expect(svc.updates).toHaveLength(0);
  });

  it("confirms against a VIES validation and records that evidence class", async () => {
    const svc = makeSvc({ Brand: [{ ...base, billing_country: "ES", vat_number: "ESB12345678", vies_status: "valid" }] });
    const out = await confirmB2bStatus({ svc, actor: "a", brand_id: "b1", now: NOW });
    expect(out.ok).toBe(true);
    expect(out.tax_evidence_status).toBe("vies_validated");
    expect(svc.stores.Brand[0].tax_customer_type).toBe("business_taxable_person");
  });

  it("records the WEAKER evidence class for a French VAT number, without upgrading it", async () => {
    const svc = makeSvc({ Brand: [{ ...base, vat_number: "FR12345678901" }] });
    const out = await confirmB2bStatus({ svc, actor: "a", brand_id: "b1", now: NOW });
    expect(out.ok).toBe(true);
    expect(out.tax_evidence_status).toBe("vat_id_provided");
    expect(out.claim_boundary).toContain("no VIES validation was performed");
  });

  it("records a manual fiscal approval as alternative evidence, not as a VIES result", async () => {
    const svc = makeSvc({ Brand: [{ ...base, billing_country: "ES", vat_number: "ESB1", vies_status: "manual_review_approved" }] });
    const out = await confirmB2bStatus({ svc, actor: "a", brand_id: "b1", now: NOW });
    expect(out.tax_evidence_status).toBe("alternative_evidence_approved");
  });
});

describe("C9 — the billing identity read exposes only the fiscal fields", () => {
  it("does not hand the whole Brand to a fiscal form", async () => {
    const svc = makeSvc({
      Brand: [{
        id: "b1", billing_country: "FR", billing_legal_name: "Acme",
        stripe_customer_id: "cus_secret", monthly_volume: 999, contact_email: "x@y.z",
      }],
    });
    const out = await readBillingIdentity({ svc, brand_id: "b1" });
    expect(out.ok).toBe(true);
    expect(out.brand.stripe_customer_id).toBeUndefined();
    expect(out.brand.monthly_volume).toBeUndefined();
    expect(out.brand.contact_email).toBeUndefined();
    expect(out.brand.billing_legal_name).toBe("Acme");
    expect(out.billable_countries).toEqual(["FR", "ES"]);
  });
});

describe("C9 — the tab registry is the single source of the workspace shape", () => {
  it("declares the six tabs and which legacy page each absorbs", () => {
    expect(FINANCE_TABS.map((tab) => tab.key)).toEqual([
      "overview", "revenue", "control-tower", "merchant-billing", "provider-economics", "unit-economics",
    ]);
    const hosted = FINANCE_TABS.filter((tab) => tab.hosts).map((tab) => tab.hosts);
    expect(hosted).toEqual(["/admin/revenue", "/admin/finance", "/admin/recover-billing", "/admin/provider-economics"]);
  });

  it("carries a side-by-side note on a tab whose domains must not be summed", () => {
    expect(tabCombinationNote("revenue")).toContain("never as one total");
    expect(tabCombinationNote("unit-economics")).toContain("never as one total");
  });

  it("carries no note on a single-domain tab", () => {
    expect(tabCombinationNote("provider-economics")).toBeNull();
    expect(tabCombinationNote("merchant-billing")).toBeNull();
  });

  it("returns null for a tab that does not exist", () => {
    expect(tabCombinationNote("made-up")).toBeNull();
  });
});
