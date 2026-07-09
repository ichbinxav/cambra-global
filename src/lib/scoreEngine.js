// ════════════════════════════════════════════════════════════════════════════
// FROZEN-UNTIL-BENCHMARKS-MIGRATION (marked at Chunk 6 CUTOVER, 2026-07-09)
// ════════════════════════════════════════════════════════════════════════════
//
// The legacy multi-vertical Analyzer / Results / Auto-materialize surface was
// deleted in the Chunk 6 CUTOVER. `calculateSavings` + `computeInfraScore` no
// longer have any consumer inside the primary Payments funnel — that runs on
// `src/lib/paymentsGap.js` (payments-gap-1.2.0) exclusively.
//
// However, three legitimate CURRENT consumers keep this file alive:
//   1. src/pages/admin/AdminBenchmarks.jsx  → getBenchmarks
//   2. src/pages/Reports.jsx                → getBenchmarks
//   3. src/lib/__benchmark_sync__.test.js   → sync-check pair (37 tests)
//
// Its removal is deliberately deferred and BLOCKED behind the
// "AdminBenchmarks + Reports migration to the new benchmarks engine" chunk.
// Do NOT delete this file, `scoreEngine.test.js`, or `__benchmark_sync__.test.js`
// before that migration ships — the tests would break and the admin surface
// would 500 on load.
//
// The `SavingsEstimator.jsx` landing component still imports `calculateSavings`
// + `computeInfraScore` but is ORPHANED at the router level (Landing.jsx does
// not render it) — kept dormant for the same eventual purge.
// ════════════════════════════════════════════════════════════════════════════

/**
 * CAMBRA — Infrastructure Score Engine v4
 *
 * Coherent, tier-aware, geography-aware benchmark logic across 8 verticals:
 *   Payments · Logistics · SaaS · Banking · Insurance · Telecom · Finance Ops · HR Infra
 *
 * Principles:
 *  • Single source of truth: calculateSavings() — score derived from it.
 *  • Tier-aware benchmarks (micro/small/mid/large) decrease smoothly with scale.
 *  • Geography-aware (EU benefits from PSD2 interchange caps, SEPA, etc.).
 *  • All savings clamped ≥ 0 and capped to realistic ceilings per vertical.
 *  • Total leakage capped at 8% of annual GMV (industry-validated realistic max).
 *  • No double-counting (TPE in-store is part of payments vertical).
 *  • Benchmarks sourced from: Stripe/Adyen published rates, PSD2 interchange caps,
 *    Eurosender carrier data, Gartner/Paddle SaaS ratios, ECB SME banking surveys,
 *    Insurance Europe SME premium reports, BEREC telecom benchmarks.
 */

// ─── Engine versioning ───────────────────────────────────────────────────────
export const ENGINE_VERSION = {
  score:     "1.0.0",
  savings:   "1.0.0",
  benchmark: "1.0.0",
};

