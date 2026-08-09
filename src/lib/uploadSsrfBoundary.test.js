import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const src = readFileSync(join(process.cwd(), "base44/functions/processUploadedFile/entry.ts"), "utf8");

describe("upload SSRF boundary", () => {
  it("accepts only HTTPS Base44 media storage URLs", () => {
    expect(src).toContain("TRUSTED_UPLOAD_HOSTS = new Set(['media.base44.com'])");
    expect(src).toContain("u.protocol !== 'https:'");
    expect(src).toContain("untrusted_file_url");
  });
  it("refuses redirects on backend document fetches", () => {
    const matches = src.match(/fetch\(fileUrl, \{ redirect: 'error' \}\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/await fetch\(fileUrl\);/);
  });
});
