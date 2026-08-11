import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import process from "node:process";
const src = readFileSync(join(process.cwd(), "base44/functions/processUploadedFile/entry.ts"), "utf8");

describe("upload SSRF boundary", () => {
  it("accepts only HTTPS Base44 media storage URLs", () => {
    expect(src).toContain("TRUSTED_UPLOAD_HOSTS = new Set(['media.base44.com'])");
    expect(src).toContain("url.protocol !== 'https:'");
    expect(src).toContain("url.username || url.password");
    expect(src).toContain("untrusted_file_url");
  });
  it("fetches the allowlisted stored file exactly once and refuses redirects", () => {
    const matches = src.match(/fetch\(trusted\.url/g) || [];
    expect(matches).toHaveLength(1);
    expect(src).toContain("redirect: 'error'");
    expect(src).not.toMatch(/await fetch\(trusted\.url\);/);
  });
});
