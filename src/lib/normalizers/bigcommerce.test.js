// ─── bigcommerce_orders — suite de tests ───────────────────────────────────
//
// Cierra la deuda de tests del normalizer bigcommerce_orders (T1–T9).
// Estilo y profundidad equivalentes a stripe.test.js — verifica el
// comportamiento REAL del código, no el hipotético.
//
// IMPORTANTE: ningún test corrige el normalizer. Si un test parecía
// destinado a comprobar un comportamiento (ej. parseo RFC-2822 → ISO en T3)
// y el código real hace OTRO (preservar AS-IS), el test verifica lo que el
// código realmente hace y se reporta como "hallazgo de discrepancia
// código-vs-prompt" en el informe — sin tocar lógica.

import { describe, it, expect } from "vitest";
import { normalizeBigCommerceOrders } from "./bigcommerce.js";

describe("normalizeBigCommerceOrders — BigCommerce Orders v2", () => {
  // ─── T1 — order completo, total_inc_tax string → amount numérico ─────────
  it("T1 — full order with string total_inc_tax produces correct numeric amount", () => {
    const raw = [{
      id: 1001,
      total_inc_tax: "120.50",
      total_tax: "20.00",
      currency_code: "USD",
      status: "Completed",
      date_created: "Tue, 25 Feb 2020 12:00:00 +0000",
    }];
    const rows = normalizeBigCommerceOrders(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      vertical: "commerce",
      external_id: "1001",
      amount: 120.5, // NOT "120.50", NOT NaN — toNum(parseFloat) handles it
      tax: 20,
      fee: 0,
      currency: "USD",
      occurred_at: "Tue, 25 Feb 2020 12:00:00 +0000",
      status: "Completed",
    });
    expect(typeof rows[0].amount).toBe("number");
    expect(Number.isFinite(rows[0].amount)).toBe(true);
  });

  // ─── T2 — order sin id → descartado ──────────────────────────────────────
  it("T2 — order without id is dropped (returns 0 rows)", () => {
    const cases = [
      [{ total_inc_tax: "100", currency_code: "EUR" }],            // id missing
      [{ id: null, total_inc_tax: "100" }],                         // id null
      [{ id: undefined, total_inc_tax: "100" }],                    // id undefined
      [{ id: "", total_inc_tax: "100" }],                           // id empty string
    ];
    for (const raw of cases) {
      expect(normalizeBigCommerceOrders(raw)).toEqual([]);
    }
  });

  // ─── T3 — date_created en formato RFC-2822 ───────────────────────────────
  // HALLAZGO REPORTADO (no es bug): el comentario del normalizer dice
  // explícitamente "preserved AS-IS (NOT converted to ISO — would invent TZ)".
  // El prompt del usuario hipotetizó "occurred_at parseado correctamente a
  // ISO 8601". El comportamiento REAL es PASS-THROUGH del string RFC-2822.
  // Este test verifica el comportamiento real, sin juicio.
  it("T3 — RFC-2822 date_created is preserved AS-IS (NOT converted to ISO)", () => {
    const raw = [{
      id: 42,
      total_inc_tax: "10.00",
      date_created: "Tue, 25 Feb 2020 12:00:00 +0000",
    }];
    const rows = normalizeBigCommerceOrders(raw);
    expect(rows[0].occurred_at).toBe("Tue, 25 Feb 2020 12:00:00 +0000");
    // Explicit: NO conversion attempted.
    expect(rows[0].occurred_at).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it("T3b — date_created absent → occurred_at = null", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, total_inc_tax: "5" }]);
    expect(rows[0].occurred_at).toBeNull();
  });
  it("T3c — date_created non-string (e.g. number) → occurred_at = null", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, total_inc_tax: "5", date_created: 1582632000 }]);
    expect(rows[0].occurred_at).toBeNull();
  });

  // ─── T4 — currency_code ausente → fallback "EUR" ─────────────────────────
  it("T4 — missing currency_code falls back to 'EUR'", () => {
    const rows = normalizeBigCommerceOrders([{ id: 7, total_inc_tax: "9.99" }]);
    expect(rows[0].currency).toBe("EUR");
  });
  it("T4b — empty string currency_code also falls back to 'EUR' (|| default)", () => {
    const rows = normalizeBigCommerceOrders([{ id: 7, total_inc_tax: "9.99", currency_code: "" }]);
    expect(rows[0].currency).toBe("EUR");
  });
  it("T4c — real currency_code is preserved (no whitelist coercion)", () => {
    const rows = normalizeBigCommerceOrders([{ id: 7, total_inc_tax: "9.99", currency_code: "GBP" }]);
    expect(rows[0].currency).toBe("GBP");
  });

  // ─── T5 — status real values preserved AS-IS (no whitelist) ──────────────
  // HALLAZGO REPORTADO (no es bug): el código NO aplica whitelist a status —
  // contrasta con square_payments que SÍ tiene KNOWN_STATUS. BigCommerce
  // preserva cualquier string. Test verifica este comportamiento real.
  it("T5 — known BigCommerce status strings are preserved verbatim", () => {
    const cases = ["Completed", "Pending", "Refunded", "Cancelled", "Shipped", "Awaiting Payment"];
    for (const s of cases) {
      const rows = normalizeBigCommerceOrders([{ id: 1, status: s }]);
      expect(rows[0].status).toBe(s);
    }
  });
  it("T5b — unknown / garbage status string is ALSO preserved (no whitelist)", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, status: "FooBar_NewStateXYZ" }]);
    expect(rows[0].status).toBe("FooBar_NewStateXYZ");
  });
  it("T5c — status absent → falls back to String(status_id)", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, status_id: 10 }]);
    expect(rows[0].status).toBe("10");
  });
  it("T5d — both status and status_id absent → null", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1 }]);
    expect(rows[0].status).toBeNull();
  });
  it("T5e — empty-string status falls back to status_id (textual rule requires length>0)", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, status: "", status_id: 5 }]);
    expect(rows[0].status).toBe("5");
  });

  // ─── T6 — total_tax ausente o "0.00" → tax=0, fila NO descartada ─────────
  it("T6a — missing total_tax → tax: 0, row still emitted", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, total_inc_tax: "50.00" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].tax).toBe(0);
    expect(rows[0].amount).toBe(50);
  });
  it("T6b — total_tax = '0.00' → tax: 0", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, total_inc_tax: "50.00", total_tax: "0.00" }]);
    expect(rows[0].tax).toBe(0);
  });
  it("T6c — total_tax = '' (empty string) → tax: 0", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, total_tax: "" }]);
    expect(rows[0].tax).toBe(0);
  });
  it("T6d — total_tax garbage → tax: 0 (toNum fallback)", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, total_tax: "abc" }]);
    expect(rows[0].tax).toBe(0);
  });

  // ─── T7 — root shape ────────────────────────────────────────────────────
  it("T7a — bare array root (correct v2 shape) → rows emitted", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, total_inc_tax: "1" }, { id: 2, total_inc_tax: "2" }]);
    expect(rows).toHaveLength(2);
  });
  it("T7b — object wrapper { orders: [...] } → 0 rows (no fallback to other keys)", () => {
    const rows = normalizeBigCommerceOrders({ orders: [{ id: 1, total_inc_tax: "1" }] });
    expect(rows).toEqual([]);
  });
  it("T7c — bare object without any array → 0 rows", () => {
    expect(normalizeBigCommerceOrders({ id: 1, total_inc_tax: "1" })).toEqual([]);
    expect(normalizeBigCommerceOrders({})).toEqual([]);
    expect(normalizeBigCommerceOrders(null)).toEqual([]);
    expect(normalizeBigCommerceOrders(undefined)).toEqual([]);
    expect(normalizeBigCommerceOrders("string")).toEqual([]);
  });
  it("T7d — { data: [...] } wrapper (Stripe-style) → 0 rows (no cross-provider fallback)", () => {
    const rows = normalizeBigCommerceOrders({ data: [{ id: 1, total_inc_tax: "1" }] });
    expect(rows).toEqual([]);
  });

  // ─── T8 — fee invariant: SIEMPRE 0, sin importar input ───────────────────
  it("T8 — fee is always 0 regardless of input fields", () => {
    const inputs = [
      { id: 1, total_inc_tax: "100" },
      { id: 2, total_inc_tax: "100", fee: "999" },                      // garbage fee field ignored
      { id: 3, total_inc_tax: "100", processing_fee: "10" },             // processing_fee ignored
      { id: 4, total_inc_tax: "100", total_tax: "20", currency_code: "JPY" },
      { id: 5, total_inc_tax: 0 },                                      // zero amount
    ];
    const rows = normalizeBigCommerceOrders(inputs);
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.fee).toBe(0);
      expect(typeof r.fee).toBe("number");
    }
  });

  // ─── T9 — anti-regresión: toNum acepta string Y number ───────────────────
  // Mismo contrato que se exigió en FreshBooks/Lexoffice: amounts pueden
  // llegar como string ("120.50") o como number (120.5) según API/versión.
  it("T9a — total_inc_tax as number → amount: number (no NaN)", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, total_inc_tax: 120.5, total_tax: 20 }]);
    expect(rows[0].amount).toBe(120.5);
    expect(rows[0].tax).toBe(20);
  });
  it("T9b — total_inc_tax as string → amount: number", () => {
    const rows = normalizeBigCommerceOrders([{ id: 1, total_inc_tax: "120.50", total_tax: "20.00" }]);
    expect(rows[0].amount).toBe(120.5);
    expect(rows[0].tax).toBe(20);
  });
  it("T9c — mixed page (some number, some string) → all numeric, none NaN", () => {
    const rows = normalizeBigCommerceOrders([
      { id: 1, total_inc_tax: 10 },
      { id: 2, total_inc_tax: "20.00" },
      { id: 3, total_inc_tax: "abc" }, // garbage → fallback 0, NOT NaN
      { id: 4, total_inc_tax: null },  // null → fallback 0
    ]);
    expect(rows.map(r => r.amount)).toEqual([10, 20, 0, 0]);
    for (const r of rows) expect(Number.isFinite(r.amount)).toBe(true);
  });
});