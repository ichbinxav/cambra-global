import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// v62 H1 — the lowercase /help/:slug alias must REDIRECT, never render a second
// copy of the page (two live URLs for one document = duplicate canonical).
const read = (p) =>
  fs.readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), "utf8");

describe("Help canonical route", () => {
  const app = read("src/App.jsx");
  const redirect = read("src/components/shared/HelpSlugRedirect.jsx");

  it("routes the lowercase alias to the redirect component", () => {
    expect(app).toMatch(/path="\/help\/:slug"\s+element=\{<HelpSlugRedirect \/>\}/);
  });

  it("keeps the canonical uppercase route rendering the page", () => {
    expect(app).toMatch(/path="\/Help\/:slug"\s+element=\{withBoundary\(<HelpCategory \/>\)\}/);
  });

  it("does not render HelpCategory on the lowercase alias", () => {
    expect(app).not.toMatch(/path="\/help\/:slug"[^\n]*HelpCategory/);
  });

  it("redirects with replace and preserves slug, query and hash", () => {
    expect(redirect).toContain("replace");
    expect(redirect).toContain("/Help/${slug}${search}${hash}");
  });
});