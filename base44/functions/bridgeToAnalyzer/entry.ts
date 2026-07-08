// bridgeToAnalyzer — Chunk 4 of the Integration→Analyzer bridge.
//
// PRODUCES: a single verified AnalyzerInput derived from a connected Integration.
// DOES NOT PRODUCE: an AnalyzerResult. Materialization (running the savings
// engine on the verified input) belongs to Chunk 5 — this function stops at
// the input.
//
// ─── Product rules (verbatim from the plan — implemented exactly) ─────────
//
//   R1. payment_fee_pct = sum(fee) / sum(amount) over SUCCESSFUL CHARGES ONLY.
//       Denominator = GROSS GMV (what was processed).
//       Excluded from the rate calculation: refunds, payouts, transfers,
//       stripe_fees, application_fees, disputes. Only clean charges count.
//
//   R2. monthly_revenue = NET of refunds (charges − refunds), for tier
//       detection / business sizing. DIFFERENT from R1's denominator (which
//       is gross). Two distinct uses of the same underlying data — do not
//       conflate them.
//
//   R3. Time window = mean of the LAST 3 CLOSED CALENDAR MONTHS. Not the
//       current in-progress month (incomplete), not a single month (noisy).
//       Example (run on 2026-07-08 Europe/Madrid): window = [2026-04-01,
//       2026-07-01) — April, May, June. July is excluded because it is not
//       yet a closed month.
//
//   R4. Multi-currency = filter to the dominant currency by gross GMV, log
//       the exclusion as a visible assumption on the produced AnalyzerInput.
//
// ─── Frenos (invariants that MUST hold) ───────────────────────────────────
//
//   • Read-only on Stripe: only GET /v1/balance_transactions is issued.
//   • Aditivo on our DB: creates ONE AnalyzerInput. Never updates or deletes.
//   • Tenant isolation: AnalyzerInput.brand_id === integration.brand_id, and
//     the caller must own that brand (admin bypasses per policy).
//   • Does NOT touch the score engine.
//   • Does NOT touch the estimated flow (Analyzer.jsx wizard is untouched).
//   • Cero duplicación del motor: no calculateSavings here.
//
// ─── Inputs ───────────────────────────────────────────────────────────────
//
//   { integration_id: string }
//
// ─── Outputs ──────────────────────────────────────────────────────────────
//
//   { ok: true, analyzer_input_id, verified_fields, assumptions,
//     window: { since_iso, until_iso, months }, sample_totals }
//
// ─── Why this is a NEW function (not an addition to dataSyncAgent) ────────
//
//   dataSyncAgent is a generic READER: it fetches + normalizes + returns.
//   This function is a specialized AGGREGATOR: it applies the 4 product
//   rules to build a single verified AnalyzerInput. Mixing them would (a)
//   force every future provider bridge to go through the same aggregator
//   even when it doesn't apply, (b) push product logic into an
//   infrastructure component. Kept separate on purpose.
//
//   Deno cannot import src/lib/normalizers/stripe.js (documented dead-end),
//   so the SAME normalization contract (type whitelist, cents→major, signed
//   amounts) is reproduced inline. Any drift is caught by
//   src/lib/normalizers/stripe.test.js against the source of truth.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ─── Auth resolution (subset of dataSyncAgent, kept minimal) ──────────────
// We only need: Stripe OAuth Bearer OR Stripe static_secret. Nothing else.
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

// Resolve the Bearer token to use for Stripe calls, based on the Integration's
// provider slug. Supports the three Stripe entries currently in the registry:
//   - stripe            → OAuth (Bearer stored encrypted in Integration.access_token)
//   - stripe_self       → static_secret (STRIPE_SECRET_KEY env var, admin only)
//   - stripe_self_test  → static_secret (STRIPE_TEST_SECRET_KEY env var, admin only)
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