// ─── Input validation ────────────────────────────────────────────────────────
export function validateAnalyzerInput(input = {}) {
  const errors = [];
  const n = (v) => Number(v);

  if (input.monthly_revenue === undefined || input.monthly_revenue === null || input.monthly_revenue === "") {
    errors.push("Monthly revenue is required.");
  } else if (!isFinite(n(input.monthly_revenue)) || isNaN(n(input.monthly_revenue))) {
    errors.push("Monthly revenue must be a valid number.");
  } else if (n(input.monthly_revenue) < 0) {
    errors.push("Monthly revenue cannot be negative.");
  }

  if (input.payment_fee_pct !== undefined && input.payment_fee_pct !== null && input.payment_fee_pct !== "") {
    if (!isFinite(n(input.payment_fee_pct)) || isNaN(n(input.payment_fee_pct))) {
      errors.push("Payment fee % must be a valid number.");
    } else if (n(input.payment_fee_pct) < 0 || n(input.payment_fee_pct) > 15) {
      errors.push("Payment fee % must be between 0 and 15.");
    }
  }

  if (input.monthly_shipments !== undefined && input.monthly_shipments !== null && input.monthly_shipments !== "") {
    if (!isFinite(n(input.monthly_shipments)) || isNaN(n(input.monthly_shipments))) {
      errors.push("Monthly shipments must be a valid number.");
    } else if (n(input.monthly_shipments) < 0) {
      errors.push("Monthly shipments cannot be negative.");
    }
  }

  if (input.monthly_shipping_cost !== undefined && input.monthly_shipping_cost !== null && input.monthly_shipping_cost !== "") {
    if (!isFinite(n(input.monthly_shipping_cost)) || isNaN(n(input.monthly_shipping_cost))) {
      errors.push("Monthly shipping cost must be a valid number.");
    } else if (n(input.monthly_shipping_cost) < 0) {
      errors.push("Monthly shipping cost cannot be negative.");
    }
  }

  if (input.total_saas_spend !== undefined && input.total_saas_spend !== null && input.total_saas_spend !== "") {
    if (!isFinite(n(input.total_saas_spend)) || isNaN(n(input.total_saas_spend))) {
      errors.push("Total SaaS spend must be a valid number.");
    } else if (n(input.total_saas_spend) < 0) {
      errors.push("Total SaaS spend cannot be negative.");
    }
  }

  if (input.avg_order_value !== undefined && input.avg_order_value !== null && input.avg_order_value !== "") {
    if (!isFinite(n(input.avg_order_value)) || isNaN(n(input.avg_order_value))) {
      errors.push("Average order value must be a valid number.");
    } else if (n(input.avg_order_value) <= 0) {
      errors.push("Average order value must be greater than 0.");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Revenue tier detection ──────────────────────────────────────────────────
// micro: <€30K/mo · small: €30–100K · mid: €100–500K · large: >€500K
function getRevenueTier(monthlyRevenue = 0) {
  if (monthlyRevenue >= 500000) return "large";
  if (monthlyRevenue >= 100000) return "mid";
  if (monthlyRevenue >= 30000) return "small";
  return "micro";
}

// ─── Geography detection ─────────────────────────────────────────────────────
const EU_COUNTRIES = [
  "France", "Germany", "Spain", "Italy", "Netherlands", "Belgium", "Portugal",
  "Sweden", "Denmark", "Finland", "Norway", "Austria", "Switzerland", "Ireland",
  "Poland", "Czech Republic", "Romania", "Hungary", "Greece", "Luxembourg",
  "Malta", "Cyprus", "Slovakia", "Slovenia", "Croatia", "Estonia", "Latvia",
  "Lithuania", "Bulgaria",
];

function isEU(country) {
  return EU_COUNTRIES.includes(country);
}

// ─── Benchmarks (tier + geo aware) ───────────────────────────────────────────
export function getBenchmarks(monthlyRevenue = 0, country = "") {
  const tier = getRevenueTier(monthlyRevenue);
  const eu = isEU(country);

  // Online card acceptance, blended effective rate (%)
  // EU benefits from PSD2 interchange caps (0.2% debit / 0.3% credit)
  //
  // ⚠️ SOURCE OF TRUTH for payments benchmarks.
  // These values MUST stay in sync with the inline copy in
  // functions/getBenchmarkForReport (STATIC_BENCHMARKS). Deno backend cannot
  // import this file, so the values are duplicated by necessity. If you change
  // anything here, change it there too. See Decision_Log.
  //
  // Values reflect typical market rates (not best-in-class):
  //   - small EU 2.2% = mainstream Stripe/Adyen for €30–100K/mo merchants
  //   - range[1] (high) = renegotiable floor reachable via the network
  const paymentBenchmarks = {
    micro: { rate: eu ? 2.4 : 2.9, range: eu ? [2.0, 2.6] : [2.5, 3.1] },
    small: { rate: eu ? 2.2 : 2.6, range: eu ? [1.9, 2.4] : [2.3, 2.9] },
    mid:   { rate: eu ? 1.9 : 2.3, range: eu ? [1.6, 2.1] : [2.0, 2.5] },
    large: { rate: eu ? 1.6 : 1.9, range: eu ? [1.3, 1.8] : [1.6, 2.2] },
  };

  // In-store all-in effective rate (% of in-store GMV) — terminal rental + fixed fees + variable
  const tpeBenchmarks = {
    micro: { rate: eu ? 1.4 : 1.7, range: eu ? [1.2, 1.7] : [1.5, 2.0] },
    small: { rate: eu ? 1.2 : 1.5, range: eu ? [1.0, 1.4] : [1.3, 1.8] },
    mid:   { rate: eu ? 1.0 : 1.3, range: eu ? [0.9, 1.2] : [1.1, 1.5] },
    large: { rate: eu ? 0.9 : 1.1, range: eu ? [0.8, 1.0] : [1.0, 1.3] },
  };

  // Average outbound shipment cost (EUR) — domestic blend
  const shippingBenchmarks = {
    micro: { perUnit: eu ? 5.80 : 7.20, range: eu ? [5.80, 7.50] : [7.20, 9.20] },
    small: { perUnit: eu ? 5.20 : 6.50, range: eu ? [5.20, 6.80] : [6.50, 8.40] },
    mid:   { perUnit: eu ? 4.60 : 5.80, range: eu ? [4.60, 6.00] : [5.80, 7.60] },
    large: { perUnit: eu ? 3.90 : 4.80, range: eu ? [3.90, 5.20] : [4.80, 6.80] },
  };

  // SaaS spend as % of monthly revenue (well-optimized brands) — Gartner/Paddle
  const saasBenchmarks = {
    micro: { pct: 0.060, range: [0.040, 0.090] },
    small: { pct: 0.040, range: [0.030, 0.060] },
    mid:   { pct: 0.025, range: [0.020, 0.040] },
    large: { pct: 0.015, range: [0.010, 0.025] },
  };

  // Banking: fixed monthly account fees + FX spread (%) on international flows
  // Sources: ECB SME banking cost surveys, Wise/Revolut Business benchmarks
  const bankingBenchmarks = {
    micro: { monthlyFee: eu ? 25 : 35, fxSpread: 0.6 },
    small: { monthlyFee: eu ? 40 : 60, fxSpread: 0.5 },
    mid:   { monthlyFee: eu ? 80 : 120, fxSpread: 0.4 },
    large: { monthlyFee: eu ? 150 : 220, fxSpread: 0.3 },
  };

  // Telecom: monthly cost per employee (mobile + internet + voice) — BEREC EU averages
  const telecomBenchmarks = {
    micro: { perEmployee: eu ? 35 : 55 },
    small: { perEmployee: eu ? 32 : 50 },
    mid:   { perEmployee: eu ? 28 : 45 },
    large: { perEmployee: eu ? 24 : 40 },
  };

  // Finance Ops: bookkeeping + accounting tools as % of revenue (well-run)
  const financeOpsBenchmarks = {
    micro: { pct: 0.020, range: [0.015, 0.030] },
    small: { pct: 0.014, range: [0.010, 0.020] },
    mid:   { pct: 0.009, range: [0.007, 0.014] },
    large: { pct: 0.006, range: [0.004, 0.009] },
  };

  // HR Infra: HRIS/payroll/benefits tooling as cost per employee/month
  const hrBenchmarks = {
    micro: { perEmployee: 18, range: [12, 25] },
    small: { perEmployee: 22, range: [16, 30] },
    mid:   { perEmployee: 28, range: [20, 38] },
    large: { perEmployee: 32, range: [24, 45] },
  };

  return {
    payment: paymentBenchmarks[tier],
    tpe: tpeBenchmarks[tier],
    shipping: shippingBenchmarks[tier],
    saas: saasBenchmarks[tier],
    banking: bankingBenchmarks[tier],
    telecom: telecomBenchmarks[tier],
    financeOps: financeOpsBenchmarks[tier],
    hr: hrBenchmarks[tier],
    tier,
    eu,
  };
}

// ─── Insurance benchmark (structural, not tier-based) ────────────────────────
function getInsuranceBenchmark(input) {
  const {
    insurance_rc_pro = "not_sure",
    insurance_has_employees = "no",
    insurance_mutuelle = "no_employees",
    insurance_has_physical_assets = "no",
  } = input || {};

  const base = (insurance_has_employees === "yes" || insurance_has_physical_assets === "yes") ? 3200 : 1200;
  const load =
    (insurance_rc_pro === "yes" ? 500 : 0) +
    (insurance_mutuelle === "yes" ? 1200 : 0) +
    (insurance_has_physical_assets === "yes" ? 1500 : 0);

  const low = Math.round(base + load * 0.8);
  const high = Math.round(base + load * 1.15);
  const mid = Math.round((low + high) / 2);
  return { low, mid, high };
}

// ─── SAVINGS CALCULATION (single source of truth) ────────────────────────────
export function calculateSavings(input = {}) {
  const {
    monthly_revenue = 0,
    avg_order_value = 0,
    total_saas_spend = 0,
    monthly_shipping_cost = 0,
    monthly_shipments = 0,
    country = "",
    payment_fee_pct = 0,
    in_store_gmv = 0,
    tpe_transaction_fee_pct = 0,
    monthly_terminal_rental = 0,
    fixed_banking_fees = 0,
    maintenance_fees = 0,
    annual_insurance_cost = 0,
    intl_pct = 0,
    // Extended verticals (optional inputs; default to 0/derived)
    monthly_banking_fees = 0,
    bank_fx_spread_pct = 0,
    employee_count = 0,
    monthly_telecom_cost = 0,
    monthly_finance_ops_cost = 0,
    monthly_hr_tools_cost = 0,
  } = input;

  const monthlyGMV = Math.max(0, Number(monthly_revenue) || 0);
  const annualGMV = monthlyGMV * 12;
  const aov = Math.max(1, Number(avg_order_value) || 1);
  const annualTransactions = Math.floor(annualGMV / aov);

  const benchmarks = getBenchmarks(monthlyGMV, country);

  // ── 1. Online payments ─────────────────────────────────────────────────────
  const currentPayRate = Math.max(0, Number(payment_fee_pct) || 0);
  const targetPayRate = benchmarks.payment.rate;
  const payGapPct = Math.max(0, currentPayRate - targetPayRate);
  const cappedPayGap = Math.min(payGapPct, 3.0); // cap at 3pp (data sanity)
  const onlinePaymentSavings = Math.round(annualGMV * (cappedPayGap / 100));

  // ── 2. In-store / TPE (part of Payments vertical) ──────────────────────────
  const annualInStoreGMV = Math.max(0, Number(in_store_gmv) || 0) * 12;
  const tpeVarAnnual = annualInStoreGMV * (Math.max(0, Number(tpe_transaction_fee_pct) || 0) / 100);
  const tpeFixedAnnual = (
    Math.max(0, Number(monthly_terminal_rental) || 0) +
    Math.max(0, Number(fixed_banking_fees) || 0) +
    Math.max(0, Number(maintenance_fees) || 0)
  ) * 12;
  const tpeEffectiveRate = annualInStoreGMV > 0 ? ((tpeVarAnnual + tpeFixedAnnual) / annualInStoreGMV) * 100 : 0;
  const tpeGapPct = Math.max(0, tpeEffectiveRate - benchmarks.tpe.rate);
  const cappedTpeGap = Math.min(tpeGapPct, 3.0);
  const tpeSavings = Math.round(annualInStoreGMV * (cappedTpeGap / 100));

  const paymentSavings = onlinePaymentSavings + tpeSavings;

  // ── 3. Logistics / Shipping ────────────────────────────────────────────────
  const shipCount = Math.max(1, Number(monthly_shipments) || 1);
  const shipSpend = Math.max(0, Number(monthly_shipping_cost) || 0);
  const costPerShipment = shipSpend / shipCount;
  const shipGap = Math.max(0, costPerShipment - benchmarks.shipping.perUnit);
  const rawShippingSavings = shipGap * shipCount * 12;
  // Cap at 40% of current shipping spend (realistic ceiling per industry data)
  const shippingSavings = Math.round(Math.min(rawShippingSavings, shipSpend * 12 * 0.4));

  // ── 4. SaaS ────────────────────────────────────────────────────────────────
  const saasMonthly = Math.max(0, Number(total_saas_spend) || 0);
  const saasAnnual = saasMonthly * 12;
  const saasBenchmarkMonthly = monthlyGMV * benchmarks.saas.pct;
  const saasExcessAnnual = Math.max(0, (saasMonthly - saasBenchmarkMonthly) * 12);
  // 60% of excess is realistically recoverable (some redundancy is necessary)
  // Cap at 35% of current spend
  const rawSaasSavings = saasExcessAnnual * 0.60;
  const saasSavings = Math.round(Math.min(rawSaasSavings, saasAnnual * 0.35));

  // ── 5. Banking ─────────────────────────────────────────────────────────────
  // Two components: (a) excess monthly account fees, (b) FX spread on intl flows
  const bankFeesAnnual = Math.max(0, Number(monthly_banking_fees) || 0) * 12;
  const bankFeesBenchmarkAnnual = benchmarks.banking.monthlyFee * 12;
  const bankFeesExcess = Math.max(0, bankFeesAnnual - bankFeesBenchmarkAnnual);

  const intlGmvAnnual = annualGMV * (Math.max(0, Math.min(100, Number(intl_pct) || 0)) / 100);
  const currentFxSpread = Math.max(0, Number(bank_fx_spread_pct) || 0);
  // If user didn't provide FX, assume typical bank rate (1.5%) when intl > 0
  const assumedFx = currentFxSpread > 0 ? currentFxSpread : (intlGmvAnnual > 0 ? 1.5 : 0);
  const fxGap = Math.max(0, assumedFx - benchmarks.banking.fxSpread);
  const fxSavings = intlGmvAnnual * (fxGap / 100);

  const rawBankingSavings = bankFeesExcess + fxSavings;
  // Cap banking savings at 1% of annual GMV (realistic)
  const bankingSavings = Math.round(Math.min(rawBankingSavings, annualGMV * 0.01));

  // ── 6. Insurance ───────────────────────────────────────────────────────────
  const insBench = getInsuranceBenchmark(input);
  const currentInsurance = Math.max(0, Number(annual_insurance_cost) || 0);
  const rawInsuranceSavings = currentInsurance > insBench.high ? currentInsurance - insBench.mid : 0;
  const insuranceSavings = Math.round(Math.min(rawInsuranceSavings, currentInsurance * 0.30));

  // ── 7. Telecom ─────────────────────────────────────────────────────────────
  const empCount = Math.max(0, Math.round(Number(employee_count) || 0));
  const telecomMonthly = Math.max(0, Number(monthly_telecom_cost) || 0);
  const telecomBenchmarkMonthly = empCount * benchmarks.telecom.perEmployee;
  const telecomExcessAnnual = empCount > 0 && telecomMonthly > telecomBenchmarkMonthly
    ? (telecomMonthly - telecomBenchmarkMonthly) * 12
    : 0;
  // 50% of excess realistically recoverable; cap at 30% of current spend
  const rawTelecomSavings = telecomExcessAnnual * 0.50;
  const telecomSavings = Math.round(Math.min(rawTelecomSavings, telecomMonthly * 12 * 0.30));

  // ── 8. Finance Ops ─────────────────────────────────────────────────────────
  const finOpsMonthly = Math.max(0, Number(monthly_finance_ops_cost) || 0);
  const finOpsBenchmarkMonthly = monthlyGMV * benchmarks.financeOps.pct;
  const finOpsExcessAnnual = Math.max(0, (finOpsMonthly - finOpsBenchmarkMonthly) * 12);
  const rawFinOpsSavings = finOpsExcessAnnual * 0.50;
  const financeOpsSavings = Math.round(Math.min(rawFinOpsSavings, finOpsMonthly * 12 * 0.35));

  // ── 9. HR Infra ────────────────────────────────────────────────────────────
  const hrMonthly = Math.max(0, Number(monthly_hr_tools_cost) || 0);
  const hrBenchmarkMonthly = empCount * benchmarks.hr.perEmployee;
  const hrExcessAnnual = empCount > 0 && hrMonthly > hrBenchmarkMonthly
    ? (hrMonthly - hrBenchmarkMonthly) * 12
    : 0;
  const rawHrSavings = hrExcessAnnual * 0.50;
  const hrSavings = Math.round(Math.min(rawHrSavings, hrMonthly * 12 * 0.30));

  // ── Total: cap at 8% of annual GMV (validated realistic infra leakage max) ─
  const rawTotal =
    paymentSavings + shippingSavings + saasSavings + bankingSavings +
    insuranceSavings + telecomSavings + financeOpsSavings + hrSavings;

  const totalCap = annualGMV > 0 ? annualGMV * 0.08 : Infinity;
  const totalSavings = Math.round(Math.min(rawTotal, totalCap));

  // Proportional scaling if capped — preserves vertical proportions
  let scaled = {
    payment: paymentSavings,
    shipping: shippingSavings,
    saas: saasSavings,
    banking: bankingSavings,
    insurance: insuranceSavings,
    telecom: telecomSavings,
    financeOps: financeOpsSavings,
    hr: hrSavings,
  };
  if (rawTotal > totalCap && rawTotal > 0) {
    const k = totalCap / rawTotal;
    Object.keys(scaled).forEach(key => {
      scaled[key] = Math.round(scaled[key] * k);
    });
  }

  return {
    paymentSavings: scaled.payment,
    shippingSavings: scaled.shipping,
    saasSavings: scaled.saas,
    bankingSavings: scaled.banking,
    insuranceSavings: scaled.insurance,
    telecomSavings: scaled.telecom,
    financeOpsSavings: scaled.financeOps,
    hrSavings: scaled.hr,
    totalSavings,
    benchmarks,
    details: {
      annual_gmv: annualGMV,
      avg_order_value: aov,
      annual_transactions: annualTransactions,
      // Payments
      payment_current_rate: currentPayRate,
      payment_optimal_rate: targetPayRate,
      payment_gap_pct: payGapPct,
      online_payment_savings: onlinePaymentSavings,
      // TPE
      tpe_effective_rate: tpeEffectiveRate,
      tpe_optimal_rate: benchmarks.tpe.rate,
      tpe_savings: tpeSavings,
      // Shipping
      shipping_current_avg: costPerShipment,
      shipping_optimal_avg: benchmarks.shipping.perUnit,
      // SaaS
      saas_current_total: saasMonthly,
      saas_optimal_total: saasBenchmarkMonthly,
      saas_excess_annual: saasExcessAnnual,
      // Banking
      banking_current_monthly: Number(monthly_banking_fees) || 0,
      banking_optimal_monthly: benchmarks.banking.monthlyFee,
      banking_fx_current: assumedFx,
      banking_fx_optimal: benchmarks.banking.fxSpread,
      // Insurance
      insurance_current_total: currentInsurance,
      insurance_benchmark_low: insBench.low,
      insurance_benchmark_high: insBench.high,
      insurance_benchmark_mid: insBench.mid,
      insurance_coverage_quality: currentInsurance > 0
        ? (currentInsurance < insBench.low ? "At risk" : currentInsurance > insBench.high ? "Over-paying" : "Aligned")
        : "Not analyzed",
      insurance_status: currentInsurance > 0
        ? (scaled.insurance > 0 ? "Review recommended" : "Optimized")
        : "Not analyzed",
      // Telecom
      telecom_current_monthly: telecomMonthly,
      telecom_benchmark_monthly: telecomBenchmarkMonthly,
      // Finance Ops
      finance_ops_current_monthly: finOpsMonthly,
      finance_ops_benchmark_monthly: finOpsBenchmarkMonthly,
      // HR Infra
      hr_current_monthly: hrMonthly,
      hr_benchmark_monthly: hrBenchmarkMonthly,
    },
  };
}

// ─── Tier-1 provider lists ───────────────────────────────────────────────────
const TIER1_PAYMENT = ["adyen", "checkout.com", "stripe", "mollie", "braintree"];
const TIER1_SHIPPING = ["dhl", "fedex", "ups", "sendcloud", "dpd"];

// ─── Dimension scoring (per category, 0–100) ─────────────────────────────────
function scorePayments(input, benchmarks) {
  const rate = Math.max(0, Number(input.payment_fee_pct) || 0);
  if (rate <= 0) return 50;
  const target = benchmarks.payment.rate;
  const score = 100 - ((rate - target) / target) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreShipping(input, benchmarks) {
  const count = Math.max(1, Number(input.monthly_shipments) || 1);
  const spend = Math.max(0, Number(input.monthly_shipping_cost) || 0);
  if (spend <= 0) return 50;
  const perUnit = spend / count;
  const target = benchmarks.shipping.perUnit;
  const score = 100 - ((perUnit - target) / target) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreSaaS(input, benchmarks) {
  const rev = Math.max(0, Number(input.monthly_revenue) || 0);
  const saas = Math.max(0, Number(input.total_saas_spend) || 0);
  if (rev <= 0 || saas <= 0) return 50;
  const ratio = saas / rev;
  const target = benchmarks.saas.pct;
  const score = 100 - ((ratio - target) / target) * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreProviderQuality(input) {
  const { payment_provider = "", shipping_provider = "", payment_fee_pct = 0 } = input;
  let s = 60;
  if (payment_provider && TIER1_PAYMENT.some(p => payment_provider.toLowerCase().includes(p))) s += 15;
  if (shipping_provider && TIER1_SHIPPING.some(p => shipping_provider.toLowerCase().includes(p))) s += 10;
  if (payment_fee_pct > 2.5) s -= 15;
  if (payment_fee_pct > 0 && payment_fee_pct <= 1.8) s += 10;
  return Math.max(0, Math.min(100, s));
}

function scoreDataCompleteness(dataQuality) {
  if (dataQuality === "connected") return 95;
  if (dataQuality === "partial") return 65;
  return 40;
}

// ─── Impact narrative ────────────────────────────────────────────────────────
function generateImpacts(input, benchmarks, savings) {
  const impacts = [];
  const rate = Number(input.payment_fee_pct) || 0;
  const target = benchmarks.payment.rate;

  if (rate > target + 0.2 && savings.paymentSavings > 0) {
    impacts.push({
      category: "Payments",
      issue: `Effective rate ${rate.toFixed(2)}% vs network target ${target.toFixed(2)}%`,
      pointsGain: Math.min(20, Math.round((rate - target) * 8)),
      action: "Renegotiate via the network",
      severity: (rate - target) > 0.8 ? "high" : "medium",
    });
  }

  if (savings.shippingSavings > 0) {
    const perUnit = (input.monthly_shipping_cost || 0) / Math.max(1, input.monthly_shipments || 1);
    impacts.push({
      category: "Shipping",
      issue: `€${perUnit.toFixed(2)}/shipment vs €${benchmarks.shipping.perUnit.toFixed(2)} target`,
      pointsGain: 10,
      action: "Activate collective shipping contracts",
      severity: "medium",
    });
  }

  if (savings.saasSavings > 0) {
    const ratio = (input.monthly_revenue || 0) > 0 ? (input.total_saas_spend || 0) / input.monthly_revenue : 0;
    impacts.push({
      category: "SaaS",
      issue: `Stack at ${(ratio * 100).toFixed(1)}% of revenue · target ${(benchmarks.saas.pct * 100).toFixed(1)}%`,
      pointsGain: 7,
      action: "Audit redundant tools / group licenses",
      severity: "medium",
    });
  }

  if (savings.bankingSavings > 0) {
    impacts.push({
      category: "Banking",
      issue: "Account fees and/or FX spread above benchmark",
      pointsGain: 6,
      action: "Switch to multi-currency neobank or renegotiate FX",
      severity: "low",
    });
  }

  if (savings.insuranceSavings > 0) {
    impacts.push({
      category: "Insurance",
      issue: "Premium above benchmark range for your coverage profile",
      pointsGain: 5,
      action: "Compare quotes via the network",
      severity: "low",
    });
  }

  if (savings.telecomSavings > 0) {
    impacts.push({
      category: "Telecom",
      issue: "Per-employee telecom cost above benchmark",
      pointsGain: 4,
      action: "Consolidate mobile/internet plans",
      severity: "low",
    });
  }

  if (savings.financeOpsSavings > 0) {
    impacts.push({
      category: "Finance Ops",
      issue: "Bookkeeping & accounting tools above benchmark",
      pointsGain: 4,
      action: "Consolidate finance stack",
      severity: "low",
    });
  }

  if (savings.hrSavings > 0) {
    impacts.push({
      category: "HR Infra",
      issue: "HRIS/payroll cost per employee above benchmark",
      pointsGain: 4,
      action: "Renegotiate or consolidate HR platforms",
      severity: "low",
    });
  }

  return impacts;
}

// ─── MAIN EXPORT: Infrastructure Score ───────────────────────────────────────
export function computeInfraScore(input = {}, dataQuality = "manual") {
  const monthlyGMV = Math.max(0, Number(input.monthly_revenue) || 0);
  const annualGMV = monthlyGMV * 12;

  if (annualGMV <= 0) {
    return {
      total: 50,
      potentialTotal: 65,
      label: "Provide revenue to compute score",
      scoreColor: "#f97316",
      accuracyLabel: dataQuality === "connected" ? "High — real data" : "Estimated — connect tools to refine",
      dataQuality,
      benchmarks: null,
      dimensions: [
        { key: "overall", label: "Overall", weight: "100%", score: 50, desc: "Insufficient data" },
      ],
      impacts: [],
    };
  }

  const benchmarks = getBenchmarks(monthlyGMV, input.country);
  const savings = calculateSavings(input);

  const dimPayments = scorePayments(input, benchmarks);
  const dimShipping = scoreShipping(input, benchmarks);
  const dimSaaS = scoreSaaS(input, benchmarks);
  const dimProvider = scoreProviderQuality(input);
  const dimData = scoreDataCompleteness(dataQuality);

  // Weighted total (sums to 100%) — Payments & Shipping dominate as biggest leak vectors
  const weighted =
    dimPayments * 0.35 +
    dimShipping * 0.25 +
    dimSaaS * 0.15 +
    dimProvider * 0.10 +
    dimData * 0.15;

  // Leakage penalty — total leakage as % of GMV (0..8%)
  const leakagePct = annualGMV > 0 ? savings.totalSavings / annualGMV : 0;
  const leakagePenalty = leakagePct * 200; // up to 16 points

  let total = Math.round(weighted - leakagePenalty);
  total = Math.max(0, Math.min(100, total));

  const potentialTotal = Math.min(100, total + Math.round(leakagePenalty));

  const label =
    total >= 80 ? "Strong infrastructure" :
    total >= 60 ? "Healthy with opportunities" :
    total >= 40 ? "Optimization opportunity" :
    "High optimization potential";

  const scoreColor = total >= 80 ? "#22c55e" : total >= 50 ? "#f59e0b" : "#ef4444";
  const accuracyLabel =
    dataQuality === "connected" ? "High — real data" :
    dataQuality === "partial" ? "Medium — partial data" :
    "Estimated — connect tools to refine";

  return {
    total,
    potentialTotal,
    label,
    scoreColor,
    accuracyLabel,
    dataQuality,
    benchmarks,
    savings,
    dimensions: [
      { key: "payments", label: "Payments", weight: "35%", score: dimPayments, desc: "Effective rate vs network target" },
      { key: "shipping", label: "Shipping", weight: "25%", score: dimShipping, desc: "Cost/shipment vs benchmark" },
      { key: "saas", label: "SaaS", weight: "15%", score: dimSaaS, desc: "Stack spend vs revenue benchmark" },
      { key: "provider", label: "Providers", weight: "10%", score: dimProvider, desc: "Tier-1 stack & negotiation" },
      { key: "data", label: "Data quality", weight: "15%", score: dimData, desc: "Connected vs estimated" },
    ],
    impacts: generateImpacts(input, benchmarks, savings),
  };
}