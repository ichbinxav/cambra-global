import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "./locales/en.js";
import fr from "./locales/fr.js";
import es from "./locales/es.js";
import de from "./locales/de.js";
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
import { computePaymentsNextAction, NEXT_ACTION_INTENT } from "./paymentsNextAction.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const dictionaries = {
  en, fr, es, de, it: itDict, pl, pt, el, sv, da, fi, cs, ro, hu,
  bg, hr, et, lv, lt, sk, sl, nb, is: isDict,
};

const FRIENDLY_KEYS = [
  "dash_home_eyebrow",
  "dash_home_title",
  "dash_home_sub",
  "dash_journey_title",
  "dash_journey_sub",
  "dash_verify_no_estimate",
];

describe("friendly user dashboard localization", () => {
  it.each(Object.entries(dictionaries))("%s has every new dashboard message", (_lang, dictionary) => {
    for (const key of FRIENDLY_KEYS) {
      expect(String(dictionary[key] || "").trim(), key).not.toBe("");
    }
    expect(dictionary.dash_home_title).toContain("{name}");
  });
});

describe("honest payment action priority", () => {
  const zeroResult = {
    details: { engine_result: { annual_savings_eur: { point: 0 }, cohort: { channel: "online" } } },
  };

  it("asks for verification when an estimated result is zero", () => {
    const action = computePaymentsNextAction({ available: false }, {
      ...zeroResult,
      verification_status: "estimated",
    });
    expect(action.intent).toBe(NEXT_ACTION_INTENT.VERIFY_CONNECT);
  });

  it("only calls a zero result optimized after verification", () => {
    const action = computePaymentsNextAction({ available: false }, {
      ...zeroResult,
      verification_status: "verified",
    });
    expect(action.intent).toBe(NEXT_ACTION_INTENT.MONITOR_DRIFT);
  });
});

describe("friendly dashboard release surface", () => {
  it("uses the new journey and keeps detailed financial panels dark", () => {
    const source = read("src/pages/Dashboard.jsx");
    expect(source).toContain("DashboardWelcome");
    expect(source).toContain("linear-gradient(145deg,#111126,#071322)");
    expect(source).not.toContain("{/* Quick actions */}");
  });

  it("uses the light workspace canvas across the friendly merchant routes", () => {
    const source = read("src/components/dashboard/DashboardLayout.jsx");
    expect(source).toContain("isLightWorkspace");
    expect(source).toContain('"/account"');
    expect(source).toContain('"/referrals"');
    expect(source).toContain("#F7F8FC");
    expect(source).toContain("#0B0E1A");
  });

  it("does not present an unverified zero as an identified opportunity", () => {
    const source = read("src/components/dashboard/DashboardHeroV2.jsx");
    expect(source).toContain("canShowOpportunity");
    expect(source).toContain("dash_verify_no_estimate");
    expect(source).toContain("!isVerified ?");
  });

  it("uses the latest Stripe-verified analysis as the dashboard source of truth", () => {
    const source = read("src/pages/Dashboard.jsx");
    expect(source).toContain("function dashboardResultFromVerified(payload)");
    expect(source).toContain('invoke("getPaymentsAnalysisVerified", { brand_id: b.id, latest: true })');
    expect(source).toContain('verification_status: "verified"');
    expect(source).toContain("const latestResult = verifiedResult || results[0] || null");
  });

  it("lets a referrer preview their own invite without an invalid-code warning", () => {
    const source = read("src/components/referrals/ReferralAttributionCapture.jsx");
    expect(source).toContain('body?.reason === "self_referral"');
    expect(source).toContain('window.location.pathname.toLowerCase() === "/invite"');
    expect(source).toContain('toast.error(t("ref_code_rejected"), t("ref_code_rejected_body"))');
  });

  it("routes statement upload to a localized, high-contrast upload surface", () => {
    const connectTools = read("src/pages/ConnectTools.jsx");
    const uploadPage = read("src/pages/UploadStatement.jsx");
    const upload = read("src/components/paymentsAnalyzer/StatementUploadCard.jsx");
    expect(connectTools).toContain('requestedMode === "upload"');
    expect(uploadPage).toContain('<ConnectTools mode="upload" />');
    expect(connectTools).toContain('uploadMode ? t("az_entry_upload_title") : t("ct_page_title")');
    expect(connectTools).toContain('uploadMode ? t("az_entry_upload_body") : t("ct_page_sub")');
    expect(connectTools).toContain('toLocaleLowerCase(lang)');
    expect(connectTools).not.toContain('providerLabel="provider"');
    expect(upload).toContain('style={{ background: "var(--g-voltio)" }}');
    expect(upload).toContain('accept={FILE_ACCEPT}');
    for (const extension of ['numbers', 'xlsx', 'docx', 'md', 'png', 'heic']) {
      expect(upload).toContain(`"${extension}"`);
    }
  });

  it("keeps a persistent top navigation and Panel access across member pages", () => {
    const layout = read("src/components/dashboard/DashboardLayout.jsx");
    const results = read("src/pages/PaymentsResults.jsx");
    const navbar = read("src/components/landing/Navbar.jsx");
    const mobileMenu = read("src/components/landing/MobileNavMenu.jsx");
    expect(layout).toContain('import Navbar from "@/components/landing/Navbar"');
    expect(layout).toContain("<Navbar />");
    expect(results).toContain("<Navbar />");
    expect(navbar).toContain('to="/Dashboard"');
    expect(mobileMenu).toContain("isAuthenticated ? MEMBER_GROUPS : PUBLIC_GROUPS");
  });

  it("offers statement upload next to the connection verification action", () => {
    const hero = read("src/components/dashboard/DashboardHeroV2.jsx");
    expect(hero).toContain('to="/ConnectStripe"');
    expect(hero).toContain('to="/UploadStatement"');
    expect(hero).toContain('t("su_cta")');
  });

  it("keeps every Analyzer step visible on narrow screens", () => {
    const styles = read("src/index.css");
    expect(styles).toContain(".payment-journey__stepper { overflow-x: hidden; }");
    expect(styles).toContain(".payment-journey__stepper ol { width: 100%; min-width: 0;");
    expect(styles).toContain("grid-template-columns: repeat(6, 1fr)");
  });
});
