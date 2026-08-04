import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// P0.2 — Static tests: current merchant-facing surfaces must not show active
// non-payment categories. Reads the actual production files and checks for
// forbidden multi-vertical references.

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");

function readFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf-8");
}

describe("Merchant outputs are payments-only (P0.2)", () => {
  describe("ReportsKPIStrip", () => {
    const src = readFile("src/components/reports/ReportsKPIStrip.jsx");

    it("does not reference shipping_savings", () => {
      expect(src).not.toContain("shipping_savings");
    });

    it("does not reference saas_savings", () => {
      expect(src).not.toContain("saas_savings");
    });

    it("does not label a KPI as 'Infrastructure score'", () => {
      expect(src).not.toContain('"Infrastructure score"');
    });

    it("does not label a KPI as 'Pillars benchmarked'", () => {
      expect(src).not.toContain('"Pillars benchmarked"');
    });

    it("does not mention 'Payments · Logistics · SaaS'", () => {
      expect(src).not.toContain("Payments · Logistics · SaaS");
    });
  });

  describe("Monthly savings email", () => {
    const src = readFile("base44/shared/emails/monthlySummary.ts");

    it("does not include shipping in the breakdown rows", () => {
      expect(src).not.toMatch(/shipping.*BreakdownRow|BreakdownRow.*shipping/);
    });

    it("does not include saas in the breakdown rows", () => {
      expect(src).not.toMatch(/saas.*BreakdownRow|BreakdownRow.*saas/);
    });

    it("does not include insurance in the breakdown rows", () => {
      expect(src).not.toMatch(/insurance.*BreakdownRow|BreakdownRow.*insurance/);
    });

    it("does not reference infra_score", () => {
      expect(src).not.toContain("infra_score");
    });
  });

  describe("sendMonthlySavingsSummary", () => {
    const src = readFile("base44/functions/sendMonthlySavingsSummary/entry.ts");

    it("does not include shipping in the breakdown", () => {
      expect(src).not.toMatch(/key:\s*['"]shipping['"]/);
    });

    it("does not include saas in the breakdown", () => {
      expect(src).not.toMatch(/key:\s*['"]saas['"]/);
    });

    it("does not include insurance in the breakdown", () => {
      expect(src).not.toMatch(/key:\s*['"]insurance['"]/);
    });

    it("does not pass infra_score to the email template", () => {
      expect(src).not.toContain("infra_score");
    });
  });

  describe("Copilot engine", () => {
    const src = readFile("src/lib/copilotEngine.js");

    it("does not read ShippingProfile or SaaSProfile", () => {
      expect(src).not.toContain("ShippingProfile");
      expect(src).not.toContain("SaaSProfile");
    });
  });
});