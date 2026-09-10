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
import pt from "./locales/pt.js";
import el from "./locales/el.js";
import sv from "./locales/sv.js";
import da from "./locales/da.js";
import fi from "./locales/fi.js";
import cs from "./locales/cs.js";
import ro from "./locales/ro.js";
import hu from "./locales/hu.js";
import bg from "./locales/bg.js";
import hr from "./locales/hr.js";
import et from "./locales/et.js";
import lv from "./locales/lv.js";
import lt from "./locales/lt.js";
import sk from "./locales/sk.js";
import sl from "./locales/sl.js";
import nb from "./locales/nb.js";
import isDict from "./locales/is.js";

const PRODUCT_DICTS = [en, fr, es, de, itDict, pl, pt, el, sv, da, fi, cs, ro, hu, bg, hr, et, lv, lt, sk, sl, nb, isDict];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

describe("landing truth and release controls", () => {
  it("keeps public landing claims evidence-safe in every product locale", () => {
    const keys = ["hero_sub", "hero_image_alt", "prob_h2_pre", "prob_h2_kw", "prob_h2_post", "prob_intro", "prob_c1_body", "prob_c2_body", "prob_c3_body", "prob_total_line1", "prob_total_note", "ri_h2_pre", "ri_h2_kw", "ri_sub_pre"];
    const forbidden = [/40\s*[–-]\s*60/i, /2[,.]30\s*%/, /0[,.]92\s*%/, /\+14\s*%/, /minimum allowed/i, /minimum autorisé/i, /mínimo permitido/i, /GDPR compliant/i, /conforme RGPD/i, /cumple el RGPD/i, /bank-level/i, /niveau bancaire/i, /nivel bancario/i, /DSGVO-konform/i, /Bankniveau/i, /zulässiges Minimum/i, /conforme al GDPR/i, /livello bancario/i, /minimo consentito/i, /zgodne z RODO/i, /poziom bankowy/i, /dozwolone minimum/i, /conforme com o RGPD/i, /nível bancário/i, /mínimo permitido/i, /συμβατό με GDPR/i, /τραπεζικού επιπέδου/i, /επιτρεπόμενο ελάχιστο/i, /GDPR-kompatibel/i, /banknivå/i, /tillåtet minimum/i, /bankniveau/i, /tilladt minimum/i, /GDPR-yhteensopiva/i, /pankkitason/i, /sallittu minimi/i, /v souladu s GDPR/i, /bankovní úrovně/i, /povolené minimum/i, /conform GDPR/i, /nivel bancar/i, /minimul permis/i, /GDPR-kompatibilis/i, /banki szint/i, /megengedett minimum/i, /съвместимо с GDPR/i, /банково ниво/i, /разрешен минимум/i, /usklađeno s GDPR-om/i, /bankovna razina/i, /dopušteni minimum/i, /GDPR-iga kooskõlas/i, /pangatasemel/i, /lubatud miinimum/i, /atbilst GDPR/i, /bankas līmeņa/i, /atļautais minimums/i, /atitinka GDPR/i, /banko lygio/i, /leidžiamas minimumas/i, /v súlade s GDPR/i, /bankovej úrovne/i, /povolené minimum/i, /skladno z GDPR/i, /bančne ravni/i, /dovoljeni minimum/i, /GDPR-kompatibel/i, /banknivå/i, /tillatt minimum/i, /í samræmi við GDPR/i, /bankastigs/i, /leyfilegt lágmark/i];
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

  it("keeps the desktop landing wide without overlapping approved visuals", () => {
    const landing = read("src/pages/Landing.jsx");
    const stack = read("src/components/landing/TheStackSection.jsx");
    const security = read("src/components/landing/TrustSecuritySection.jsx");
    const assets = read("src/lib/brandAssets.js");
    const headings = read("src/components/landing/SectionHeading.jsx");
    const navbar = read("src/components/landing/Navbar.jsx");
    const mobileNav = read("src/components/landing/MobileNavMenu.jsx");
    expect(landing).toContain("cambra-public-container");
    expect(landing).toContain("md:grid-cols-3");
    expect(landing).toContain("BRAND_ASSETS.landingHero");
    expect(security).toContain("BRAND_ASSETS.securityDataPrism");
    expect(assets).toContain("/images/cambra-hero-5m-sleek-transparent-final.png");
    expect(assets).toContain("/images/cambra-intelligence-layers-approved.webp");
    expect(assets).toContain("/images/cambra-security-keyhole-approved.webp");
    expect(assets).toContain("/images/cambra-impact-5m-approved.webp");
    expect(fs.existsSync(path.join(root, "public/images/cambra-intelligence-layers-approved.webp"))).toBe(true);
    expect(fs.existsSync(path.join(root, "public/images/cambra-security-keyhole-approved.webp"))).toBe(true);
    expect(fs.existsSync(path.join(root, "public/images/cambra-impact-5m-approved.webp"))).toBe(true);
    expect(landing).not.toContain("cambra-fee-audit-24m-v3.png");
    expect(stack).not.toContain("cambra-intelligence-stack-v2.png");
    expect(read("src/components/landing/RealImpactSection.jsx")).toContain('t("ri_illustrative")');
    expect(landing).toContain("clamp(44px, 3.85vw, 68px)");
    expect(landing).toContain("max-w-[760px]");
    expect(landing).not.toContain("min-[1180px]:w-[120%]");
    expect(landing).not.toContain("min-[1180px]:-translate-x");
    expect(stack).toContain("BRAND_ASSETS.intelligenceStack");
    expect(landing).toContain('to="/Analyzer"');
    expect(landing).not.toContain("MarketAvailabilitySection");
    expect(landing).toContain("<HeroTrustStrip />");
    expect(landing).toContain("<TheStackSection />");
    expect(landing).toContain("<AudienceSection />");
    expect(landing).toContain("<BookCallModal");
    expect(landing).toContain("<RealImpactSection embedded />");
    expect(landing).not.toContain("<ProblemSectionWow />");
    expect(landing).not.toContain("hero_visual_title");
    expect(headings).toContain('align = "center"');
    expect(headings).toContain("clamp(32px, 5vw, 64px)");
    expect(navbar).toContain('className="hidden xl:flex items-center gap-1"');
    expect(navbar).toContain('className="xl:hidden flex items-center gap-1"');
    expect(mobileNav).toContain('className="absolute inset-x-0 top-[72px]');
    expect(mobileNav).toContain('max-h-[calc(100vh-72px)]');
    expect(mobileNav).toContain('overflow-y-auto overflow-x-hidden');
    expect(mobileNav).toContain('xl:hidden');
  });

  it("keeps the homepage narrative in the founder-approved order", () => {
    const landing = read("src/pages/Landing.jsx");
    const sections = [
      "<Hero onBookDemo=",
      "<HeroTrustStrip />",
      "<HowItWorksSection />",
      "<TheStackSection />",
      "<TrustSecuritySection />",
      "<AudienceSection />",
      "<PricingDual />",
      "<StopLeavingMarginCTA",
      "<LandingFooter />",
    ];
    const positions = sections.map((section) => landing.indexOf(section));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(landing).not.toContain("ReferralProgramSection");
    expect(landing).not.toContain("FounderLetter");
  });

  it("ships the sharper 24-month hero copy in every product locale", () => {
    for (const dict of PRODUCT_DICTS) {
      expect(dict.hero_badge).toBeTruthy();
      expect(dict.hero_h1_line1).toBeTruthy();
      expect(dict.hero_h1_line2).toBeTruthy();
      expect(dict.hero_audience).toBeTruthy();
      expect(dict.landing_audience_other).toBeTruthy();
      expect(dict.hero_image_alt).toContain("CAMBRA");
      expect(dict.hero_image_alt).not.toMatch(/(?:€?5\s?M|2[,.]70|1[,.]70|100[.,\s]?000|24\s(?:month|mes))/i);
      expect(dict.stack_eyebrow).not.toMatch(/PAYMENTS WEDGE/i);
    }
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
