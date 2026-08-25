import { describe, expect, it } from "vitest";
import fs from "node:fs";

const app = fs.readFileSync("src/App.jsx", "utf8");
const consent = fs.readFileSync("src/pages/OAuthConsent.jsx", "utf8");

describe("MCP OAuth consent route", () => {
  it("mounts the generated consent page on the canonical public route", () => {
    expect(app).toContain("const OAuthConsent = lazy(() => import('@/pages/OAuthConsent.jsx'));");
    expect(app).toContain('<Route path="/OAuthConsent" element={withBoundary(<OAuthConsent />)} />');
    expect(app).toContain('<Route path="/oauthconsent" element={<Navigate to="/OAuthConsent" replace />} />');
  });

  it("keeps the opaque consent handle and authenticated server decision fail closed", () => {
    expect(consent).toContain('get("ctx")');
    expect(consent).toContain("encodeURIComponent(ctx)");
    expect(consent).toContain('credentials: "include"');
    expect(consent).toContain("if (!data.authenticated)");
    expect(consent).toContain("if (appParams.token)");
    expect(consent).toContain("if (error && !info)");
  });

  it("submits only approve or deny to the same-origin grant endpoint", () => {
    expect(consent).toContain("body: JSON.stringify({ ctx, action })");
    expect(consent).toContain('respond("approve")');
    expect(consent).toContain('respond("deny")');
    expect(consent).toContain("/mcp/authorize-grant");
  });
});
