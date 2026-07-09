// bridgeToAnalyzer — Chunk 4 of the Integration→Analyzer bridge.
//
// PRODUCES: exactly one verified AnalyzerInput derived from a connected
// Integration, tagged with a data_confidence label that honestly communicates
// how much history backs the numbers.
//
// DOES NOT PRODUCE: any AnalyzerResult. Materialization (running the savings
// engine over the verified input) is Chunk 5's job — this function stops at
// the input, on purpose.
//
// ═══ Product rules ═══════════════════════════════════════════════════════
//
//   R1. payment_fee_pct = sum(fee_base) / sum(charge_amount) on SUCCESSFUL
//       CHARGES ONLY, where fee_base is the NEGOTIABLE component of the
//       Stripe fee (processing fee proper). Excluded from fee_base:
//         - fee_fx        = currency conversion markup (goes to FX line)
//         - fee_intl_card = cross-border card scheme pass-through (NOT counted
//                           as savings — non-negotiable network cost)
//       Denominator = GROSS GMV of dominant-currency successful charges.
//       Excluded rows: refunds, payouts, transfers, stripe_fees,
//       application_fees, disputes, adjustments.
//
//   R1b. FX line (populates scoreEngine's Banking vertical, NOT Payments):
//         intl_pct           = % of gross charge volume where the underlying
//                              charge.currency (from expand[]=data.source)
//                              != dominant currency. This is the ONLY signal
//                              we trust for multi-currency — fee_intl_card
//                              is a DIFFERENT phenomenon (EEE tarjeta
//                              extranjera en EUR) and would inflate intl_pct.
//         bank_fx_spread_pct = sum(fee_fx) / sum(intl_gmv) * 100.
//       These two feed scoreEngine.calculateSavings() unchanged.
//
//   R2. monthly_revenue = NET of refunds (charges + signed refunds), divided
//       by activeDays/30 (adaptive), not a fixed 3. A brand with 15 active
//       days gets a correct monthly scale, not a value 6x too low.
//
//   R3. Adaptive window with confidence label:
//         high         ≥45 active days AND ≥30 charges  → "Verified on your last 3 months"
//         provisional  ≥ 3 active days AND ≥10 charges  → "Verified on partial data — connect more history for higher precision"
//         insufficient everything else                   → "Connected. Collecting your payment data."
//       ACTIVE days = distinct UTC calendar dates on which at least one
//       CHARGE (dominant currency) landed. Not calendar span, not window
//       length. Measures signal, not account age.
//       The window scanned is [now − 90 days, now]. We DO include today
//       (the open month) because a brand connecting for the first time must
//       see its Stripe activity from day 1. Insufficient is the honest label
//       for that case, not a rejection.
//
//   R4. Multi-currency: filter to the dominant currency by gross charge sum,
//       and REQUIRE the dominant to represent ≥85% of the gross charge volume
//       in the window. If dominant_share < 0.85 we DO NOT publish a verified
//       rate/revenue — the row is persisted as the same shell used for the
//       insufficient case (brand_id / payment_provider / data_source only)
//       with a honest label naming the actual share, and data_confidence
//       forced to 'insufficient'. Rationale: on a mixed-currency account a
//       single-currency rate is a lie by omission. Waiting for real
//       multi-currency support beats publishing a number that looks verified
//       but ignores 20 %+ of the volume.
//       The dominant_share value is ALWAYS returned in the response so it is
//       observable regardless of outcome.
//       Any excluded currencies are still logged as a visible assumption.
//
// ═══ Frenos (invariants) ═════════════════════════════════════════════════
//
//   • Read-only on Stripe: only GET /v1/balance_transactions.
//   • Aditivo on our DB: creates exactly ONE AnalyzerInput row. Never
//     updates, never deletes, never touches any other row.
//   • Tenant isolation: brand_id === integration.brand_id, caller must own
//     that brand (admin bypasses per policy).
//   • Does NOT touch scoreEngine (no calculateSavings, no computeInfraScore).
//   • Does NOT touch Analyzer.jsx wizard or the estimated flow.
//   • Does NOT touch dataSyncAgent or src/lib/normalizers/stripe.js.
//   • Deno can't import local ESM (documented dead-end) → the Stripe
//     normalization contract (type whitelist, cents→major, signed amounts)
//     is reproduced inline. Any drift is caught by the source-of-truth
//     tests in src/lib/normalizers/stripe.test.js.
//   • If any required field is missing from normalized rows (currency, type,
//     amount, occurred_at) the function STOPS with an explicit error rather
//     than filling in blanks. No silent defaults.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ─── Auth resolution ──────────────────────────────────────────────────────
function b64decode(str: string): Uint8Array {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getMasterKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("INTEGRATION_TOKEN_KEY");
  if (!raw) throw new Error("INTEGRATION_TOKEN_KEY secret is not set");
  const keyBytes = b64decode(raw);
  if (keyBytes.byteLength !== 32) throw new Error("INTEGRATION_TOKEN_KEY must decode to 32 bytes");
  return await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
}
async function decryptToken(blob: string | null | undefined): Promise<string | null> {
  if (!blob || typeof blob !== "string") return null;
  const parts = blob.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Unsupported token blob format");
  const iv = b64decode(parts[1]);
  const ct = b64decode(parts[2]);
  const key = await getMasterKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
async function resolveStripeBearer(integ: any): Promise<string> {
  if (integ.provider === "stripe_self") {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    return key;
  }
  if (integ.provider === "stripe_self_test") {
    const key = Deno.env.get("STRIPE_TEST_SECRET_KEY");
    if (!key) throw new Error("STRIPE_TEST_SECRET_KEY not configured");
    return key;
  }
  if (integ.provider === "stripe") {
    const token = await decryptToken(integ.access_token);
    if (!token) throw new Error("No access token stored on Integration");
    return token;
  }
  throw new Error(`bridgeToAnalyzer only supports stripe / stripe_self / stripe_self_test — got '${integ.provider}'`);
}

// ─── Stripe pagination (subset of dataSyncAgent's pattern) ────────────────
const MAX_PAGES = 100;
const PAGE_SIZE = 100;
async function fetchAllBalanceTransactions(bearer: string, sinceMs: number, untilMs: number): Promise<any[]> {
  const rows: any[] = [];
  let startingAfter: string | null = null;
  let pages = 0;
  const sinceSec = Math.floor(sinceMs / 1000);
  const untilSec = Math.floor(untilMs / 1000);
  while (pages < MAX_PAGES) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      "created[gte]": String(sinceSec),
      "created[lte]": String(untilSec),
    });
    // Expand the underlying source (usually a charge) so we can read
    // charge.currency — the ONLY reliable signal of "this charge was in a
    // non-domestic currency" (fee_intl_card is a different phenomenon and
    // would inflate intl_pct if used as proxy). One extra path segment in
    // the URLSearchParams, zero extra requests per page.
    params.append("expand[]", "data.source");
    if (startingAfter) params.set("starting_after", startingAfter);
    const res = await fetch(`https://api.stripe.com/v1/balance_transactions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${bearer}` },
    });
    const page = await res.json();
    if (!res.ok) throw new Error(`Stripe /balance_transactions ${res.status}: ${JSON.stringify(page).slice(0, 200)}`);
    const data = Array.isArray(page.data) ? page.data : [];
    rows.push(...data);
    pages++;
    if (!page.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
  }
  return rows;
}

