import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "./locales/en.js";
import fr from "./locales/fr.js";
import es from "./locales/es.js";
// I18N-30M (2026-08-15) — every new product language joins the evidence-safe
// landing-claims sweep below.
import de from "./locales/de.js";
// aliased: `it` collides with vitest's `it()` in this module's scope.
import itDict from "./locales/it.js";
import pl from "./locales/pl.js";

const PRODUCT_DICTS = [en, fr, es, de, itDict, pl];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("landing truth and release controls", () => {
  it("keeps public landing claims evidence-safe in every product locale", () => {
    const keys = ["hero_sub", "hero_image_alt", "prob_h2_pre", "prob_h2_kw", "prob_h2_post", "prob_intro", "prob_c1_body", "prob_c2_body", "prob_c3_body", "prob_total_line1", "prob_total_note", "ri_h2_pre", "ri_h2_kw", "ri_sub_pre"];
    const forbidden = [/40\s*[–-]\s*60/i, /2[,.]30\s*%/, /0[,.]92\s*%/, /\+14\s*%/, /minimum allowed/i, /minimum autorisé/i, /mínimo permitido/i, /GDPR compliant/i, /conforme RGPD/i, /cumple el RGPD/i, /bank-level/i, /niveau bancaire/i, /nivel bancario/i, /DSGVO-konform/i, /Bankniveau/i, /zulässiges Minimum/i, /conforme al GDPR/i, /livello bancario/i, /minimo consentito/i, /zgodne z RODO/i, /poziom bankowy/i, /dozwolone minimum/i];
    for (const dict of PRODUCT_DICTS) {
      const copy = keys.map((key) => dict[key]).join(" ");
      for (const pattern of forbidden) expect(copy).not.toMatch(pattern);
    }
  });

  it("uses one homepage schema authority and no duplicate landing injector", () => {
    const landing = read("src/pages/Landing.jsx");
    expect(landing).not.toContain("LANDING_JSON_LD");
    expect(landing).not.toContain("cambra-landing-jsonld");
    expect(read("index.html")).toContain("CAMBRA payment cost audit and recovery");
  });

  it("defaults optional consent off and exposes accept, reject, manage and withdrawal", () => {
    const consent = read("src/components/shared/CookieConsent.jsx");
    const cookies = read("src/pages/Cookies.jsx");
    expect(consent).toContain("useState(false)");
    expect(consent).toContain("rejectOptional");
    expect(consent).toContain("CONSENT_VERSION");
    expect(consent).toContain("cambra:consent-updated");
    expect(cookies).toContain("cambra:open-cookie-settings");
  });

  it("ships a complete machine-readable 33-market release matrix", () => {
    const report = JSON.parse(read("src/docs/CAMBRA_LANDING_READINESS.json"));
    expect(report.market_rows).toHaveLength(33);
    // I18N-30M — the report must carry EXACTLY the registered product locales
    // (source: config/europe-locales.json). Deriving the expectation keeps the
    // check exact through the 30-market language rollout without a magic 3.
    const registered = JSON.parse(read("config/europe-locales.json")).productLocales;
    expect(report.product_locales).toHaveLength(registered.length);
    expect(registered.length).toBeGreaterThanOrEqual(3);
    expect(report.market_rows.filter((row) => row.analyzer_status === "ENABLED").map((row) => row.market_code)).toEqual(["FR", "ES"]);
    expect(report.market_rows.every((row) => row.legal_applicability_status === "LEGAL_REVIEW_REQUIRED")).toBe(true);
    expect(report.launch_claim).toBe("NOT_GO_READY_FROM_LANDING_WORK_ALONE");
  });
});
