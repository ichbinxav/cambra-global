// dashboardLocalization.test.js — Checkpoint H (2026-08-06).
//
// Guards the dashboard hero language fix and the currency-helper unification.
//
// The defect worth freezing is the same shape as the earlier date bug: the hero
// figure — the largest number on the page — was formatted with a HARDCODED
// "en-US" locale, so a French or Spanish merchant saw US grouping ("€1,234")
// inside an otherwise translated page. It produced a perfectly plausible
// string, so no missing-key check could ever have surfaced it. Same for the
// score verdict, which was rendered from the helper's English prose.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "./locales/en.js";
import fr from "./locales/fr.js";
import es from "./locales/es.js";
import { formatEur, formatEurOrDash } from "./currencyFormats";
import {
  computePaymentsScore,
  contextKeyFromGrade,
  contextLineFromGrade,
} from "./paymentsScore.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const keysWith = (dict, prefix) => Object.keys(dict).filter((k) => k.startsWith(prefix));

describe.each([["dh_"], ["score_ctx_"]])("%s i18n parity", (prefix) => {
  it("EN defines the keys", () => {
    expect(keysWith(en, prefix).length).toBeGreaterThan(4);
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

describe("interpolated rate keys keep their placeholder", () => {
  it.each([["en", en], ["fr", fr], ["es", es]])("%s keeps {rate}", (_n, dict) => {
    expect(dict.dh_rate_today).toContain("{rate}");
    expect(dict.dh_rate_achievable).toContain("{rate}");
  });
});

describe("currency helper — one implementation, localized", () => {
  it("groups digits per language (the old hero always used US grouping)", () => {
    const enOut = formatEur(1234567, "en");
    const frOut = formatEur(1234567, "fr");
    expect(enOut).not.toBe(frOut);
    expect(frOut).not.toContain("1,234,567");
    expect(formatEur(1234567, "es")).not.toContain("1,234,567");
  });

  it("rounds to whole euros and floors negatives to zero", () => {
    expect(formatEur(1234.6, "en")).toContain("1,235");
    expect(formatEur(-500, "en")).toContain("0");
  });

  it("treats a non-numeric amount as zero, never NaN", () => {
    for (const bad of [null, undefined, "", "abc", NaN]) {
      expect(formatEur(bad, "en")).not.toContain("NaN");
    }
  });

  it("an unknown language falls back to EN instead of throwing", () => {
    expect(() => formatEur(1000, "de")).not.toThrow();
    expect(formatEur(1000, "de")).toBe(formatEur(1000, "en"));
  });

  it("formatEurOrDash distinguishes 'unknown' from zero", () => {
    expect(formatEurOrDash(undefined, "en")).toBe("—");
    expect(formatEurOrDash(NaN, "fr")).toBe("—");
    expect(formatEurOrDash(0, "en")).not.toBe("—");
  });

  it("no dashboard surface keeps a private copy of the formatter", () => {
    for (const f of [
      "src/pages/Dashboard.jsx",
      "src/components/dashboard/ActionCenter.jsx",
      "src/components/dashboard/DashboardHeroV2.jsx",
    ]) {
      const src = stripComments(read(f));
      expect(src, `${f} re-implements the formatter`).not.toContain('"en-IE"');
      expect(src, `${f} still hardcodes a US locale`).not.toContain('"en-US"');
      expect(src).toContain("@/lib/currencyFormats");
    }
  });
});

describe("score verdict — rendered from a key, not English prose", () => {
  it("every grade maps to a key defined in all three languages", () => {
    const missing = [];
    for (const g of ["A", "B", "C", "D", "F"]) {
      const key = contextKeyFromGrade(g);
      for (const [name, dict] of [["en", en], ["fr", fr], ["es", es]]) {
        if (!dict[key]) missing.push(`${name}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("an unexpected grade falls back to the F verdict, never a missing key", () => {
    expect(contextKeyFromGrade("Z")).toBe("score_ctx_F");
    expect(en[contextKeyFromGrade("Z")]).toBeTruthy();
  });

  it("computePaymentsScore exposes contextKey alongside the legacy line", () => {
    const r = computePaymentsScore({
      current_effective_bps: 250,
      achievable_effective_bps: 150,
      cohort: { verified: true },
    });
    expect(r.available).toBe(true);
    expect(r.contextKey).toBe(`score_ctx_${r.grade}`);
    // Backwards compatible: existing consumers still read contextLine.
    expect(r.contextLine).toBe(contextLineFromGrade(r.grade));
  });

  it("the unscoreable case still yields no verdict at all", () => {
    expect(computePaymentsScore({}).available).toBe(false);
    expect(
      computePaymentsScore({ current_effective_bps: 200, achievable_effective_bps: 0 }).available
    ).toBe(false);
  });

  it("no verdict names a PSP, in any language (grades cost, not the provider)", () => {
    for (const dict of [en, fr, es]) {
      for (const g of ["A", "B", "C", "D", "F"]) {
        const copy = dict[contextKeyFromGrade(g)];
        for (const psp of ["Stripe", "PayPal", "SumUp", "Zettle", "Adyen", "Mollie"]) {
          expect(copy, `${g} names ${psp}`).not.toContain(psp);
        }
      }
    }
  });
});

describe("hero surface — no hardcoded English left", () => {
  const heroPath = "src/components/dashboard/DashboardHeroV2.jsx";

  it("goes through useTranslation", () => {
    expect(read(heroPath)).toContain("useTranslation");
  });

  it("renders no English literal and no raw contextLine", () => {
    const src = stripComments(read(heroPath));
    for (const lit of [
      "Identified potential",
      "Confidence band",
      "Payments efficiency",
      "Start recovery",
      "Connect Stripe to verify",
      "Connect your PSP to score",
    ]) {
      expect(src, `Still hardcoded: ${lit}`).not.toContain(lit);
    }
    expect(src).toContain("t(scoreResult.contextKey)");
    expect(src).not.toContain("scoreResult.contextLine");
  });
});

describe("logic untouched by the presentation fix", () => {
  it("the hero still reads the SAME figure source as the report", () => {
    const src = read("src/components/dashboard/DashboardHeroV2.jsx");
    expect(src).toContain("latest?.details?.engine_result");
    expect(src).toContain("computePaymentsScore(engineResult)");
    // The gauge still only renders when real bps exist — never fabricated.
    expect(src).toContain("scoreAvailable");
  });

  it("the score thresholds and tones are unchanged", () => {
    const r = computePaymentsScore({ current_effective_bps: 150, achievable_effective_bps: 150 });
    expect(r.score).toBe(100);
    expect(r.grade).toBe("A");
    expect(r.tone).toBe("excellent");
  });
});