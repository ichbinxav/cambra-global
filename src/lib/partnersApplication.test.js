import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// PARTNERS-1 — static tests for the partner-application topic extension of
// submitContactMessage. Verifies the source code contains the right routing,
// validation, and source-page mapping without invoking the Deno runtime.

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, "..", "..");
const FN_FILE = path.join(REPO_ROOT, "base44/functions/submitContactMessage/entry.ts");
const PAGE_FILE = path.join(REPO_ROOT, "src/pages/Partners.jsx");

function readFn() {
  return fs.readFileSync(FN_FILE, "utf-8");
}
function readPage() {
  return fs.readFileSync(PAGE_FILE, "utf-8");
}

describe("submitContactMessage — partner_application topic", () => {
  it("accepts topic 'partner_application'", () => {
    const src = readFn();
    expect(src).toContain("'partner_application'");
    expect(src).toContain("VALID_TOPICS");
  });

  it("rejects unsupported topics", () => {
    const src = readFn();
    expect(src).toContain("invalid_topic");
  });

  it("hardcodes source_page to /Partners for partner applications", () => {
    const src = readFn();
    // source_page is server-determined, never from body
    expect(src).toContain("sourcePage = '/Partners'");
    expect(src).not.toContain("source_page: body");
    expect(src).not.toContain("source_page: body?.source_page");
  });

  it("validates required partner fields", () => {
    const src = readFn();
    expect(src).toContain("invalid_organisation");
    expect(src).toContain("invalid_role");
    expect(src).toContain("invalid_country");
    expect(src).toContain("invalid_partner_type");
    expect(src).toContain("invalid_support_description");
  });

  it("validates partner_type against an allowlist", () => {
    const src = readFn();
    expect(src).toContain("VALID_PARTNER_TYPES");
    expect(src).toContain("'adviser'");
    expect(src).toContain("'agency'");
    expect(src).toContain("'association'");
    expect(src).toContain("'finance'");
    expect(src).toContain("'accelerator'");
    expect(src).toContain("'other'");
  });

  it("prefixes notes with PARTNER APPLICATION", () => {
    const src = readFn();
    expect(src).toContain("'PARTNER APPLICATION'");
  });

  it("uses Partner application — Organisation as email subject", () => {
    const src = readFn();
    expect(src).toContain("Partner application —");
  });

  it("preserves body-size protection (16KB)", () => {
    const src = readFn();
    expect(src).toContain("16 * 1024");
    expect(src).toContain("payload_too_large");
  });

  it("preserves rate limiting", () => {
    const src = readFn();
    expect(src).toContain("checkRateLimit");
    expect(src).toContain("rate_limited");
  });

  it("preserves email validation", () => {
    const src = readFn();
    expect(src).toMatch(/\/\^\[\^\\s@\]\+\@\[\^\\s@\]\+/);
  });

  it("preserves locale handling", () => {
    const src = readFn();
    expect(src).toContain("normalizeLocale");
  });
});

describe("Partners page — structure", () => {
  it("exists and uses PublicPageShell", () => {
    const src = readPage();
    expect(src).toContain("PublicPageShell");
  });

  it("has the application anchor with scroll margin", () => {
    const src = readPage();
    expect(src).toContain('id="apply"');
    // scroll-mt to offset the fixed navbar
    expect(src).toMatch(/scroll-mt/);
  });

  it("uses the partner application form component", () => {
    const src = readPage();
    expect(src).toContain("PartnerApplicationForm");
  });

  it("includes the Provider Programme redirect note", () => {
    const src = readPage();
    expect(src).toContain("/ForProviders");
  });

  it("does not promise commission, bounty or revenue share", () => {
    const src = readPage();
    expect(src).not.toContain("commission");
    expect(src).not.toContain("bounty");
    expect(src).not.toContain("revenue share");
    expect(src).not.toContain("revshare");
  });
});

describe("Partner copy — no remuneration promises across all locales", () => {
  const LOCALE_FILES = ["en.js", "fr.js", "es.js"];
  const NO_COMMISSION = [
    /No commission/i,
    /Aucune commission/i,
    /Sin comisi[oó]n/i,
  ];
  const FORBIDDEN = [/\bbounty\b/i, /\brevenue share\b/i, /\brevshare\b/i];

  it.each(LOCALE_FILES)("%s contains an explicit no-commission message", (file) => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "src/lib/locales", file), "utf-8");
    // Each locale must include at least one no-commission affirmation.
    expect(NO_COMMISSION.some((re) => re.test(src))).toBe(true);
  });

  it.each(LOCALE_FILES)("%s does not promise bounty or revenue share", (file) => {
    const src = fs.readFileSync(path.join(REPO_ROOT, "src/lib/locales", file), "utf-8");
    FORBIDDEN.forEach((re) => expect(src).not.toMatch(re));
  });
});