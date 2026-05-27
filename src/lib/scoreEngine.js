/**
 * CAMBRA — Infrastructure Score Engine v3
 *
 * Coherent, tier-aware, geography-aware benchmark logic.
 * Every saving and score is derived from the SAME calculation path.
 *
 * Principles:
 *  • One source of truth: calculateSavings() — score is derived from it.
 *  • All savings are clamped ≥ 0 and capped to realistic maxima.
 *  • No double-counting (TPE is part of payments, not added twice).
 *  • Benchmarks come from getBenchmarks(monthly_revenue, country).
 *  • Score is the inverse of "leakage % of GMV", bounded [0, 100].
 */

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
// Sources: Stripe published rates, Adyen interchange++ ranges, Eurosender
// carrier pricing data, Gartner/Paddle SaaS spend ratios.
export function getBenchmarks(monthlyRevenue = 0, country = "") {
  const tier = getRevenueTier(monthlyRevenue);
  const eu = isEU(country);

  // Online card acceptance, blended effective rate (%)
  // EU benefits from PSD2 interchange caps (0.2% debit / 0.3% credit)
  const paymentBenchmarks = {
    micro: { rate: eu ? 1.9 : 2.4, range: eu ? [1.7, 2.2] : [2.2, 2.9] },
    small: { rate: eu ? 1.7 : 2.1, range: eu ? [1.5, 1.9] : [1.9, 2.4] },
    mid:   { rate: eu ? 1.5 : 1.8, range: eu ? [1.3, 1.7] : [1.6, 2.1] },
    large: { rate: eu ? 1.3 : 1.6, range: eu ? [1.1, 1.5] : [1.4, 1.9] },
  };

  // In-store all-in effective rate (% of in-store GMV) including terminal rental + fixed fees
  const tpeBenchmarks = {
    micro: { rate: eu ? 1.4 : 1.7, range: eu ? [1.2, 1.7] : [1.5, 2.0] },
    small: { rate: eu ? 1.2 : 1.5, range: eu ? [1.0, 1.4] : [1.3, 1.8] },
    mid:   { rate: eu ? 1.0 : 1.3, range: eu ? [0.9, 1.2] : [1.1, 1.5] },
    large: { rate: eu ? 0.9 : 1.1, range: eu ? [0.8, 1.0] : [1.0, 1.3] },
  };

  // Average outbound shipment cost (EUR)
  const shippingBenchmarks = {
    micro: { perUnit: eu ? 5.80 : 7.20, range: eu ? [5.80, 7.50] : [7.20, 9.20] },
    small: { perUnit: eu ? 5.20 : 6.50, range: eu ? [5.20, 6.80] : [6.50, 8.40] },
    mid:   { perUnit: eu ? 4.60 : 5.80, range: eu ? [4.60, 6.00] : [5.80, 7.60] },
    large: { perUnit: eu ? 3.90 : 4.80, range: eu ? [3.90, 5.20] : [4.80, 6.80] },
  };

  // SaaS spend as % of monthly revenue (well-optimized brands)
  const saasBenchmarks = {
    micro: { pct: 0.060, range: [0.040, 0.090] },
    small: { pct: 0.040, range: [0.030, 0.060] },
    mid:   { pct: 0.025, range: [0.020, 0.040] },
    large: { pct: 0.015, range: [0.010, 0.025] },
  };

  return {
    payment: paymentBenchmarks[tier],
    tpe: tpeBenchmarks[tier],
    shipping: shippingBenchmarks[tier],
    saas: saasBenchmarks[tier],
    tier,
    eu,
  };
}

