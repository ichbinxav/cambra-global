import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// P0.5 — Static test: LoadingScreen must use cMarkVoltioPng as the primary
// loading mark and render a fallback when the image fails. Reads the actual
// source file and checks for the fallback pattern (onError + conditional
// render of a text-based "C" mark).

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");
const LOADING_SCREEN_FILE = path.join(REPO_ROOT, "src/components/shared/LoadingScreen.jsx");

function readLoadingScreen() {
  return fs.readFileSync(LOADING_SCREEN_FILE, "utf-8");
}

describe("LoadingScreen fallback (P0.5)", () => {
  const src = readLoadingScreen();

  it("uses cMarkVoltioPng as the primary mark", () => {
    expect(src).toContain("cMarkVoltioPng");
  });

  it("has an imgError state hook", () => {
    expect(src).toMatch(/useState.*imgError|imgError.*useState/);
  });

  it("has an onError handler on the img element", () => {
    expect(src).toMatch(/onError.*setImgError\(true\)/);
  });

  it("renders a fallback when imgError is true", () => {
    expect(src).toMatch(/imgError\s*\?/);
  });

  it("fallback renders a text-based C mark (not a broken image)", () => {
    // The fallback should contain a "C" character in the conditional branch.
    // Match C between > and < with optional whitespace/newlines.
    expect(src).toMatch(/>\s*C\s*</);
  });

  it("preserves the cambra-pulse animation in the fallback", () => {
    // The animation keyframe is defined in a <style> tag and the fallback
    // should reference it.
    expect(src).toContain("cambra-pulse");
  });

  it("does not revert to a different (broken) asset", () => {
    // Must NOT reference the old cMarkBig or cMarkMono as primary
    const primaryMatch = src.match(/src=\{BRAND_ASSETS\.(\w+)\}/);
    expect(primaryMatch?.[1]).toBe("cMarkVoltioPng");
  });
});