// ─── R3 — closed-calendar-month window ────────────────────────────────────
// Returns [sinceUtcMs, untilUtcMs) with:
//   - untilUtcMs = first day of the CURRENT month at 00:00 UTC (exclusive).
//     "Current" is defined by `now.getUTCFullYear()` / `getUTCMonth()`.
//     Using UTC anchors is the safe default for Stripe (its `created` is UTC
//     seconds); a Europe/Madrid-anchored window would introduce a 1-2 hour
//     boundary drift that could put a real payment on the wrong side of the
//     month. If we ever need brand-local month boundaries we take the brand
//     timezone as an explicit input — not silent DST magic.
//   - sinceUtcMs = untilUtcMs shifted back 3 calendar months.
// Example on 2026-07-08:
//   until = 2026-07-01T00:00:00Z (exclusive)
//   since = 2026-04-01T00:00:00Z (inclusive)
//   months = ["2026-04", "2026-05", "2026-06"]
function computeClosedMonthWindow(now: Date): { sinceMs: number; untilMs: number; monthsCovered: string[]; sinceIso: string; untilIso: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const untilMs = Date.UTC(y, m, 1, 0, 0, 0);            // first day of current month
  const sinceMs = Date.UTC(y, m - 3, 1, 0, 0, 0);        // Date.UTC handles negative months by rolling year

  const monthsCovered: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(Date.UTC(y, m - 3 + i, 1));
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    monthsCovered.push(`${d.getUTCFullYear()}-${mm}`);
  }
  return {
    sinceMs,
    untilMs,
    monthsCovered,
    sinceIso: new Date(sinceMs).toISOString(),
    untilIso: new Date(untilMs).toISOString(),
  };
}

// ─── Stripe pagination (Stripe cursor style, subset of dataSyncAgent) ─────
const MAX_PAGES = 100;   // hard safety cap; 100 pages × 100 rows = 10K txns
const PAGE_SIZE = 100;

