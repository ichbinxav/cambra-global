import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "./locales/en.js";
import fr from "./locales/fr.js";
import es from "./locales/es.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("landing truth and release controls", () => {
  it("keeps public landing claims evidence-safe in every product locale", () => {
    const keys = ["hero_sub", "hero_image_alt", "prob_h2_pre", "prob_h2_kw", "prob_h2_post", "prob_intro", "prob_c1_body", "prob_c2_body", "prob_c3_body", "prob_total_line1", "prob_total_note", "ri_h2_pre", "ri_h2_kw", "ri_sub_pre"];
    const forbidden = [/40\s*[–-]\s*60/i, /2[,.]30\s*%/, /0[,.]92\s*%/, /\+14\s*%/, /minimum allowed/i, /minimum autorisé/i, /mínimo permitido/i, /GDPR compliant/i, /conforme RGPD/i, /cumple el RGPD/i, /bank-level/i, /niveau bancaire/i, /nivel bancario/i];
    for (const dict of [en, fr, es]) {
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
    expect(report.product_locales).toHaveLength(3);
    expect(report.market_rows.filter((row) => row.analyzer_status === "ENABLED").map((row) => row.market_code)).toEqual(["FR", "ES"]);
    expect(report.market_rows.every((row) => row.legal_applicability_status === "LEGAL_REVIEW_REQUIRED")).toBe(true);
    expect(report.launch_claim).toBe("NOT_GO_READY_FROM_LANDING_WORK_ALONE");
  });
});
