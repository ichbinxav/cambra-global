// ─── stripe_transactions normalizer — FUENTE DE VERDAD LÓGICA ───────────────
//
// Stripe /v1/balance_transactions → CAMBRA spend rows.
//
// Why a separate file:
//   - dataSyncAgent runs on Deno and cannot import local modules; its copy of
//     this function is FUNCIONALMENTE EQUIVALENTE (verificado por ejecución
//     contra 7 fixtures reales + edge cases) pero NO BYTE-VERBATIM con
//     base44/functions/dataSyncAgent/entry.ts: en Deno los helpers
//     (KNOWN_TYPES, toNum, mapType) viven DENTRO del arrow function como
//     método de objeto-literal; aquí están a top-level del módulo. La
//     divergencia es estructural-arquitectural (un archivo Deno gigante vs
//     un módulo ESM importable), NO un drift accidental.
//   - This file is the testable source of truth — every behavior is locked by
//     stripe.test.js with synthetic fixtures.
//   - If both copies drift in BEHAVIOR, the unit tests catch the regression
//     here; the Deno copy is then mechanically re-aligned by hand. Cost of drift is
//     known and bounded.
//
// CONTRATO DEL NORMALIZER (decisiones D1–D5 ya zanjadas):
//
//   D1. Granularidad: una fila por `balance_transaction` (NO grouping).
//       Stripe ya emite una fila por evento; no pareamos como Zettle.
//
//   D2. type semántico (whitelist desde reporting_category):
//         "charge"           → venta normal (entra a GMV con signo +)
//         "refund"           → reembolso       (entra a GMV con signo −, ya viene negativo)
//         "dispute"          → chargeback     (NO entra a GMV bruto; rastreado aparte)
//         "payout"           → movimiento al banco — NO entra a GMV ni a fees (doble contabilización)
//         "transfer"         → transfer entre cuentas — NO entra a GMV
//         "stripe_fee"       → fee recurrente de plataforma — NO se mezcla con processing fee
//         "application_fee"  → fee de Stripe Connect — tipo APARTE (D5), nunca confundir con processing fee
//         "adjustment"       → ajuste manual de Stripe (rare). Preservado, sin clasificar.
//         null               → reporting_category desconocido. NO se inventa label.
//       NOTA: `amount` ya viene con su signo nativo de Stripe (refunds negativos).
//       NO hacemos Math.abs — el cerebro suma con signo y obtiene GMV neto.
//
//   D3. Disputes: filas `type:"dispute"` propagan amount + fee de Stripe (≈ 15€ típico).
//
//   D4. Multi-currency: cada fila preserva su `currency`. CERO conversión FX.
//
//   D5. application_fee: tipo aparte. NO se suma a `fee` (eso sería doble cobro
//       conceptual: processing fee + Connect fee son dos cosas distintas sobre
//       la misma transacción).
//
// MECÁNICA:
//   - Cents (amount/fee/net en MINOR units) → divididos /100 (number, no string).
//   - created en UNIX SECONDS → ISO string. created<=0 → null.
//   - currency llega en minúsculas ("eur") → uppercase ("EUR"). Default "EUR" cuando ausente.
//   - Filas sin `id`: descartadas (mismo patrón que el resto de normalizers).
//   - Defensividad: toNum tolera strings/null/undefined sin propagar NaN.
//
// DEUDA RESTANTE:
//   (a) Sin payload real Stripe Connect — fixtures sintéticos basados en docs
//       públicas. Verificar field paths exactos en primer connect real.
//   (b) Pagination (has_more / starting_after) es responsabilidad del sync
//       engine (decisión D6), NO de este normalizer.
//   (c) `application_fee` y `application_fee_refund` ambos categorizados como
//       "application_fee" hoy — si el cerebro necesita distinguir, añadir
//       "application_fee_refund" al mapeo. Por ahora se distinguen por signo.
//   (d) `dispute` no separa la "lost vs won" — eso vive en el objeto dispute
//       de Stripe, no en balance_transactions. Futuro, fuera de scope.

// SYNC-START: stripeNormalizer
const KNOWN_TYPES = [
  "charge",
  "refund",
  "dispute",
  "payout",
  "transfer",
  "stripe_fee",
  "application_fee",
  "adjustment",
];

function toNum(v, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function mapType(rawType) {
  // Whitelist semántica. Cualquier valor fuera de la lista → null (NUNCA
  // inventamos label — consistente con la decisión de square_payments.status).
  // `application_fee_refund` se colapsa a `application_fee`: mismo concepto,
  // el signo del `amount` ya indica si es cobro o devolución.
  if (typeof rawType !== "string") return null;
  if (rawType === "application_fee_refund") return "application_fee";
  if (KNOWN_TYPES.includes(rawType)) return rawType;
  return null;
}

export function normalizeStripeBalanceTransactions(raw) {
  const rows = Array.isArray(raw?.data) ? raw.data : [];
  const out = [];
  for (const tx of rows) {
    if (!tx || typeof tx !== "object") continue;
    const id = tx?.id;
    if (id === null || id === undefined || id === "") continue; // skip sin anchor

    // type semántico desde reporting_category (preferido), fallback a tx.type.
    // Si ninguno es conocido → null (honest absence, no se inventa).
    const rawType = tx?.reporting_category ?? tx?.type ?? null;
    const type = mapType(rawType);

    // currency llega lowercase desde Stripe; CAMBRA estándar uppercase.
    const rawCurrency = tx?.currency;
    const currency = (typeof rawCurrency === "string" && rawCurrency.length > 0)
      ? rawCurrency.toUpperCase()
      : "EUR";

    // created: UNIX seconds. <=0 / NaN → null.
    const createdSec = toNum(tx?.created, 0);
    const occurredAt = createdSec > 0
      ? new Date(createdSec * 1000).toISOString()
      : null;

    out.push({
      vertical: "payments",
      external_id: String(id),
      amount: toNum(tx?.amount) / 100,
      fee: toNum(tx?.fee) / 100,
      net: toNum(tx?.net) / 100,
      currency,
      occurred_at: occurredAt,
      type, // whitelisted o null
    });
  }
  return out;
}
// SYNC-END: stripeNormalizer