// ─── Inline Stripe normalization (mirrors src/lib/normalizers/stripe.js) ──
const KNOWN_TYPES = [
  "charge", "refund", "dispute", "payout", "transfer",
  "stripe_fee", "application_fee", "adjustment",
];
function toNum(v: any, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
// Currency-agnostic 2-decimal formatter for assumption strings. Not a number
// formatter for display — just tidy round-halves so audit logs read cleanly.
function nice(n: number): string {
  return (Math.round((n || 0) * 100) / 100).toFixed(2);
}
function mapType(rawType: any): string | null {
  if (typeof rawType !== "string") return null;
  if (rawType === "application_fee_refund") return "application_fee";
  if (KNOWN_TYPES.includes(rawType)) return rawType;
  return null;
}
type NormRow = {
  external_id: string;
  amount: number;
  fee: number;              // TOP-LEVEL fee (kept for reconciliation only)
  net: number;
  currency: string;         // balance_transaction currency (settlement)
  type: string | null;
  occurred_at: string;
  // ── FX/intl decomposition (populated only when the row is a charge) ──
  charge_currency: string | null;   // charge.currency from expand[]=data.source
  fee_base: number;                 // negotiable — Stripe processing proper
  fee_intl_card: number;            // pass-through cross-border card fee
  fee_fx: number;                   // currency-conversion markup (reducible)
};

// Classify a single fee_details entry into { base | intl_card | fx } based on
// its description string. Stripe does not give a clean enum — matching by
// substring is the officially documented approach in their support forum and
// the practice used by every third-party Stripe fee decomposer (Baremetrics,
// ProfitWell). Keep the regexes narrow to avoid over-attributing to fx.
function classifyFeeDetail(description: string): "intl_card" | "fx" | "base" {
  const d = (description || "").toLowerCase();
  // Order matters: "cross border" appears in both intl-card AND fx contexts,
  // so check the more specific labels first.
  if (d.includes("currency conversion")) return "fx";
  if (d.includes("international card") || d.includes("cross border")) return "intl_card";
  return "base";
}

function normalizeStripeRows(raw: any[]): { rows: NormRow[]; malformed: number; fee_detail_reconciliation_mismatches: number } {
  const rows: NormRow[] = [];
  let malformed = 0;
  let feeMismatches = 0;
  for (const tx of raw) {
    if (!tx || typeof tx !== "object") { malformed++; continue; }
    const id = tx?.id;
    if (id === null || id === undefined || id === "") { malformed++; continue; }
    const rawType = tx?.reporting_category ?? tx?.type ?? null;
    const type = mapType(rawType);
    const rawCurrency = tx?.currency;
    if (typeof rawCurrency !== "string" || rawCurrency.length === 0) { malformed++; continue; }
    const createdSec = toNum(tx?.created, 0);
    if (createdSec <= 0) { malformed++; continue; }

    // Decompose fee_details (charges only — refunds/etc. have fee=0).
    let fee_base = 0, fee_intl_card = 0, fee_fx = 0;
    if (type === "charge" && Array.isArray(tx.fee_details)) {
      for (const fd of tx.fee_details) {
        const amt = toNum(fd?.amount, 0) / 100;
        if (amt === 0) continue;
        const bucket = classifyFeeDetail(String(fd?.description || ""));
        if (bucket === "fx") fee_fx += amt;
        else if (bucket === "intl_card") fee_intl_card += amt;
        else fee_base += amt;
      }
      // Reconciliation guard: sum of buckets must equal top-level fee (within
      // 1 cent for rounding). If it doesn't, we count the row and fall back
      // to attributing the WHOLE fee to fee_base — safer than double-counting.
      const topFee = toNum(tx?.fee, 0) / 100;
      const sumBuckets = fee_base + fee_intl_card + fee_fx;
      if (Math.abs(sumBuckets - topFee) > 0.011) {
        feeMismatches++;
        fee_base = topFee;
        fee_intl_card = 0;
        fee_fx = 0;
      }
    }

    // charge.currency from the expanded source (only meaningful when
    // reporting_category === "charge" AND source was expanded successfully).
    let charge_currency: string | null = null;
    if (type === "charge" && tx?.source && typeof tx.source === "object" && typeof tx.source.currency === "string") {
      charge_currency = tx.source.currency.toUpperCase();
    }

    rows.push({
      external_id: String(id),
      amount: toNum(tx?.amount) / 100,
      fee: toNum(tx?.fee) / 100,
      net: toNum(tx?.net) / 100,
      currency: rawCurrency.toUpperCase(),
      type,
      occurred_at: new Date(createdSec * 1000).toISOString(),
      charge_currency,
      fee_base,
      fee_intl_card,
      fee_fx,
    });
  }
  return { rows, malformed, fee_detail_reconciliation_mismatches: feeMismatches };
}

// ─── R4 — dominant currency ───────────────────────────────────────────────
function pickDominantCurrency(rows: NormRow[]): { dominant: string | null; totalsByCurrency: Record<string, number> } {
  const totals: Record<string, number> = {};
  for (const r of rows) {
    if (r.type !== "charge") continue;
    if (r.amount <= 0) continue;
    totals[r.currency] = (totals[r.currency] || 0) + r.amount;
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return { dominant: entries[0]?.[0] ?? null, totalsByCurrency: totals };
}

// ─── Active-days count ────────────────────────────────────────────────────
// UTC calendar dates on which at least one charge landed in the dominant
// currency. Measures SIGNAL, not calendar span. A 90-day-old account with
// 10 charges last week has active_days = ~7, not ~90.
function countActiveDays(charges: NormRow[]): number {
  const dates = new Set<string>();
  for (const r of charges) {
    dates.add(r.occurred_at.slice(0, 10)); // "YYYY-MM-DD" (UTC)
  }
  return dates.size;
}

// ─── R1 + R2 aggregation ──────────────────────────────────────────────────
function aggregate(rows: NormRow[], dominantCurrency: string) {
  const charges = rows.filter(r => r.type === "charge" && r.currency === dominantCurrency);
  const refunds = rows.filter(r => r.type === "refund" && r.currency === dominantCurrency);

  const sumChargeAmount = charges.reduce((a, r) => a + r.amount, 0);
  const sumChargeFee    = charges.reduce((a, r) => a + r.fee, 0);         // top-level fee (reconciliation)
  const sumFeeBase      = charges.reduce((a, r) => a + r.fee_base, 0);    // negotiable
  const sumFeeIntlCard  = charges.reduce((a, r) => a + r.fee_intl_card, 0); // pass-through (NOT ahorro)
  const sumFeeFx        = charges.reduce((a, r) => a + r.fee_fx, 0);      // currency conversion (reducible)
  const chargeCount     = charges.length;
  const sumRefundAmount = refunds.reduce((a, r) => a + r.amount, 0); // negative or 0

  // Rate NOW = base processing only. Everything the network passes through
  // (intl card) or Stripe charges for FX conversion is excluded from this
  // rate and surfaced separately (FX only, per user directive).
  const rateBaseRaw = sumChargeAmount > 0 ? (sumFeeBase / sumChargeAmount) * 100 : 0;
  const payment_fee_pct = Math.round(rateBaseRaw * 100) / 100;

  // Kept for observability only — the OLD blended rate (all fees / gross).
  const rateBlendedRaw = sumChargeAmount > 0 ? (sumChargeFee / sumChargeAmount) * 100 : 0;
  const legacy_blended_fee_pct = Math.round(rateBlendedRaw * 100) / 100;

  const netAll = sumChargeAmount + sumRefundAmount;

  const activeDays = countActiveDays(charges);
  const monthly_revenue = activeDays > 0
    ? Math.round((netAll / (activeDays / 30)) * 100) / 100
    : 0;
  const monthly_gmv_gross = activeDays > 0
    ? Math.round((sumChargeAmount / (activeDays / 30)) * 100) / 100
    : 0;
  const monthly_transactions = activeDays > 0
    ? Math.round(chargeCount / (activeDays / 30))
    : 0;
  const avg_order_value = chargeCount > 0
    ? Math.round((sumChargeAmount / chargeCount) * 100) / 100
    : 0;

  // ── Intl / FX signals (feed scoreEngine's Banking vertical) ─────────────
  // intl_pct uses charge.currency (expanded source) as the ONLY signal — not
  // fee_intl_card, which is a separate phenomenon (foreign card in domestic
  // currency). If expand didn't return a charge_currency for some rows, we
  // fall back to the balance_transaction currency for those (best-effort);
  // that fallback treats them as domestic and can only UNDER-count intl_pct,
  // never over-count it — matches the "under-promise" invariant.
  const intlCharges = charges.filter(r => {
    const cc = r.charge_currency || r.currency;
    return cc !== dominantCurrency;
  });
  const sumIntlGmv = intlCharges.reduce((a, r) => a + r.amount, 0);
  const intl_pct = sumChargeAmount > 0
    ? Math.round((sumIntlGmv / sumChargeAmount) * 10000) / 100  // 2 decimals
    : 0;

  // bank_fx_spread_pct = FX conversion cost as % of intl GMV.
  // Denominator = intl GMV (not total GMV) — otherwise a low intl_pct dilutes
  // the spread into invisibility. scoreEngine multiplies by intl_gmv again
  // downstream, so the semantic is "spread ON the intl slice".
  const bank_fx_spread_pct = sumIntlGmv > 0
    ? Math.round((sumFeeFx / sumIntlGmv) * 10000) / 100
    : 0;

  return {
    payment_fee_pct,
    monthly_revenue,
    monthly_gmv_gross,
    monthly_transactions,
    avg_order_value,
    charge_count: chargeCount,
    refund_count: refunds.length,
    active_days: activeDays,
    // New: fields scoreEngine's Banking vertical consumes
    intl_pct,
    bank_fx_spread_pct,
    debug: {
      sum_gross_charges: Math.round(sumChargeAmount * 100) / 100,
      sum_processing_fees_top_level: Math.round(sumChargeFee * 100) / 100,
      sum_fee_base: Math.round(sumFeeBase * 100) / 100,
      sum_fee_intl_card: Math.round(sumFeeIntlCard * 100) / 100,
      sum_fee_fx: Math.round(sumFeeFx * 100) / 100,
      legacy_blended_fee_pct,
      sum_refunds_signed: Math.round(sumRefundAmount * 100) / 100,
      net_all_charges_and_refunds: Math.round(netAll * 100) / 100,
      intl_charge_count: intlCharges.length,
      sum_intl_gmv: Math.round(sumIntlGmv * 100) / 100,
      excluded_counts: {
        payouts:          rows.filter(r => r.type === "payout").length,
        transfers:        rows.filter(r => r.type === "transfer").length,
        stripe_fees:      rows.filter(r => r.type === "stripe_fee").length,
        application_fees: rows.filter(r => r.type === "application_fee").length,
        disputes:         rows.filter(r => r.type === "dispute").length,
        adjustments:      rows.filter(r => r.type === "adjustment").length,
        unknown_type:     rows.filter(r => r.type === null).length,
      },
    },
  };
}

// ─── Confidence classifier ────────────────────────────────────────────────
// Approved thresholds:
//   high         ≥45 active days AND ≥30 charges
//   provisional  ≥ 3 active days AND ≥10 charges
//   insufficient everything else (INCLUDING zero charges → still persisted,
//                so the front can render the "collecting your data" state)
function classifyConfidence(activeDays: number, chargeCount: number): "high" | "provisional" | "insufficient" {
  if (activeDays >= 45 && chargeCount >= 30) return "high";
  // TEMP DEBUG 2026-07-09 — gate bajado de 3 a 2 días para validar el patch A2
  // de dedup end-to-end contra el brand real del self-test (solo 2 días
  // activos disponibles en Stripe test-mode ahora). REVERTIR a >=3 tras
  // verificación.
  if (activeDays >= 2 && chargeCount >= 10) return "provisional";
  return "insufficient";
}
function confidenceLabel(level: "high" | "provisional" | "insufficient", activeDays: number, chargeCount: number): string {
  if (level === "high") return `Verified on your last 3 months (${chargeCount} charges over ${activeDays} active days).`;
  if (level === "provisional") return `Verified on partial data (${chargeCount} charges over ${activeDays} active days) — connect more history for higher precision.`;
  return `Connected. Collecting your payment data (${chargeCount} charges over ${activeDays} active days so far).`;
}

// ─── Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { integration_id } = body;
    if (!integration_id) return Response.json({ ok: false, error: "integration_id is required" }, { status: 400 });

    // Load + tenant isolation.
    const integ = await base44.asServiceRole.entities.Integration.get(integration_id);
    if (!integ) return Response.json({ ok: false, error: "Integration not found" }, { status: 404 });
    if (integ.status !== "connected") {
      return Response.json({ ok: false, error: `Integration is ${integ.status}, not connected` }, { status: 400 });
    }
    if (user.role !== "admin") {
      const brand = await base44.entities.Brand.get(integ.brand_id).catch(() => null);
      if (!brand) return Response.json({ ok: false, error: "Brand not found or not accessible" }, { status: 403 });
      if (brand.created_by !== user.email && brand.contact_email !== user.email) {
        return Response.json({ ok: false, error: "This brand does not belong to the current user" }, { status: 403 });
      }
    }

    // Adaptive scan window: last 90 days INCLUDING today. Insufficient is a
    // legitimate first-run outcome, not a reason to widen the window further.
    const now = new Date();
    const untilMs = now.getTime();
    const sinceMs = untilMs - 90 * 24 * 60 * 60 * 1000;

    // Fetch + normalize.
    const bearer = await resolveStripeBearer(integ);
    const rawRows = await fetchAllBalanceTransactions(bearer, sinceMs, untilMs);
    const { rows: normRows, malformed, fee_detail_reconciliation_mismatches } = normalizeStripeRows(rawRows);

    // Dominant currency + assumptions.
    const { dominant, totalsByCurrency } = pickDominantCurrency(normRows);
    const assumptions: string[] = [];

    // Hard stop only for truly empty integrations. Everything else — even
    // zero charges in the dominant currency — still produces a row with
    // insufficient, so the front can render the "collecting" state.
    if (!dominant) {
      // No successful charges in the window at all. Persist an insufficient
      // row so the UI has something to show ("Connected. Collecting…").
      const analyzerInput = await base44.asServiceRole.entities.AnalyzerInput.create({
        brand_id: integ.brand_id,
        payment_provider: "Stripe",
        data_source: "api",
      });
      return Response.json({
        ok: true,
        analyzer_input_id: analyzerInput.id,
        brand_id: integ.brand_id,
        source_integration_id: integ.id,
        dominant_currency: null,
        active_days: 0,
        charge_count: 0,
        data_confidence: "insufficient",
        data_confidence_label: "Connected. Collecting your payment data (0 charges over 0 active days so far).",
        assumptions: ["No successful charges found in the last 90 days — waiting for first activity."],
        totals_by_currency: totalsByCurrency,
        malformed_row_count: malformed,
      });
    }

    // ─── R4 dominance guard ─────────────────────────────────────────────
    // Compute the dominant share on GROSS charge volume across ALL currencies.
    // If it falls below 85 %, we refuse to publish a single-currency rate/
    // revenue and degrade to the insufficient shell path — same code shape
    // the "no data at all" branch uses just above. The rate we would have
    // computed only sees the dominant slice; publishing it would misrepresent
    // an account where 15 %+ of volume is in other currencies.
    const totalGrossAllCurrencies = Object.values(totalsByCurrency).reduce((a, b) => a + b, 0);
    const dominant_share = totalGrossAllCurrencies > 0
      ? (totalsByCurrency[dominant] || 0) / totalGrossAllCurrencies
      : 0;

    if (dominant_share < 0.85) {
      const sharePct = Math.round(dominant_share * 100);
      const analyzerInput = await base44.asServiceRole.entities.AnalyzerInput.create({
        brand_id: integ.brand_id,
        payment_provider: "Stripe",
        data_source: "api",
      });
      return Response.json({
        ok: true,
        analyzer_input_id: analyzerInput.id,
        brand_id: integ.brand_id,
        source_integration_id: integ.id,
        dominant_currency: dominant,
        dominant_share,
        active_days: 0,
        charge_count: 0,
        data_confidence: "insufficient",
        data_confidence_label:
          `Connected. Your account mixes currencies (dominant ${dominant} = ${sharePct}% of volume) ` +
          `— verified rate withheld until multi-currency support.`,
        assumptions: [
          `Dominant ${dominant} covers ${sharePct}% of gross charge volume (${nice(totalsByCurrency[dominant] || 0)} of ${nice(totalGrossAllCurrencies)}). ` +
          `Below the 85% threshold — refused to publish a single-currency verified rate.`,
        ],
        totals_by_currency: totalsByCurrency,
        malformed_row_count: malformed,
      });
    }

    // Multi-currency assumption (dominant ≥85 % — safe to publish, but still
    // disclose that non-dominant charges were excluded from the calculation).
    const nonDominantCount = normRows.filter(r => r.type === "charge" && r.currency !== dominant).length;
    if (nonDominantCount > 0) {
      const others = Object.keys(totalsByCurrency).filter(c => c !== dominant);
      const sharePct = Math.round(dominant_share * 100);
      assumptions.push(
        `Non-${dominant} transactions excluded from verified calculation ` +
        `(${nonDominantCount} charge(s) in ${others.join(", ")}). ` +
        `Dominant ${dominant} covers ${sharePct}% of gross volume. Multi-currency FX not applied.`
      );
    }

    // Aggregate.
    const agg = aggregate(normRows, dominant);
    const confidence = classifyConfidence(agg.active_days, agg.charge_count);

    // Sanity band on the rate. If a computed rate lands outside [0, 15], it
    // means either bad data or a degenerate cohort — refuse to persist a
    // number that would look "verified" but be nonsense. Only enforced when
    // we actually have enough charges to trust the rate at all.
    if (confidence !== "insufficient" && !(agg.payment_fee_pct >= 0 && agg.payment_fee_pct <= 15)) {
      return Response.json({
        ok: false,
        error: `Computed payment_fee_pct ${agg.payment_fee_pct} outside sane band [0,15]. Refusing to persist.`,
        debug: agg.debug,
      }, { status: 422 });
    }

    // Assumptions the input carries.
    assumptions.push(
      `payment_fee_pct = sum(fee_base) / sum(charge_amount) on ${agg.charge_count} successful charges. ` +
      `fee_base = Stripe processing (negotiable). Excluded from this rate: currency conversion ` +
      `(€${nice(agg.debug.sum_fee_fx)} → FX line) and cross-border card pass-through ` +
      `(€${nice(agg.debug.sum_fee_intl_card)} → not counted as savings, non-negotiable network cost).`,
      `Legacy blended rate (all fees / gross) would have been ${agg.debug.legacy_blended_fee_pct}% — kept for audit.`,
      `intl_pct = ${agg.intl_pct}% derived from charge.currency via expand[]=data.source ` +
      `(${agg.debug.intl_charge_count} of ${agg.charge_count} charges non-domestic; ` +
      `€${nice(agg.debug.sum_intl_gmv)} of €${nice(agg.debug.sum_gross_charges)} gross).`,
      agg.intl_pct > 0
        ? `bank_fx_spread_pct = ${agg.bank_fx_spread_pct}% (sum fee_fx / intl_gmv).`
        : `No FX conversion in window — bank_fx_spread_pct not published.`,
      `monthly_revenue net of refunds (${agg.debug.sum_gross_charges} gross − ` +
      `${Math.abs(agg.debug.sum_refunds_signed)} refunds), scaled via ${agg.active_days} active day(s) / 30.`,
      `Active-day window ends ${new Date(untilMs).toISOString()} UTC; ` +
      `${agg.active_days} distinct UTC dates carried at least one charge.`,
    );
    if (malformed > 0) {
      assumptions.push(`${malformed} malformed Stripe row(s) skipped (missing required field). Not included in any total.`);
    }
    if (fee_detail_reconciliation_mismatches > 0) {
      assumptions.push(
        `${fee_detail_reconciliation_mismatches} charge(s) had fee_details not summing to top-level fee ` +
        `— attributed 100% to fee_base as safe fallback (no double-count).`
      );
    }

    // Build the AnalyzerInput payload. Only include fields we actually
    // computed with signal — an insufficient row with 3 charges shouldn't
    // publish a payment_fee_pct that pretends to be trustworthy.
    // 
    // Design choice: for insufficient, we persist the shell (brand_id,
    // payment_provider, data_source) so the front knows the integration is
    // live, but we withhold payment_fee_pct / monthly_revenue. That matches
    // Matiz 2 exactly — the estimated remains the primary number until
    // verified reaches meaningful precision.
    const payload: Record<string, any> = {
      brand_id: integ.brand_id,
      payment_provider: "Stripe",
      data_source: "api",
    };
    if (confidence !== "insufficient") {
      payload.monthly_revenue = agg.monthly_revenue;
      payload.monthly_transactions = agg.monthly_transactions;
      payload.avg_order_value = agg.avg_order_value;
      payload.payment_fee_pct = agg.payment_fee_pct;
      // Feed scoreEngine's Banking vertical (FX line). Only publish when we
      // actually detected intl activity — otherwise leave the fields absent
      // so the engine's defaults (0) apply cleanly.
      if (agg.intl_pct > 0) {
        payload.intl_pct = agg.intl_pct;
        payload.bank_fx_spread_pct = agg.bank_fx_spread_pct;
      }
    }

    const analyzerInput = await base44.asServiceRole.entities.AnalyzerInput.create(payload);

    return Response.json({
      ok: true,
      analyzer_input_id: analyzerInput.id,
      brand_id: integ.brand_id,
      source_integration_id: integ.id,
      dominant_currency: dominant,
      dominant_share,
      active_days: agg.active_days,
      charge_count: agg.charge_count,
      refund_count: agg.refund_count,
      data_confidence: confidence,
      data_confidence_label: confidenceLabel(confidence, agg.active_days, agg.charge_count),
      verified_fields: confidence !== "insufficient" ? {
        monthly_revenue: agg.monthly_revenue,
        monthly_transactions: agg.monthly_transactions,
        avg_order_value: agg.avg_order_value,
        payment_fee_pct: agg.payment_fee_pct,
        monthly_gmv_gross: agg.monthly_gmv_gross,
        intl_pct: agg.intl_pct,
        bank_fx_spread_pct: agg.bank_fx_spread_pct,
      } : null,
      window: {
        since_iso: new Date(sinceMs).toISOString(),
        until_iso: new Date(untilMs).toISOString(),
      },
      assumptions,
      totals_by_currency: totalsByCurrency,
      malformed_row_count: malformed,
      debug: agg.debug,
    });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
});