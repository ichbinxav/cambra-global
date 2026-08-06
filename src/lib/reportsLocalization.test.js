// reportsLocalization.test.js — Checkpoint H (2026-08-06).
//
// Guards the /Reports language fix, including the two defects a plain t() sweep
// would have left in place: the raw verification enum printed to the merchant,
// and dates formatted by date-fns with no locale (silently English for everyone).

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import en from "./locales/en.js";
import fr from "./locales/fr.js";
import es from "./locales/es.js";
import {
  formatShortDate, formatLongDate, formatTime,
  verificationStatusLabel, historyBadge,
} from "../components/reports/reportsLabels";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(THIS_DIR, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SURFACE = [
  "src/pages/Reports.jsx",
  "src/components/reports/VerificationChecklist.jsx",
  "src/components/reports/InStoreBenchmarkPanel.jsx",
  "src/components/reports/AuditHistoryList.jsx",
];

const VERIFICATION_STATUSES = [
  "estimated", "proposed", "evidence_submitted", "under_review",
  "verified", "realized", "invoiced", "paid",
];

const rptKeys = (dict) => Object.keys(dict).filter((k) => k.startsWith("rpt_"));

describe("reports i18n — key parity across the three languages", () => {
  it("EN defines the reports keys", () => {
    expect(rptKeys(en).length).toBeGreaterThan(40);
  });

  it.each([["fr", fr], ["es", es]])("%s defines every EN reports key", (_n, dict) => {
    const missing = rptKeys(en).filter((k) => !(k in dict));
    expect(missing, `Untranslated reports keys:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it.each([["fr", fr], ["es", es]])("%s defines no reports key EN lacks", (_n, dict) => {
    const orphan = rptKeys(dict).filter((k) => !(k in en));
    expect(orphan).toEqual([]);
  });

  it.each([["en", en], ["fr", fr], ["es", es]])("%s has no blank reports value", (_n, dict) => {
    expect(rptKeys(dict).filter((k) => !String(dict[k] ?? "").trim())).toEqual([]);
  });

  it("every verification_status has a label in all three languages", () => {
    const missing = [];
    for (const [name, dict] of [["en", en], ["fr", fr], ["es", es]]) {
      for (const s of VERIFICATION_STATUSES) {
        if (!dict[`rpt_vst_${s}`]) missing.push(`${name}:rpt_vst_${s}`);
      }
    }
    expect(missing, `A merchant would read the raw enum:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("interpolated keys keep their placeholder in every language", () => {
    for (const dict of [en, fr, es]) {
      expect(dict.rpt_files).toContain("{n}");
      expect(dict.rpt_count_one).toContain("{n}");
      expect(dict.rpt_count_many).toContain("{n}");
      expect(dict.rpt_tpv_eff_rate).toContain("{rate}");
      expect(dict.rpt_tpv_net_rate).toContain("{rate}");
    }
  });

  it("FR and ES are not copy-pasted English", () => {
    expect(fr.rpt_title).not.toBe(en.rpt_title);
    expect(es.rpt_title).not.toBe(en.rpt_title);
    expect(fr.rpt_per_year).not.toBe(en.rpt_per_year);
    expect(es.rpt_per_year).not.toBe(en.rpt_per_year);
  });
});

describe("reports labels — enum display without touching stored values", () => {
  const tEn = (k) => en[k] ?? k;
  const tFr = (k) => fr[k] ?? k;

  it("maps the stored status to a translated label", () => {
    expect(verificationStatusLabel(tEn, "evidence_submitted")).toBe("Evidence submitted");
    expect(verificationStatusLabel(tFr, "evidence_submitted")).toBe("Justificatifs envoyés");
  });

  it("falls back to the de-underscored raw value for an unknown status", () => {
    expect(verificationStatusLabel(tEn, "awaiting_bank")).toBe("awaiting bank");
  });

  it("returns empty for an absent status rather than printing 'undefined'", () => {
    expect(verificationStatusLabel(tEn, undefined)).toBe("");
    expect(verificationStatusLabel(tEn, null)).toBe("");
  });

  it("the coarse row badge collapses statuses and carries its own colour", () => {
    expect(historyBadge(tEn, "verified").label).toBe("Verified");
    expect(historyBadge(tEn, "verified").className).toContain("#2FE0A8");
    expect(historyBadge(tEn, "pending_verification").label).toBe("Provisional");
    // Anything else is Estimated — the original behaviour.
    expect(historyBadge(tEn, "under_review").label).toBe("Estimated");
    expect(historyBadge(tFr, "verified").label).toBe("Vérifié");
  });
});

describe("reports dates — localized, not silently English", () => {
  const D = "2026-08-06T14:30:00.000Z";

  it("the long date differs per language", () => {
    const enOut = formatLongDate(D, "en");
    const frOut = formatLongDate(D, "fr");
    const esOut = formatLongDate(D, "es");
    expect(enOut).toMatch(/2026/);
    expect(frOut).not.toBe(enOut);
    expect(esOut).not.toBe(enOut);
    // The month name must be localized, not the English one.
    expect(frOut.toLowerCase()).toContain("août");
    expect(esOut.toLowerCase()).toContain("agosto");
  });

  it("the chart axis date is short and localized", () => {
    expect(formatShortDate(D, "en")).not.toContain("2026");
    expect(formatShortDate(D, "fr")).not.toBe(formatShortDate(D, "en"));
  });

  it("time is 24h", () => {
    expect(formatTime(D, "en")).toMatch(/^\d{2}:\d{2}$/);
  });

  it("an unknown language falls back to EN instead of throwing", () => {
    expect(() => formatLongDate(D, "de")).not.toThrow();
    expect(formatLongDate(D, "de")).toBe(formatLongDate(D, "en"));
  });

  it("a missing or invalid date yields empty, never 'Invalid Date'", () => {
    expect(formatLongDate(null, "en")).toBe("");
    expect(formatLongDate("not-a-date", "en")).toBe("");
    expect(formatShortDate(undefined, "fr")).toBe("");
  });
});

describe("reports surface — no hardcoded language, no raw enum", () => {
  it.each(SURFACE)("%s goes through useTranslation", (file) => {
    expect(read(file)).toContain("useTranslation");
  });

  it("no English literal is rendered in the page shell", () => {
    const src = stripComments(read("src/pages/Reports.jsx"));
    for (const lit of [
      "No reports yet", "New scan", "Run Analyzer", "Savings history",
      "Identified payment savings", "Margin intelligence", ">Live<",
    ]) {
      expect(src, `Still hardcoded: ${lit}`).not.toContain(lit);
    }
  });

  it("the verification pill no longer prints the raw enum", () => {
    const all = SURFACE.map((f) => stripComments(read(f))).join("\n");
    expect(all).not.toContain('verification_status.replaceAll');
    expect(stripComments(read("src/components/reports/VerificationChecklist.jsx")))
      .toContain("verificationStatusLabel(t, report.verification_status)");
  });

  it("date-fns format() is gone from the reports surface", () => {
    // It was the source of the English-only dates: format() with no locale.
    for (const file of SURFACE) {
      const src = stripComments(read(file));
      expect(src, `${file} still imports date-fns format()`).not.toMatch(/from ["']date-fns["']/);
    }
  });

  it("the chart localizes its series name without renaming the data key", () => {
    const src = stripComments(read("src/pages/Reports.jsx"));
    expect(src).toContain('dataKey="payments"');
    expect(src).toContain('name={t("rpt_chart_series")}');
  });
});

describe("reports — logic untouched by the presentation fix", () => {
  it("the tenant filter and billing call are intact", () => {
    const src = read("src/pages/Reports.jsx");
    expect(src).toContain('filter({ created_by: me.email }, "-created_date", 20)');
    expect(src).toContain("invoke('getMyBillingRecords', {})");
  });

  it("the TPV arithmetic is unchanged", () => {
    const src = read("src/components/reports/InStoreBenchmarkPanel.jsx");
    expect(src).toContain("details.tpe_effective_rate || 0");
    expect(src).toContain("getBenchmarks(details.monthly_revenue || 50000");
    expect(src).toContain("details.annual_gmv * (effectiveRate / 100)");
  });

  it("the checklist keeps the stored progression order", () => {
    const src = read("src/components/reports/VerificationChecklist.jsx");
    expect(src).toContain('"estimated", "proposed", "evidence_submitted", "under_review"');
    expect(src).toContain('"verified", "realized", "invoiced", "paid"');
  });
});