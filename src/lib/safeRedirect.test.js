import { describe, it, expect } from "vitest";
import { safeReturnUrl, isSameOriginUrl } from "@/lib/safeRedirect";

const ORIGIN = "https://app.example.com";

describe("safeReturnUrl", () => {
  it("accepts absolute same-origin paths", () => {
    expect(safeReturnUrl("/Dashboard", ORIGIN)).toBe("https://app.example.com/Dashboard");
    expect(safeReturnUrl("/Results?session=abc", ORIGIN)).toBe(
      "https://app.example.com/Results?session=abc"
    );
  });

  it("accepts full same-origin URLs", () => {
    expect(safeReturnUrl("https://app.example.com/Dashboard", ORIGIN)).toBe(
      "https://app.example.com/Dashboard"
    );
    expect(safeReturnUrl("https://app.example.com/Analyzer?ref=code", ORIGIN)).toBe(
      "https://app.example.com/Analyzer?ref=code"
    );
  });

  it("rejects cross-origin URLs (open-redirect protection)", () => {
    expect(safeReturnUrl("https://evil.com/Dashboard", ORIGIN)).toBe(
      "https://app.example.com/Dashboard"
    );
    expect(safeReturnUrl("https://evil.example.com/path", ORIGIN)).toBe(
      "https://app.example.com/Dashboard"
    );
    expect(safeReturnUrl("http://app.example.com/Dashboard", ORIGIN)).toBe(
      "https://app.example.com/Dashboard"
    );
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeReturnUrl("//evil.com/Dashboard", ORIGIN)).toBe(
      "https://app.example.com/Dashboard"
    );
  });

  it("rejects malformed values", () => {
    expect(safeReturnUrl("not-a-url", ORIGIN)).toBe("https://app.example.com/Dashboard");
    expect(safeReturnUrl("", ORIGIN)).toBe("https://app.example.com/Dashboard");
    expect(safeReturnUrl(null, ORIGIN)).toBe("https://app.example.com/Dashboard");
    expect(safeReturnUrl(undefined, ORIGIN)).toBe("https://app.example.com/Dashboard");
  });

  it("honors custom fallback", () => {
    expect(safeReturnUrl("https://evil.com", ORIGIN, "/Onboarding")).toBe(
      "https://app.example.com/Onboarding"
    );
  });
});

describe("isSameOriginUrl", () => {
  it("returns the full URL for same-origin paths", () => {
    expect(isSameOriginUrl("/Dashboard", ORIGIN)).toBe("https://app.example.com/Dashboard");
  });

  it("returns the full URL for same-origin absolute URLs", () => {
    expect(isSameOriginUrl("https://app.example.com/Results", ORIGIN)).toBe(
      "https://app.example.com/Results"
    );
  });

  it("returns null for cross-origin URLs", () => {
    expect(isSameOriginUrl("https://evil.com/Dashboard", ORIGIN)).toBeNull();
    expect(isSameOriginUrl("//evil.com", ORIGIN)).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(isSameOriginUrl("not-a-url", ORIGIN)).toBeNull();
    expect(isSameOriginUrl("", ORIGIN)).toBeNull();
    expect(isSameOriginUrl(null, ORIGIN)).toBeNull();
  });
});