import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// P0.3 — Documentation coherence tests. The root README and src/README.md
// must not contradict each other regarding current production scope.

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");

function readFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf-8");
}

describe("Documentation coherence (P0.3)", () => {
  const rootReadme = readFile("README.md");
  const srcReadme = readFile("src/README.md");

  describe("Root README", () => {
    it("describes CAMBRA as card payment cost intelligence", () => {
      expect(rootReadme).toMatch(/card.?payment/i);
    });

    it("does not call CAMBRA an 'economic operating system'", () => {
      expect(rootReadme).not.toContain("economic operating system");
    });

    it("does not describe a currently active multivertical platform", () => {
      expect(rootReadme).not.toContain("Three pillars");
    });
  });

  describe("src/README.md", () => {
    it("has a visible 'Current production scope' section near the top", () => {
      expect(srcReadme).toContain("Current production scope");
      // The section should be in the first 200 lines (near the top)
      const first200 = srcReadme.split("\n").slice(0, 200).join("\n");
      expect(first200).toContain("Current production scope");
    });

    it("states payments as the current production scope", () => {
      expect(srcReadme).toMatch(/production scope:\s*payments/i);
    });

    it("does not call CAMBRA an 'economic operating system'", () => {
      expect(srcReadme).not.toContain("economic operating system");
    });

    it("does not describe 'Three pillars' as current", () => {
      expect(srcReadme).not.toContain("Three pillars");
    });

    it("does not claim to be 'Live in' specific countries as a current multivertical product", () => {
      // The old src/README.md had "Live in 🇫🇷 🇪🇸 🇮🇪 with onboarding for
      // independent commerce brands between €30K–€500K monthly revenue."
      // which described a multivertical product.
      expect(srcReadme).not.toContain("Live in 🇫🇷 🇪🇸 🇮🇪");
    });

    it("describes dormant verticals as roadmap, not current", () => {
      expect(srcReadme).toMatch(/dormant roadmap infrastructure/i);
    });

    it("references the feature-scope registry", () => {
      expect(srcReadme).toContain("featureScope.js");
    });

    it("references the economic-terms constants", () => {
      expect(srcReadme).toContain("economicTerms.js");
    });
  });

  describe("No contradiction between the two READMEs", () => {
    it("both describe payments as the current scope", () => {
      expect(rootReadme).toMatch(/card.?payment/i);
      expect(srcReadme).toMatch(/payment/i);
    });

    it("neither describes a currently active multivertical product", () => {
      expect(rootReadme).not.toContain("Three pillars");
      expect(srcReadme).not.toContain("Three pillars");
    });
  });
});