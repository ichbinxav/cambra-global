// Behaviour tests for the 30-market tax engine (Task 3 of the closure brief).
//
// These execute determineTaxTreatment against real inputs — no readFileSync,
// no toContain. Every case here is one of the acceptance criteria written in
// the brief, plus the jurisdiction traps it calls out by name (EL prefix,
// Monaco→FR, Andorra/Liechtenstein outside scope, no VIES outside the EU).
import { describe, expect, it } from "vitest";
import {
  determineTaxTreatment,
  EU_ACTIVE_MARKETS,
  isReverseChargeTreatment,
  NON_EU_ACTIVE_MARKETS,
  PROTECTED_MARKETS,
  VAT_PREFIX_BY_COUNTRY,
} from "../../base44/shared/recoverTax.ts";

const CONFIG = {
  approved_by: "test-advisor",
  approved_at: "2026-09-01",
  fr_regime_confirmed: true,
  fr_standard_rate_bps: 2000,
  es_reverse_charge_confirmed: true,
  eu_reverse_charge_confirmed: true,
  non_eu_outside_scope_confirmed: true,
  einvoicing_mode: "pre_mandate",
};

const customer = (country, over = {}) => ({
  billing_country: country,
  legal_name: "ACME SL",
  billing_address_line1: "Calle 1",
  billing_postal_code: "08001",
  billing_city: "Barcelona",
  vat_number: `${VAT_PREFIX_BY_COUNTRY[country] || country}123456789`,
  tax_customer_type: "business_taxable_person",
  vies_status: "valid",
  ...over,
});

describe("market partition", () => {
  it("24 active EU + FR/BE/NL protected = EU-27 exactly", () => {
    expect(EU_ACTIVE_MARKETS).toHaveLength(24);
    expect(PROTECTED_MARKETS).toEqual(["FR", "BE", "NL"]);
    const eu27 = new Set([...EU_ACTIVE_MARKETS, ...PROTECTED_MARKETS]);
    expect(eu27.size).toBe(27);
    expect(NON_EU_ACTIVE_MARKETS).toEqual(["NO", "IS", "LI", "CH", "GB", "AD"]);
    for (const c of NON_EU_ACTIVE_MARKETS) expect(eu27.has(c)).toBe(false);
  });
});

describe("EU B2B reverse charge — the 24 active markets", () => {
  it.each([...EU_ACTIVE_MARKETS])("%s with valid VIES → EU_B2B_REVERSE_CHARGE at 0 bps", (cc) => {
    const d = determineTaxTreatment(customer(cc), CONFIG);
    expect(d.treatment).toBe("EU_B2B_REVERSE_CHARGE");
    expect(d.tax_rate_bps).toBe(0);
    expect(d.blockers).toEqual([]);
    expect(d.mentions.join(" ")).toContain("Articles 44 & 196");
  });

  it.each([...EU_ACTIVE_MARKETS])("%s with VIES invalid blocks — and NEVER falls back to French TVA", (cc) => {
    const d = determineTaxTreatment(customer(cc, { vies_status: "invalid" }), CONFIG);
    expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
    expect(d.treatment).not.toBe("FR_STANDARD_TVA");
    expect(d.blockers).toContain("vies_invalid_unresolved");
  });

  it("VIES unavailable / timeout / not_checked all block", () => {
    for (const vies_status of ["unavailable", "timeout", "not_checked"]) {
      const d = determineTaxTreatment(customer("DE", { vies_status }), CONFIG);
      expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
      expect(d.blockers.length).toBeGreaterThan(0);
    }
  });

  it("missing eu_reverse_charge_confirmed → TAX_REVIEW_REQUIRED, never a 0-rate treatment", () => {
    const cfg = { ...CONFIG, eu_reverse_charge_confirmed: false, es_reverse_charge_confirmed: false };
    const d = determineTaxTreatment(customer("DE"), cfg);
    expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
    expect(d.blockers).toContain("eu_reverse_charge_not_confirmed");
    expect(isReverseChargeTreatment(d.treatment)).toBe(false);
  });

  it("legacy es_reverse_charge_confirmed keeps ES invoicing but never widens to the other 23", () => {
    const cfg = { ...CONFIG, eu_reverse_charge_confirmed: false, es_reverse_charge_confirmed: true };
    expect(determineTaxTreatment(customer("ES"), cfg).treatment).toBe("EU_B2B_REVERSE_CHARGE");
    const de = determineTaxTreatment(customer("DE"), cfg);
    expect(de.treatment).toBe("TAX_REVIEW_REQUIRED");
    expect(de.blockers).toContain("eu_reverse_charge_not_confirmed");
  });

  it("ES keeps its Spanish reverse-charge mention", () => {
    const d = determineTaxTreatment(customer("ES"), CONFIG);
    expect(d.mentions).toContain("Autoliquidación por el destinatario");
  });
});

describe("the Greek trap — VAT prefix is EL, not GR", () => {
  it("EL123456789 is accepted for Greece", () => {
    const d = determineTaxTreatment(customer("GR", { vat_number: "EL123456789" }), CONFIG);
    expect(d.treatment).toBe("EU_B2B_REVERSE_CHARGE");
  });
  it("GR123456789 blocks — a naive startsWith(country) would have accepted it", () => {
    const d = determineTaxTreatment(customer("GR", { vat_number: "GR123456789" }), CONFIG);
    expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
    expect(d.blockers).toContain("customer_vat_prefix_mismatch");
  });
  it("a VAT number from another country never passes (DE customer, FR VAT)", () => {
    const d = determineTaxTreatment(customer("DE", { vat_number: "FR12345678901" }), CONFIG);
    expect(d.blockers).toContain("customer_vat_prefix_mismatch");
  });
});

