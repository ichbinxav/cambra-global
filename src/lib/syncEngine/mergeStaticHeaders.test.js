// Tests for the {shop} interpolation path of mergeStaticHeaders (Xero/Sage and
// any future provider that injects per-tenant identifiers in a header value).
//
// Scope: covers the {shop}-in-value path that was added in commit 48112e65 and
// was previously untested. The {token} path is touched only in T8 (coexistence
// check) — full {token} coverage is out of scope here.

import { describe, it, expect } from "vitest";
import { mergeStaticHeaders } from "./mergeStaticHeaders.js";

describe("mergeStaticHeaders — {shop} interpolation in header values", () => {
  // ─── T1 ─────────────────────────────────────────────────────────────────
  it("T1 — single header with {shop} value gets interpolated", () => {
    const cfg = { static_headers: { "Xero-Tenant-Id": "{shop}" } };
    const out = mergeStaticHeaders(cfg, {}, null, "abc-123");
    expect(out).toEqual({ "Xero-Tenant-Id": "abc-123" });
  });

  // ─── T2 ─────────────────────────────────────────────────────────────────
  it("T2 — multiple headers, only the one with {shop} is interpolated", () => {
    const cfg = {
      static_headers: {
        "Xero-Tenant-Id": "{shop}",
        "Accept": "application/json",
      },
    };
    const out = mergeStaticHeaders(cfg, {}, null, "tenant-42");
    expect(out).toEqual({
      "Xero-Tenant-Id": "tenant-42",
      "Accept": "application/json",
    });
  });

  // ─── T3 — comportamiento documentado cuando shopDomain falta ────────────
  // REPORTE DE COMPORTAMIENTO ACTUAL (NO juicio sobre si es bug):
  // Cuando shopDomain es null/undefined/"" pero el valor del header contiene
  // {shop}, la guarda `if (value.includes("{shop}") && shopDomain)` falla
  // por el lado del shopDomain falsy, y el valor se merge tal cual — es
  // decir, el header final sale con el placeholder LITERAL "{shop}".
  // El header NO se omite, NO se lanza error. Lo que se enviaría al
  // provider es literalmente "Xero-Tenant-Id: {shop}".
  //
  // No se reescribe el comportamiento aquí. Solo se documenta vía test.
  it("T3a — shopDomain=null + {shop} in value → placeholder kept LITERAL", () => {
    const cfg = { static_headers: { "Xero-Tenant-Id": "{shop}" } };
    const out = mergeStaticHeaders(cfg, {}, null, null);
    expect(out).toEqual({ "Xero-Tenant-Id": "{shop}" });
  });
  it("T3b — shopDomain=undefined → placeholder kept LITERAL", () => {
    const cfg = { static_headers: { "Xero-Tenant-Id": "{shop}" } };
    const out = mergeStaticHeaders(cfg, {}, null, undefined);
    expect(out).toEqual({ "Xero-Tenant-Id": "{shop}" });
  });
  it("T3c — shopDomain='' → placeholder kept LITERAL (empty string is falsy)", () => {
    const cfg = { static_headers: { "Xero-Tenant-Id": "{shop}" } };
    const out = mergeStaticHeaders(cfg, {}, null, "");
    expect(out).toEqual({ "Xero-Tenant-Id": "{shop}" });
  });

  // ─── T4 ─────────────────────────────────────────────────────────────────
  it("T4 — {shop} embedded in surrounding text is interpolated in place", () => {
    const cfg = { static_headers: { "X-Custom": "tenant-{shop}-eu" } };
    const out = mergeStaticHeaders(cfg, {}, null, "12345");
    expect(out).toEqual({ "X-Custom": "tenant-12345-eu" });
  });

  // ─── T5 ─────────────────────────────────────────────────────────────────
  it("T5 — Xero shape with UUID-like tenant id", () => {
    const cfg = {
      static_headers: {
        "Accept": "application/json",
        "Xero-Tenant-Id": "{shop}",
      },
    };
    const out = mergeStaticHeaders(
      cfg,
      { "Authorization": "Bearer xyz" },
      null,
      "5f3a91c0-2b8e-4d76-9a14-7e1f0b2d8c3a",
    );
    expect(out).toEqual({
      "Authorization": "Bearer xyz",
      "Accept": "application/json",
      "Xero-Tenant-Id": "5f3a91c0-2b8e-4d76-9a14-7e1f0b2d8c3a",
    });
  });

  // ─── T6 ─────────────────────────────────────────────────────────────────
  it("T6 — Sage shape with business id", () => {
    const cfg = {
      static_headers: {
        "Accept": "application/json",
        "X-Business": "{shop}",
      },
    };
    const out = mergeStaticHeaders(
      cfg,
      { "Authorization": "Bearer abc" },
      null,
      "business_98765",
    );
    expect(out).toEqual({
      "Authorization": "Bearer abc",
      "Accept": "application/json",
      "X-Business": "business_98765",
    });
  });

  // ─── T7 — providers sin {shop} en ningún valor (no-regresión) ────────────
  it("T7a — Square shape (Square-Version) untouched by {shop} mechanism", () => {
    const cfg = { static_headers: { "Square-Version": "2026-01-22" } };
    const out = mergeStaticHeaders(cfg, { "Authorization": "Bearer sq" }, null, "anything-here");
    expect(out).toEqual({
      "Authorization": "Bearer sq",
      "Square-Version": "2026-01-22",
    });
  });
  it("T7b — PayPlug shape (PayPlug-Version + Accept) untouched", () => {
    const cfg = {
      static_headers: {
        "PayPlug-Version": "2019-08-06",
        "Accept": "application/json",
      },
    };
    const out = mergeStaticHeaders(cfg, { "Authorization": "Bearer pp" }, null, "ignored");
    expect(out).toEqual({
      "Authorization": "Bearer pp",
      "PayPlug-Version": "2019-08-06",
      "Accept": "application/json",
    });
  });

  // ─── T8 — coexistencia {token} + {shop} en distintos headers ────────────
  it("T8 — {token} and {shop} in different headers don't collide", () => {
    const cfg = {
      static_headers: {
        "Authorization": "Zoho-oauthtoken {token}",
        "X-Tenant": "{shop}",
      },
    };
    const out = mergeStaticHeaders(cfg, {}, "ACCESS_TOKEN_XYZ", "tenant_42");
    expect(out).toEqual({
      "Authorization": "Zoho-oauthtoken ACCESS_TOKEN_XYZ",
      "X-Tenant": "tenant_42",
    });
  });
});