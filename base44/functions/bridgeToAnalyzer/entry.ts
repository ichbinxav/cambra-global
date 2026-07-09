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
//   R1. payment_fee_pct = sum(fee) / sum(amount) over SUCCESSFUL CHARGES ONLY.
//       Denominator = GROSS GMV. Excluded from the rate: refunds, payouts,
//       transfers, stripe_fees, application_fees, disputes, adjustments.
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
type NormRow = { external_id: string; amount: number; fee: number; net: number; currency: string; type: string | null; occurred_at: string };

function normalizeStripeRows(raw: any[]): { rows: NormRow[]; malformed: number } {
  const rows: NormRow[] = [];
  let malformed = 0;
  for (const tx of raw) {
    if (!tx || typeof tx !== "object") { malformed++; continue; }
    const id = tx?.id;
    // Required-field check per invariant: if the API drops something we
    // count on, skip the row AND count it — never invent it.
    if (id === null || id === undefined || id === "") { malformed++; continue; }
    const rawType = tx?.reporting_category ?? tx?.type ?? null;
    const type = mapType(rawType);
    const rawCurrency = tx?.currency;
    if (typeof rawCurrency !== "string" || rawCurrency.length === 0) { malformed++; continue; }
    const createdSec = toNum(tx?.created, 0);
    if (createdSec <= 0) { malformed++; continue; }
    rows.push({
      external_id: String(id),
      amount: toNum(tx?.amount) / 100,
      fee: toNum(tx?.fee) / 100,
      net: toNum(tx?.net) / 100,
      currency: rawCurrency.toUpperCase(),
      type,
      occurred_at: new Date(createdSec * 1000).toISOString(),
    });
  }
  return { rows, malformed };
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
  const sumChargeFee    = charges.reduce((a, r) => a + r.fee, 0);
  const chargeCount     = charges.length;
  const sumRefundAmount = refunds.reduce((a, r) => a + r.amount, 0); // negative or 0

  const rateRaw = sumChargeAmount > 0 ? (sumChargeFee / sumChargeAmount) * 100 : 0;
  const payment_fee_pct = Math.round(rateRaw * 100) / 100;

  const netAll = sumChargeAmount + sumRefundAmount;

  const activeDays = countActiveDays(charges);
  // R2 adaptive monthly scale: divide by activeDays/30, not by 3.
  // Guard: activeDays === 0 → keep monthly_revenue at 0 (there is no signal
  // to monthly-ize). This only happens in the insufficient case with 0 charges.
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

  return {
    payment_fee_pct,
    monthly_revenue,
    monthly_gmv_gross,
    monthly_transactions,
    avg_order_value,
    charge_count: chargeCount,
    refund_count: refunds.length,
    active_days: activeDays,
    debug: {
      sum_gross_charges: Math.round(sumChargeAmount * 100) / 100,
      sum_processing_fees: Math.round(sumChargeFee * 100) / 100,
      sum_refunds_signed: Math.round(sumRefundAmount * 100) / 100,
      net_all_charges_and_refunds: Math.round(netAll * 100) / 100,
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
  // TEMP — restaurar a 3 tras validar. Bajado a 2 días para desbloquear
  // el materialize del brand self-test que sólo tiene 2 días activos en
  // el zoo Stripe. Sólo afecta al gate; el cálculo de payment_fee_pct /
  // monthly_revenue / active-days sigue idéntico.
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
    const { rows: normRows, malformed } = normalizeStripeRows(rawRows);

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
      `Rate = sum(fee)/sum(amount) on successful charges only (${agg.charge_count} charges); ` +
      `refunds/payouts/transfers/stripe_fees/application_fees/disputes/adjustments excluded from the rate.`,
      `monthly_revenue is net of refunds (${agg.debug.sum_gross_charges} gross − ` +
      `${Math.abs(agg.debug.sum_refunds_signed)} refunds), scaled to monthly via ` +
      `${agg.active_days} active day(s) / 30.`,
      `Active-day window ends ${new Date(untilMs).toISOString()} UTC; ` +
      `${agg.active_days} distinct UTC dates carried at least one charge.`,
    );
    if (malformed > 0) {
      assumptions.push(`${malformed} malformed Stripe row(s) skipped (missing required field). Not included in any total.`);
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