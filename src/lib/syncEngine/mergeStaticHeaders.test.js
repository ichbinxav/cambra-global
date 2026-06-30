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

  // ─── T3 — fail-fast cuando shopDomain falta (Opción A confirmada) ──────
  // Symmetric con interpolateShopDomain() (path URL). Si el header value
  // contiene {shop} y no hay shopDomain, lanzamos un error claro en vez de
  // enviar el placeholder literal al provider.
  const SHOP_ERR = /shop_domain is required to interpolate \{shop\} in this header value/;
  it("T3a — shopDomain=null + {shop} in value → throws", () => {
    const cfg = { static_headers: { "Xero-Tenant-Id": "{shop}" } };
    expect(() => mergeStaticHeaders(cfg, {}, null, null)).toThrow(SHOP_ERR);
  });
  it("T3b — shopDomain=undefined → throws", () => {
    const cfg = { static_headers: { "Xero-Tenant-Id": "{shop}" } };
    expect(() => mergeStaticHeaders(cfg, {}, null, undefined)).toThrow(SHOP_ERR);
  });
  it("T3c — shopDomain='' (empty string is falsy) → throws", () => {
    const cfg = { static_headers: { "Xero-Tenant-Id": "{shop}" } };
    expect(() => mergeStaticHeaders(cfg, {}, null, "")).toThrow(SHOP_ERR);
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

  // ─── T9 — providers sin {shop} en ningún header NO se ven afectados ─────
  // Confirma que el fail-fast solo se dispara cuando hay {shop} en algún
  // valor. Square/PayPlug no declaran {shop} → shopDomain=null debe ser un
  // no-op silencioso, sin error.
  it("T9a — Square shape with shopDomain=null does NOT throw", () => {
    const cfg = { static_headers: { "Square-Version": "2026-01-22" } };
    expect(() => mergeStaticHeaders(cfg, { "Authorization": "Bearer sq" }, null, null)).not.toThrow();
    const out = mergeStaticHeaders(cfg, { "Authorization": "Bearer sq" }, null, null);
    expect(out).toEqual({ "Authorization": "Bearer sq", "Square-Version": "2026-01-22" });
  });
  it("T9b — PayPlug shape with shopDomain=null/undefined does NOT throw", () => {
    const cfg = {
      static_headers: {
        "PayPlug-Version": "2019-08-06",
        "Accept": "application/json",
      },
    };
    expect(() => mergeStaticHeaders(cfg, { "Authorization": "Bearer pp" }, null, undefined)).not.toThrow();
  });

  // ─── T10 — aislamiento del error en un sync multi-endpoint ──────────────
  // Simula el call-site real de dataSyncAgent (línea 2292): un loop que
  // procesa varios endpoints, donde uno es Xero sin shop_domain y otro es
  // Square. El loop está envuelto en try/catch a nivel de integración, así
  // que el fallo de Xero debe propagarse como un Error capturable (mensaje
  // claro), y la iteración de Square debe poder ejecutarse en su propia
  // pasada sin verse afectada por el throw anterior.
  it("T10 — Xero without shop_domain throws clean error; isolated per-endpoint", () => {
    const endpoints = [
      // Xero-like: requires shop_domain, has it missing
      { name: "xero", cfg: { static_headers: { "Xero-Tenant-Id": "{shop}", "Accept": "application/json" } }, shopDomain: null },
      // Square-like: no {shop} anywhere, should succeed regardless
      { name: "square", cfg: { static_headers: { "Square-Version": "2026-01-22" } }, shopDomain: null },
    ];
    const results = [];
    for (const ep of endpoints) {
      try {
        const out = mergeStaticHeaders(ep.cfg, { "Authorization": "Bearer x" }, null, ep.shopDomain);
        results.push({ name: ep.name, ok: true, headers: out });
      } catch (err) {
        results.push({ name: ep.name, ok: false, error: err.message });
      }
    }
    expect(results[0]).toEqual({
      name: "xero",
      ok: false,
      error: "shop_domain is required to interpolate {shop} in this header value",
    });
    expect(results[1]).toEqual({
      name: "square",
      ok: true,
      headers: { "Authorization": "Bearer x", "Square-Version": "2026-01-22" },
    });
  });
});