async function fetchAllBalanceTransactions(bearer: string, sinceMs: number, untilMs: number): Promise<any[]> {
  const rows: any[] = [];
  let startingAfter: string | null = null;
  let pages = 0;
  const sinceSec = Math.floor(sinceMs / 1000);
  const untilSec = Math.floor(untilMs / 1000) - 1; // inclusive upper bound in seconds
  while (pages < MAX_PAGES) {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      "created[gte]": String(sinceSec),
      "created[lte]": String(untilSec),
    });
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
// SAME contract, verified functionally-equivalent. Kept inline because Deno
// cannot import local ESM modules.
const KNOWN_TYPES = [
  "charge", "refund", "dispute", "payout", "transfer",
  "stripe_fee", "application_fee", "adjustment",
];
function toNum(v: any, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
function mapType(rawType: any): string | null {
  if (typeof rawType !== "string") return null;
  if (rawType === "application_fee_refund") return "application_fee";
  if (KNOWN_TYPES.includes(rawType)) return rawType;
  return null;
}
function normalizeStripeRows(raw: any[]): Array<{ external_id: string; amount: number; fee: number; net: number; currency: string; type: string | null; occurred_at: string | null }> {
  const out: Array<any> = [];
  for (const tx of raw) {
    if (!tx || typeof tx !== "object") continue;
    const id = tx?.id;
    if (id === null || id === undefined || id === "") continue;
    const rawType = tx?.reporting_category ?? tx?.type ?? null;
    const type = mapType(rawType);
    const rawCurrency = tx?.currency;
    const currency = (typeof rawCurrency === "string" && rawCurrency.length > 0)
      ? rawCurrency.toUpperCase()
      : "EUR";
    const createdSec = toNum(tx?.created, 0);
    const occurredAt = createdSec > 0 ? new Date(createdSec * 1000).toISOString() : null;
    out.push({
      external_id: String(id),
      amount: toNum(tx?.amount) / 100,
      fee: toNum(tx?.fee) / 100,
      net: toNum(tx?.net) / 100,
      currency,
      type,
      occurred_at: occurredAt,
    });
  }
  return out;
}

// ─── R4 — dominant currency selection ─────────────────────────────────────
// Rank currencies by SUM OF GROSS CHARGE AMOUNTS (not by count and not by
// net — R1's denominator is gross, and we want the currency that matches
// the same universe of rows R1 will aggregate over).
function pickDominantCurrency(rows: ReturnType<typeof normalizeStripeRows>): { dominant: string; totalsByCurrency: Record<string, number> } {
  const totals: Record<string, number> = {};
  for (const r of rows) {
    if (r.type !== "charge") continue;
    if (r.amount <= 0) continue;
    totals[r.currency] = (totals[r.currency] || 0) + r.amount;
  }
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return { dominant: "EUR", totalsByCurrency: totals };
  return { dominant: entries[0][0], totalsByCurrency: totals };
}

// ─── R1 + R2 — aggregation ────────────────────────────────────────────────
function aggregate(rows: ReturnType<typeof normalizeStripeRows>, dominantCurrency: string, monthsCount: number) {
  // R1 universe: successful charges in the dominant currency only.
  // "Successful" in Stripe balance_transactions means the row EXISTS as a
  // charge (failed charges don't produce balance_transaction rows). Refunds
  // are separate rows with reporting_category="refund", so filtering to
  // type==="charge" gives us the clean numerator/denominator for the rate.
  const charges = rows.filter(r => r.type === "charge" && r.currency === dominantCurrency);
  const refunds = rows.filter(r => r.type === "refund" && r.currency === dominantCurrency);

  const sumChargeAmount = charges.reduce((a, r) => a + r.amount, 0);     // gross processed
  const sumChargeFee    = charges.reduce((a, r) => a + r.fee, 0);        // processing fees only
  const chargeCount     = charges.length;

  // R2: NET revenue = charges + refunds (refund.amount is negative in Stripe).
  // Signed sum — do not Math.abs the refund.
  const sumRefundAmount = refunds.reduce((a, r) => a + r.amount, 0);     // negative or zero
  const netThreeMonth   = sumChargeAmount + sumRefundAmount;

  // R1 rate: rounded to 2 decimals so the AnalyzerInput carries a stable
  // number (matches the wizard's payment_fee_pct precision).
  const rateRaw = sumChargeAmount > 0 ? (sumChargeFee / sumChargeAmount) * 100 : 0;
  const payment_fee_pct = Math.round(rateRaw * 100) / 100;

  // R3 window is 3 closed months → divide by 3 for monthly averages.
  const monthly_revenue = Math.round((netThreeMonth / monthsCount) * 100) / 100;
  const monthly_gmv_gross = Math.round((sumChargeAmount / monthsCount) * 100) / 100;
  const monthly_transactions = Math.round(chargeCount / monthsCount);
  const avg_order_value = chargeCount > 0
    ? Math.round((sumChargeAmount / chargeCount) * 100) / 100
    : 0;

  return {
    payment_fee_pct,
    monthly_revenue,
    monthly_gmv_gross,
    monthly_transactions,
    avg_order_value,
    debug: {
      three_month_gross_charges: Math.round(sumChargeAmount * 100) / 100,
      three_month_total_fees:    Math.round(sumChargeFee * 100) / 100,
      three_month_refunds:       Math.round(sumRefundAmount * 100) / 100,
      three_month_net_revenue:   Math.round(netThreeMonth * 100) / 100,
      charge_count:              chargeCount,
      refund_count:              refunds.length,
      // Counts of the 6 excluded types — proof they were seen and excluded.
      excluded: {
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

// ─── Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { integration_id } = body;
    if (!integration_id) return Response.json({ ok: false, error: "integration_id is required" }, { status: 400 });

    // Load Integration + tenant isolation.
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

    // R3 — closed-month window.
    const window = computeClosedMonthWindow(new Date());

    // Fetch + normalize.
    const bearer = await resolveStripeBearer(integ);
    const rawRows = await fetchAllBalanceTransactions(bearer, window.sinceMs, window.untilMs);
    const normRows = normalizeStripeRows(rawRows);

    if (normRows.length === 0) {
      return Response.json({
        ok: false,
        error: "No balance transactions in the last 3 closed months — cannot produce a verified input.",
        window,
      }, { status: 422 });
    }

    // R4 — dominant currency + assumption logging.
    const { dominant, totalsByCurrency } = pickDominantCurrency(normRows);
    const assumptions: string[] = [];
    const nonDominantCount = normRows.filter(r => r.type === "charge" && r.currency !== dominant).length;
    if (nonDominantCount > 0) {
      const others = Object.keys(totalsByCurrency).filter(c => c !== dominant);
      assumptions.push(
        `Non-${dominant} transactions excluded from verified calculation (` +
        `${nonDominantCount} charge(s) in ${others.join(", ")}). ` +
        `Multi-currency FX not applied.`
      );
    }

    // R1 + R2 — aggregation over the closed-month window.
    const agg = aggregate(normRows, dominant, 3);

    // Guard: refuse to persist a rate that fell outside the sane band the
    // wizard uses. This is the same 0-15% band `validateAnalyzerInput` enforces
    // — mirroring it here surfaces bad data (e.g. a dominant currency with
    // €0.01 charges) at the source instead of silently making it a "verified"
    // number. If we hit this, the caller sees the reason in the response.
    if (!(agg.payment_fee_pct >= 0 && agg.payment_fee_pct <= 15)) {
      return Response.json({
        ok: false,
        error: `Computed payment_fee_pct ${agg.payment_fee_pct} outside sane band [0,15]. Refusing to persist.`,
        window,
        debug: agg.debug,
      }, { status: 422 });
    }

    // Baseline assumptions logged onto the input for audit.
    assumptions.push(
      `Rate = sum(fee)/sum(amount) on successful charges only (${agg.debug.charge_count} charges); ` +
      `refunds/payouts/transfers/stripe_fees/application_fees/disputes/adjustments excluded from the rate.`,
      `monthly_revenue net of refunds: ${agg.monthly_revenue} ${dominant}/mo ` +
      `(gross ${agg.monthly_gmv_gross} − refunds ${Math.abs(agg.debug.three_month_refunds)} averaged over 3 months).`,
      `Window: 3 closed calendar months ${window.monthsCovered.join(", ")} (UTC-anchored).`,
    );

    // Persist the AnalyzerInput. Aditivo: solo Create.
    // We deliberately DO NOT touch AnalyzerResult here (Chunk 5 owns that).
    const analyzerInput = await base44.asServiceRole.entities.AnalyzerInput.create({
      brand_id: integ.brand_id,
      monthly_revenue: agg.monthly_revenue,
      monthly_transactions: agg.monthly_transactions,
      avg_order_value: agg.avg_order_value,
      payment_provider: "Stripe",
      payment_fee_pct: agg.payment_fee_pct,
      data_source: "api",
    });

    return Response.json({
      ok: true,
      analyzer_input_id: analyzerInput.id,
      brand_id: integ.brand_id,
      source_integration_id: integ.id,
      dominant_currency: dominant,
      window: {
        since_iso: window.sinceIso,
        until_iso: window.untilIso,
        months: window.monthsCovered,
      },
      verified_fields: {
        monthly_revenue: agg.monthly_revenue,
        monthly_transactions: agg.monthly_transactions,
        avg_order_value: agg.avg_order_value,
        payment_fee_pct: agg.payment_fee_pct,
        monthly_gmv_gross: agg.monthly_gmv_gross,
      },
      assumptions,
      totals_by_currency: totalsByCurrency,
      debug: agg.debug,
    });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
});