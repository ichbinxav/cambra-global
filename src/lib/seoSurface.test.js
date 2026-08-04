import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// P0.6 — Public SEO surface tests. Public metadata must describe the current
// payment-entry product, must not contain internal/test labels, and the
// manifest reference must resolve to a valid file.

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");

function readFile(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf-8");
}

describe("Public SEO surface (P0.6)", () => {
  const indexHtml = readFile("index.html");

  describe("index.html title and metadata", () => {
    it("title does not contain 'CAMBRA (Copy)'", () => {
      const titleMatch = indexHtml.match(/<title>(.*?)<\/title>/);
      expect(titleMatch?.[1]).not.toContain("CAMBRA (Copy)");
    });

    it("title does not contain 'test', 'staging', or 'preview'", () => {
      const titleMatch = indexHtml.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch?.[1] || "";
      expect(title).not.toMatch(/\btest\b/i);
      expect(title).not.toMatch(/\bstaging\b/i);
      expect(title).not.toMatch(/\bpreview\b/i);
    });

    it("describes the current payment-entry product", () => {
      expect(indexHtml).toMatch(/card.?payment/i);
    });

    it("does not describe a currently active multivertical product", () => {
      // The description should not claim shipping, SaaS, or logistics as
      // current services.
      const descMatch = indexHtml.match(/<meta\s+name="description"\s+content="(.*?)"\s*\/>/i);
      const desc = descMatch?.[1] || "";
      expect(desc).not.toMatch(/\bshipping\b/i);
      expect(desc).not.toMatch(/\blogistics\b/i);
      expect(desc).not.toMatch(/\bSaaS\b/i);
    });

    it("uses the correct public CAMBRA domain for canonical", () => {
      expect(indexHtml).toContain('cambra.global');
    });
  });

  describe("manifest reference", () => {
    it("references /manifest.json", () => {
      expect(indexHtml).toContain('rel="manifest" href="/manifest.json"');
    });

    it("public/manifest.json exists and is valid", () => {
      const manifestPath = path.join(REPO_ROOT, "public/manifest.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFile("public/manifest.json"));
      expect(manifest.name).toBeTruthy();
      expect(manifest.short_name).toBeTruthy();
      expect(manifest.start_url).toBeTruthy();
      expect(manifest.display).toBeTruthy();
      expect(manifest.background_color).toBeTruthy();
      expect(manifest.theme_color).toBeTruthy();
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThan(0);
    });
  });
});