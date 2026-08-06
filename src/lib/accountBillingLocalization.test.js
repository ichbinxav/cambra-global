// accountBillingLocalization.test.js — Checkpoint H (2026-08-06).
//
// Guards the /Invoices and /Account language fix, and the shared date helper the
// two pages now agree on.
//
// The date bug is the one worth freezing: /Invoices used toLocaleDateString()
// with no argument, which follows the BROWSER's locale rather than the app
// language. A French merchant on an English laptop saw English dates in an
// otherwise French page — and no missing-key warning could ever surface that.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "./locales/en.js";
import fr from "./locales/fr.js";
import es from "./locales/es.js";
import { formatNumericDate, formatLongDate, formatShortDate } from "./dateFormats";
import { INVOICE_STATUSES, invoiceStatusLabel } from "../components/invoices/invoiceLabels";
import { BRAND_FIELDS, PAYMENTS_PROFILE_FIELDS, placeholderFor } from "../components/account/accountFields";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const keysWith = (dict, prefix) => Object.keys(dict).filter((k) => k.startsWith(prefix));

describe.each([["inv_", "invoices"], ["acc_", "account"]])("%s i18n parity (%s)", (prefix) => {
  it("EN defines the keys", () => {
    expect(keysWith(en, prefix).length).toBeGreaterThan(10);
  });

  it.each([["fr", fr], ["es", es]])("%s defines every EN key", (_n, dict) => {
    const missing = keysWith(en, prefix).filter((k) => !(k in dict));
    expect(missing, `Untranslated:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it.each([["fr", fr], ["es", es]])("%s defines no key EN lacks", (_n, dict) => {
    expect(keysWith(dict, prefix).filter((k) => !(k in en))).toEqual([]);
  });

  it.each([["en", en], ["fr", fr], ["es", es]])("%s has no blank value", (_n, dict) => {
    expect(keysWith(dict, prefix).filter((k) => !String(dict[k] ?? "").trim())).toEqual([]);
  });
});

describe("invoice status labels", () => {
  const tEn = (k) => en[k] ?? k;
  const tEs = (k) => es[k] ?? k;

  it("every stored status has a label in all three languages", () => {
    const missing = [];
    for (const [name, dict] of [["en", en], ["fr", fr], ["es", es]]) {
      for (const s of INVOICE_STATUSES) if (!dict[`inv_st_${s}`]) missing.push(`${name}:inv_st_${s}`);
    }
    expect(missing, `A merchant would read the raw enum:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("maps the stored value, never prints it raw", () => {
    expect(invoiceStatusLabel(tEn, "partially_paid")).toBe("Partially paid");
    expect(invoiceStatusLabel(tEs, "partially_paid")).toBe("Parcialmente pagada");
    expect(invoiceStatusLabel(tEn, "void")).toBe("Void");
  });

  it("falls back to the de-underscored raw value for an unknown status", () => {
    expect(invoiceStatusLabel(tEn, "awaiting_mandate")).toBe("awaiting mandate");
  });

  it("returns empty for an absent status", () => {
    expect(invoiceStatusLabel(tEn, undefined)).toBe("");
    expect(invoiceStatusLabel(tEn, "")).toBe("");
  });

  it("the list still mirrors the stored enum values", () => {
    const schema = read("base44/entities/Invoice.jsonc");
    for (const s of INVOICE_STATUSES) {
      expect(schema, `Invoice schema no longer has status "${s}"`).toContain(`"${s}"`);
    }
  });
});

describe("shared date helpers — one implementation, localized", () => {
  const D = "2026-08-06T14:30:00.000Z";

  it("the numeric table date differs per language", () => {
    expect(formatNumericDate(D, "en")).toMatch(/06\/08\/2026|6\/8\/2026/);
    expect(formatNumericDate(D, "es")).toMatch(/2026/);
  });

  it("an invalid or absent date yields empty, never 'Invalid Date'", () => {
    // toLocaleDateString() — what the page used before — returns the literal
    // string "Invalid Date" here, straight into the table cell.
    expect(formatNumericDate("not-a-date", "en")).toBe("");
    expect(formatNumericDate(null, "en")).toBe("");
    expect(formatNumericDate(undefined, "fr")).toBe("");
  });

  it("an unknown language falls back to EN instead of throwing", () => {
    expect(() => formatNumericDate(D, "de")).not.toThrow();
    expect(formatNumericDate(D, "de")).toBe(formatNumericDate(D, "en"));
  });

  it("the long/short variants are localized too", () => {
    expect(formatLongDate(D, "fr").toLowerCase()).toContain("août");
    expect(formatShortDate(D, "es")).not.toBe(formatShortDate(D, "en"));
  });

  it("reportsLabels re-exports the shared helpers rather than duplicating them", () => {
    const src = read("src/components/reports/reportsLabels.js");
    expect(src).toContain('from "@/lib/dateFormats"');
    // No second Intl implementation left behind.
    expect(src).not.toContain("Intl.DateTimeFormat");
  });
});

describe("account fields — labels translated, stored names untouched", () => {
  const tEn = (k) => en[k] ?? k;

  it("every field label key resolves in all three languages", () => {
    const missing = [];
    for (const [name, dict] of [["en", en], ["fr", fr], ["es", es]]) {
      for (const f of [...BRAND_FIELDS, ...PAYMENTS_PROFILE_FIELDS]) {
        if (!dict[f.labelKey]) missing.push(`${name}:${f.labelKey}`);
        if (f.placeholderKey && !dict[f.placeholderKey]) missing.push(`${name}:${f.placeholderKey}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("the STORED field names are the original entity properties", () => {
    expect(BRAND_FIELDS.map((f) => f.field)).toEqual(["name", "website", "country"]);
    expect(PAYMENTS_PROFILE_FIELDS.map((f) => f.field)).toEqual([
      "tpe_provider", "terminal_count", "monthly_terminal_rental", "fixed_banking_fees",
      "in_store_gmv", "in_store_avg_ticket", "tpe_transaction_fee_pct",
      "contract_duration_months", "renewal_date",
    ]);
  });

  it("numeric placeholders stay raw, prose placeholders translate", () => {
    const rental = PAYMENTS_PROFILE_FIELDS.find((f) => f.field === "monthly_terminal_rental");
    expect(placeholderFor(tEn, rental)).toBe("40");
    const provider = PAYMENTS_PROFILE_FIELDS.find((f) => f.field === "tpe_provider");
    expect(placeholderFor((k) => es[k] ?? k, provider)).toBe(es.acc_tpe_provider_ph);
  });
});

describe("surface — no hardcoded English left", () => {
  it.each([
    "src/pages/Invoices.jsx",
    "src/pages/Account.jsx",
    "src/components/account/AccountFieldSection.jsx",
  ])("%s goes through useTranslation", (file) => {
    expect(read(file)).toContain("useTranslation");
  });

  it("/Invoices renders no English literal and no raw status", () => {
    const src = stripComments(read("src/pages/Invoices.jsx"));
    for (const lit of ["No invoices yet", "My Invoices", ">Pay<", "Loading…"]) {
      expect(src, `Still hardcoded: ${lit}`).not.toContain(lit);
    }
    expect(src).not.toContain("{inv.status}");
    expect(src).toContain("invoiceStatusLabel(t, inv.status)");
    expect(src).not.toContain("toLocaleDateString");
  });

  it("/Account renders no English literal, toast included", () => {
    const src = stripComments(read("src/pages/Account.jsx"));
    for (const lit of ['"Saved"', "Full name", "Sign out of CAMBRA", "Business name", "Settings · Profile"]) {
      expect(src, `Still hardcoded: ${lit}`).not.toContain(lit);
    }
    expect(src).toContain('toast.success(t("acc_saved"))');
  });
});

describe("logic untouched by the presentation fix", () => {
  it("/Invoices still reads through the server-side tenant scope", () => {
    const src = read("src/pages/Invoices.jsx");
    expect(src).toContain("invoke('getMyBillingRecords', {})");
    // Comments stripped: the file DOCUMENTS that no brand_id travels from the
    // browser, so the raw text legitimately contains the word.
    expect(stripComments(src)).not.toContain("brand_id");
  });

  it("/Account keeps its ownership-scoped queries and update calls", () => {
    const src = read("src/pages/Account.jsx");
    expect(src).toContain('Brand.filter({ created_by: u.email }, "-created_date", 1)');
    expect(src).toContain('PaymentsProfile.filter({ created_by: u.email }, "-created_date", 1)');
    expect(src).toContain("PaymentsProfile.update(paymentsProfile.id, { [field]: value })");
    expect(src).toContain("Brand.update(brand.id, { [field]: value })");
  });

  it("the field inputs still save on blur", () => {
    expect(read("src/components/account/AccountFieldSection.jsx"))
      .toContain("onBlur={(e) => onSave(f.field, e.target.value)}");
  });
});