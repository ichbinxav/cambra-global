// ─── bigcommerce_orders normalizer — FUENTE DE VERDAD LÓGICA ───────────────
//
// BigCommerce Orders v2 (storefront, not processor → fee:0 honest absence).
//
// ⚠️ COPIA VERBATIM de base44/functions/dataSyncAgent/entry.ts (Deno no
// puede importar de src/). Mismo patrón que stripe.js. Los tests unitarios
// viven en src/lib/normalizers/bigcommerce.test.js; si esta copia diverge
// de la entrada en dataSyncAgent, realinearla MANUALMENTE — no hay
// enforcement automático.
//
// Contrato (confirmado contra el código real, NO contra suposiciones):
//   - Root: bare array. NO fallback a otras claves (raw.orders, raw.data, …).
//   - external_id = String(order.id); orders sin id se descartan.
//   - amount = toNum(order.total_inc_tax). String "120.50" → 120.5.
//   - tax = toNum(order.total_tax). Ausente → 0, fila NO descartada.
//   - fee = 0 LITERAL (BigCommerce es storefront, no procesador de pago).
//   - currency = order.currency_code || "EUR" (fallback explícito).
//   - status: prefiere string `status`; si falta o no es string no-vacío,
//     cae a String(status_id); si tampoco hay → null.
//   - occurred_at = order.date_created tal cual (RFC-2822 preservado
//     AS-IS, NO se convierte a ISO — convertir inventaría TZ).
//   - vertical = "commerce" fijo.
//
// DEUDA documentada en el normalizer real: (a) verificar root + fields al
// primer connect real, (b) date_created RFC-2822 as-is, (c) {shop} =
// store_hash (helper genérico), (d) X-Auth-Token vía static_headers (sin
// branch en código), (e) paginación ?page&limit — sync engine.

// SYNC-START: bigcommerceNormalizer
export function normalizeBigCommerceOrders(raw) {
  const toNum = (v, fallback = 0) => {
    if (v === null || v === undefined || v === "") return fallback;
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  // v2 returns a bare array. No fallback to other root shapes.
  const orders = Array.isArray(raw) ? raw : [];
  const rows = [];
  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    const id = order?.id;
    if (id === null || id === undefined || id === "") continue; // skip orders without id
    const currency = order?.currency_code || "EUR";
    // Prefer textual status, fall back to status_id (stringified) if absent.
    const statusText = order?.status;
    const status = (typeof statusText === "string" && statusText.length > 0)
      ? statusText
      : (order?.status_id !== null && order?.status_id !== undefined
          ? String(order.status_id)
          : null);
    // date_created is RFC-2822; preserved AS-IS (no inventive ISO conversion).
    const occurredAt = typeof order?.date_created === "string" ? order.date_created : null;
    rows.push({
      vertical: "commerce",
      external_id: String(id),
      amount: toNum(order?.total_inc_tax),
      tax: toNum(order?.total_tax),
      fee: 0, // BigCommerce-as-storefront does not charge per-transaction fee.
      currency,
      occurred_at: occurredAt,
      status,
    });
  }
  return rows;
}
// SYNC-END: bigcommerceNormalizer