// ─── Insurance benchmark (function of structure, not tier) ───────────────────
function getInsuranceBenchmark(input) {
  const {
    insurance_rc_pro = "not_sure",
    insurance_has_employees = "no",
    insurance_mutuelle = "no_employees",
    insurance_has_physical_assets = "no",
  } = input || {};

  // Base annual premium for a small commerce brand
  const base = (insurance_has_employees === "yes" || insurance_has_physical_assets === "yes") ? 3200 : 1200;

  // Coverage complexity load
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
  } = input;

  const monthlyGMV = Math.max(0, Number(monthly_revenue) || 0);
  const annualGMV = monthlyGMV * 12;
  const aov = Math.max(1, Number(avg_order_value) || 1);
  const annualTransactions = Math.floor(annualGMV / aov);

  const benchmarks = getBenchmarks(monthlyGMV, country);

  // ── Online payments ────────────────────────────────────────────────────────
  const currentPayRate = Math.max(0, Number(payment_fee_pct) || 0);
  const targetPayRate = benchmarks.payment.rate;
  const payGapPct = Math.max(0, currentPayRate - targetPayRate);
  // Cap at 3 percentage points (anything above is likely data error)
  const cappedPayGap = Math.min(payGapPct, 3.0);
  const onlinePaymentSavings = Math.round(annualGMV * (cappedPayGap / 100));

  // ── In-store / TPE payments ────────────────────────────────────────────────
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

  // Total payments savings = online + in-store (no double counting)
  const paymentSavings = onlinePaymentSavings + tpeSavings;

  // ── Shipping ───────────────────────────────────────────────────────────────
  const shipCount = Math.max(1, Number(monthly_shipments) || 1);
  const shipSpend = Math.max(0, Number(monthly_shipping_cost) || 0);
  const costPerShipment = shipSpend / shipCount;
  const shipGap = Math.max(0, costPerShipment - benchmarks.shipping.perUnit);
  // Cap shipping savings at 40% of current shipping spend (realistic ceiling)
  const rawShippingSavings = shipGap * shipCount * 12;
  const shippingSavings = Math.round(Math.min(rawShippingSavings, shipSpend * 12 * 0.4));

  // ── SaaS ───────────────────────────────────────────────────────────────────
  // Benchmark-driven (not arbitrary 2%): excess above tier benchmark % of GMV
  const saasMonthly = Math.max(0, Number(total_saas_spend) || 0);
  const saasAnnual = saasMonthly * 12;
  const saasBenchmarkMonthly = monthlyGMV * benchmarks.saas.pct;
  const saasBenchmarkAnnual = saasBenchmarkMonthly * 12;
  const saasExcessAnnual = Math.max(0, saasAnnual - saasBenchmarkAnnual);
  // Savings = 60% of excess (realistic — some tools are necessary)
  // Cap at 35% of current spend
  const rawSaasSavings = saasExcessAnnual * 0.60;
  const saasSavings = Math.round(Math.min(rawSaasSavings, saasAnnual * 0.35));

  // ── Insurance ──────────────────────────────────────────────────────────────
  const insBench = getInsuranceBenchmark(input);
  const currentInsurance = Math.max(0, Number(annual_insurance_cost) || 0);
  const rawInsuranceSavings = currentInsurance > insBench.high ? currentInsurance - insBench.mid : 0;
  // Cap at 30% of current premium
  const insuranceSavings = Math.round(Math.min(rawInsuranceSavings, currentInsurance * 0.30));

  // ── Total (cap at 8% of annual GMV — realistic max for infra optimization) ─
  const rawTotal = paymentSavings + shippingSavings + saasSavings + insuranceSavings;
  const totalCap = annualGMV > 0 ? annualGMV * 0.08 : Infinity;
  const totalSavings = Math.round(Math.min(rawTotal, totalCap));

  // If we capped, scale components proportionally for display coherence
  let scaledPayment = paymentSavings;
  let scaledShipping = shippingSavings;
  let scaledSaas = saasSavings;
  let scaledInsurance = insuranceSavings;
  if (rawTotal > totalCap && rawTotal > 0) {
    const k = totalCap / rawTotal;
    scaledPayment = Math.round(paymentSavings * k);
    scaledShipping = Math.round(shippingSavings * k);
    scaledSaas = Math.round(saasSavings * k);
    scaledInsurance = Math.round(insuranceSavings * k);
  }

  return {
    paymentSavings: scaledPayment,
    shippingSavings: scaledShipping,
    saasSavings: scaledSaas,
    insuranceSavings: scaledInsurance,
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
      // Insurance
      insurance_current_total: currentInsurance,
      insurance_benchmark_low: insBench.low,
      insurance_benchmark_high: insBench.high,
      insurance_benchmark_mid: insBench.mid,
      insurance_savings: scaledInsurance,
      insurance_coverage_quality: currentInsurance > 0
        ? (currentInsurance < insBench.low ? "At risk" : currentInsurance > insBench.high ? "Over-paying" : "Aligned")
        : "Not analyzed",
      insurance_status: currentInsurance > 0
        ? (scaledInsurance > 0 ? "Review recommended" : "Optimized")
        : "Not analyzed",
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
  // 100 at target, 0 at 2× target
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

  if (savings.insuranceSavings > 0) {
    impacts.push({
      category: "Insurance",
      issue: "Premium above benchmark range for your coverage profile",
      pointsGain: 5,
      action: "Compare quotes via the network",
      severity: "low",
    });
  }

  return impacts;
}

// ─── MAIN EXPORT: Infrastructure Score ───────────────────────────────────────
export function computeInfraScore(input = {}, dataQuality = "manual") {
  const monthlyGMV = Math.max(0, Number(input.monthly_revenue) || 0);
  const annualGMV = monthlyGMV * 12;

  // Neutral score if no GMV
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

  // Dimension scores
  const dimPayments = scorePayments(input, benchmarks);
  const dimShipping = scoreShipping(input, benchmarks);
  const dimSaaS = scoreSaaS(input, benchmarks);
  const dimProvider = scoreProviderQuality(input);
  const dimData = scoreDataCompleteness(dataQuality);

  // Weighted total (sums to 100%)
  const weighted =
    dimPayments * 0.35 +
    dimShipping * 0.25 +
    dimSaaS * 0.15 +
    dimProvider * 0.10 +
    dimData * 0.15;

  // Also apply a leakage penalty — leakage as % of GMV
  const leakagePct = savings.totalSavings / annualGMV; // 0..0.08 capped
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