describe("outside the scope of EU VAT — NO IS LI CH GB AD", () => {
  it.each([...NON_EU_ACTIVE_MARKETS])("%s → OUTSIDE_SCOPE_EU_VAT at 0 bps WITHOUT requiring VIES", (cc) => {
    // vies_status deliberately 'not_checked': these countries have no VIES.
    const d = determineTaxTreatment(customer(cc, { vies_status: "not_checked" }), CONFIG);
    expect(d.treatment).toBe("OUTSIDE_SCOPE_EU_VAT");
    expect(d.tax_rate_bps).toBe(0);
    expect(d.blockers).toEqual([]);
  });

  it("a registered local tax identifier is still mandatory", () => {
    const d = determineTaxTreatment(customer("CH", { vat_number: "", vies_status: "not_checked" }), CONFIG);
    expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
    expect(d.blockers).toContain("customer_local_tax_id_missing");
  });

  it("missing non_eu_outside_scope_confirmed blocks all six", () => {
    const cfg = { ...CONFIG, non_eu_outside_scope_confirmed: false };
    for (const cc of NON_EU_ACTIVE_MARKETS) {
      const d = determineTaxTreatment(customer(cc, { vies_status: "not_checked" }), cfg);
      expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
      expect(d.blockers).toContain("non_eu_outside_scope_not_confirmed");
    }
  });

  it("GB accepts an XI-prefixed identifier (Windsor Framework, services ⇒ customer is GB)", () => {
    const d = determineTaxTreatment(customer("GB", { vat_number: "XI123456789", vies_status: "not_checked" }), CONFIG);
    expect(d.treatment).toBe("OUTSIDE_SCOPE_EU_VAT");
  });
});

describe("France and Monaco", () => {
  it("FR → FR_STANDARD_TVA at the configured rate", () => {
    const d = determineTaxTreatment(customer("FR", { vat_number: "FR12345678901" }), CONFIG);
    expect(d.treatment).toBe("FR_STANDARD_TVA");
    expect(d.tax_rate_bps).toBe(2000);
    expect(d.mentions[0]).toContain("TVA 20%");
  });
  it("MC flows through the FR path — Monaco is France for VAT", () => {
    const d = determineTaxTreatment(customer("MC", { vat_number: "FR12345678901" }), CONFIG);
    expect(d.treatment).toBe("FR_STANDARD_TVA");
  });
  it("FR without the regime confirmed blocks", () => {
    const d = determineTaxTreatment(customer("FR"), { ...CONFIG, fr_regime_confirmed: false });
    expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
    expect(d.blockers).toContain("fr_tva_regime_not_confirmed");
  });
});

describe("unsupported jurisdictions", () => {
  it.each(["US", "BE", "NL", "TR", "XK"])("%s → UNSUPPORTED_JURISDICTION (outside the 30 + FR)", (cc) => {
    const d = determineTaxTreatment(customer(cc), CONFIG);
    expect(d.treatment).toBe("UNSUPPORTED_JURISDICTION");
    expect(d.blockers).toContain("billing_blocked_unsupported_jurisdiction");
  });
});

describe("fail-closed doctrine", () => {
  it("no config → TAX_REVIEW_REQUIRED, never tax = 0 by accident", () => {
    const d = determineTaxTreatment(customer("DE"), null);
    expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
    expect(d.blockers).toEqual(["tax_config_missing"]);
  });
  it("identity/address/B2B blockers accumulate and block every branch", () => {
    const broken = customer("DE", { legal_name: "", billing_city: "", tax_customer_type: "consumer" });
    const d = determineTaxTreatment(broken, CONFIG);
    expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
    expect(d.blockers).toEqual(expect.arrayContaining([
      "customer_legal_name_missing",
      "customer_billing_address_missing",
      "customer_not_confirmed_b2b",
    ]));
  });
});

describe("country_overrides — kill-switch without a deploy", () => {
  it("BLOCK stops a country even with everything else valid", () => {
    const cfg = { ...CONFIG, country_overrides: { DE: "BLOCK" } };
    const d = determineTaxTreatment(customer("DE"), cfg);
    expect(d.treatment).toBe("UNSUPPORTED_JURISDICTION");
    expect(d.blockers).toContain("billing_blocked_country_override");
  });
  it("REVIEW holds a country for manual review", () => {
    const cfg = { ...CONFIG, country_overrides: { IT: "REVIEW" } };
    const d = determineTaxTreatment(customer("IT"), cfg);
    expect(d.treatment).toBe("TAX_REVIEW_REQUIRED");
    expect(d.blockers).toContain("country_override_review");
  });
  it("an override on one country does not leak to its neighbours", () => {
    const cfg = { ...CONFIG, country_overrides: { DE: "BLOCK" } };
    expect(determineTaxTreatment(customer("AT"), cfg).treatment).toBe("EU_B2B_REVERSE_CHARGE");
  });
});

describe("reverse-charge family helper", () => {
  it("covers the generalised treatment and the deprecated ES alias, nothing else", () => {
    expect(isReverseChargeTreatment("EU_B2B_REVERSE_CHARGE")).toBe(true);
    expect(isReverseChargeTreatment("ES_EU_REVERSE_CHARGE")).toBe(true);
    expect(isReverseChargeTreatment("OUTSIDE_SCOPE_EU_VAT")).toBe(false);
    expect(isReverseChargeTreatment("FR_STANDARD_TVA")).toBe(false);
    expect(isReverseChargeTreatment("TAX_REVIEW_REQUIRED")).toBe(false);
  });
});
