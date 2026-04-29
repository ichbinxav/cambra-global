/**
 * THE NoDE — Infrastructure Score Engine v2
 *
 * Tier-based, geo-aware, dynamic benchmark logic.
 * All benchmarks derived from real industry ranges — no arbitrary values.
 *
 * Dimensions:
 *   1. Cost Efficiency      (40%)
 *   2. Stack Optimization   (20%)
 *   3. Provider Quality     (15%)
 *   4. Geo & Structural Fit (10%)
 *   5. Data Completeness    (15%)
 */

// ─── Revenue tier detection ──────────────────────────────────────────────────
// Tiers: micro (<€30K/mo), small (€30–100K), mid (€100–500K), large (>€500K)
function getRevenueTier(monthlyRevenue) {
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

// ─── Dynamic benchmarks (tier + geo aware) ───────────────────────────────────
// Based on real market data ranges (Stripe published rates, Eurosender data, SaaS spend surveys)
export function getBenchmarks(monthlyRevenue = 50000, country = "") {
  const tier = getRevenueTier(monthlyRevenue);
  const eu = isEU(country);

  // Payment benchmark: larger brands negotiate better rates
  // EU brands benefit from lower interchange caps (PSD2 regulation)
  const paymentBenchmarks = {
    micro: { rate: eu ? 1.8 : 2.2, range: eu ? [1.8, 2.4] : [2.2, 2.9] },
    small: { rate: eu ? 1.6 : 1.9, range: eu ? [1.6, 2.2] : [1.9, 2.5] },
    mid:   { rate: eu ? 1.4 : 1.6, range: eu ? [1.4, 2.0] : [1.6, 2.2] },
    large: { rate: eu ? 1.2 : 1.4, range: eu ? [1.2, 1.8] : [1.4, 2.0] },
  };

  const tpeBenchmarks = {
    micro: { rate: eu ? 1.2 : 1.5, range: eu ? [1.2, 1.7] : [1.5, 2.0] },
    small: { rate: eu ? 1.0 : 1.3, range: eu ? [1.0, 1.5] : [1.3, 1.8] },
    mid:   { rate: eu ? 0.9 : 1.1, range: eu ? [0.9, 1.3] : [1.1, 1.5] },
    large: { rate: eu ? 0.8 : 1.0, range: eu ? [0.8, 1.2] : [1.0, 1.4] },
  };

  // Shipping benchmark: per-shipment cost, based on volume tier
  // EU benefits from dense carrier networks
  const shippingBenchmarks = {
    micro: { perUnit: eu ? 5.80 : 7.20, range: [eu ? 5.80 : 7.20, eu ? 8.00 : 9.50] },
    small: { perUnit: eu ? 5.20 : 6.50, range: [eu ? 5.20 : 6.50, eu ? 7.50 : 9.00] },
    mid:   { perUnit: eu ? 4.60 : 5.80, range: [eu ? 4.60 : 5.80, eu ? 6.50 : 8.00] },
    large: { perUnit: eu ? 3.90 : 4.80, range: [eu ? 3.90 : 4.80, eu ? 5.50 : 7.00] },
  };

  // SaaS benchmark: % of monthly revenue — well-optimized brands
  // Based on Gartner + Paddle surveys on SaaS spend vs GMV
  const saasBenchmarks = {
    micro: { pct: 0.06, range: [0.04, 0.09] },   // micro brands spend more relative
    small: { pct: 0.04, range: [0.03, 0.06] },
    mid:   { pct: 0.025, range: [0.02, 0.04] },
    large: { pct: 0.015, range: [0.01, 0.025] },
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

// ─── Savings calculation (used in Analyzer + Results) ────────────────────────
export function calculateSavings(input) {
  const {
    monthly_revenue = 0,
    avg_order_value = 0,
    total_saas_spend = 0,
    monthly_shipping_cost = 0,
    monthly_shipments = 0,
    country,
    intl_pct = 0,
    in_store_gmv = 0,
    tpe_transaction_fee_pct = 0,
    monthly_terminal_rental = 0,
    fixed_banking_fees = 0,
    maintenance_fees = 0,
  } = input || {};

  // Annualized GMV and transactions
  const annualGMV = Math.max(0, (monthly_revenue || 0) * 12);
  const aov = Math.max(1, avg_order_value || 1);
  const annualTransactions = Math.floor(annualGMV / aov);

  // Financial model constants
  const fee_actual = 0.019; // 1.9%
  const fee_node = 0.012;   // 1.2%
  const fijo_actual = 0.25; // € per txn
  const fijo_node = 0.15;   // € per txn

  // Payments savings
  const ahorro_variable = annualGMV * (fee_actual - fee_node);
  const ahorro_fijo = annualTransactions * (fijo_actual - fijo_node);
  const intlBonus = annualGMV * (Math.max(0, Math.min(100, intl_pct)) / 100) * 0.01; // +1% over international volume

  const annualInStoreGmv = Math.max(0, (in_store_gmv || 0) * 12);
  const tpeBenchmarks = getBenchmarks(monthly_revenue, country).tpe;
  const tpeVariableAnnual = annualInStoreGmv * ((tpe_transaction_fee_pct || 0) / 100);
  const tpeFixedAnnual = ((monthly_terminal_rental || 0) + (fixed_banking_fees || 0) + (maintenance_fees || 0)) * 12;
  const tpeEffectiveRate = annualInStoreGmv > 0 ? ((tpeVariableAnnual + tpeFixedAnnual) / annualInStoreGmv) * 100 : 0;
  const tpeSavings = Math.max(0, Math.round(annualInStoreGmv * ((tpeEffectiveRate - tpeBenchmarks.rate) / 100)));

  const paymentSavings = Math.round(ahorro_variable + ahorro_fijo + intlBonus + tpeSavings);

  // SaaS savings: 20% on excess above 2% of GMV + 10% direct network discount
  const saasAnnual = (total_saas_spend || 0) * 12;
  const saasThreshold = annualGMV * 0.02;
  const saasExcess = Math.max(0, saasAnnual - saasThreshold);
  const saasSavings = Math.round(saasExcess * 0.20 + saasAnnual * 0.10);

  // Shipping not modeled in this version — keep for UI compatibility
  const shipCount = Math.max(monthly_shipments || 1, 1);
  const costPerShipment = (monthly_shipping_cost || 0) / shipCount;
  const shippingSavings = 0;

  const totalSavings = Math.round(paymentSavings + shippingSavings + saasSavings);

  return {
    paymentSavings,
    shippingSavings,
    saasSavings,
    totalSavings,
    benchmarks: null,
    optimalShippingCost: 0,
    optimalSaasCost: 0,
    details: {
      annual_gmv: annualGMV,
      avg_order_value: aov,
      annual_transactions: annualTransactions,
      payment_current_rate: fee_actual * 100,
      payment_optimal_rate: fee_node * 100,
      tpe_effective_rate: tpeEffectiveRate,
      tpe_optimal_rate: tpeBenchmarks.rate,
      tpe_savings: tpeSavings,
      shipping_current_avg: costPerShipment,
      shipping_optimal_avg: costPerShipment,
      saas_current_total: total_saas_spend || 0,
      saas_optimal_total: saasThreshold / 12,
      intl_pct: intl_pct || 0,
    },
  };
}

// ─── Tier-1 providers ────────────────────────────────────────────────────────
const TIER1_PAYMENT = ["adyen", "checkout.com", "stripe", "mollie", "braintree"];
const TIER1_SHIPPING = ["dhl", "fedex", "ups", "sendcloud", "dpd"];

// ─── Dimension scores ────────────────────────────────────────────────────────
function scoreCostEfficiency(input, benchmarks) {
  const { payment_fee_pct, monthly_shipping_cost, monthly_shipments, total_saas_spend, monthly_revenue } = input;
  const shipCount = Math.max(monthly_shipments || 1, 1);
  const costPerShipment = (monthly_shipping_cost || 0) / shipCount;

  // Payment: 100 at benchmark, 0 at 3× benchmark
  const payMax = benchmarks.payment.rate * 3;
  const payScore = Math.max(0, Math.min(100, 100 - ((payment_fee_pct - benchmarks.payment.rate) / (payMax - benchmarks.payment.rate)) * 100));

  // Shipping: 100 at benchmark, 0 at 2× benchmark
  const shipMax = benchmarks.shipping.perUnit * 2;
  const shipScore = Math.max(0, Math.min(100, 100 - ((costPerShipment - benchmarks.shipping.perUnit) / (shipMax - benchmarks.shipping.perUnit)) * 100));

  // SaaS: 100 at benchmark, 0 at 3× benchmark
  const saasRatio = monthly_revenue > 0 ? (total_saas_spend || 0) / monthly_revenue : 0;
  const saasMax = benchmarks.saas.pct * 3;
  const saasScore = Math.max(0, Math.min(100, 100 - ((saasRatio - benchmarks.saas.pct) / Math.max(saasMax - benchmarks.saas.pct, 0.01)) * 100));

  return Math.round(payScore * 0.50 + shipScore * 0.30 + saasScore * 0.20);
}

function scoreStackOptimization(input, benchmarks) {
  const { total_saas_spend, monthly_revenue } = input;
  const ratio = monthly_revenue > 0 ? (total_saas_spend || 0) / monthly_revenue : 0;
  const benchmarkRatio = benchmarks.saas.pct;

  // Score relative to the tier benchmark
  const factor = ratio / Math.max(benchmarkRatio, 0.001);
  if (factor <= 1.0) return 95;
  if (factor <= 1.3) return 80;
  if (factor <= 1.8) return 62;
  if (factor <= 2.5) return 42;
  return 22;
}

function scoreProviderQuality(input) {
  const { payment_provider, shipping_provider, payment_fee_pct } = input;
  let score = 50;

  if (payment_provider && TIER1_PAYMENT.some(p => payment_provider.toLowerCase().includes(p))) score += 20;
  if (shipping_provider && TIER1_SHIPPING.some(p => shipping_provider.toLowerCase().includes(p))) score += 15;

  // Even on tier-1, if rate is high → room to renegotiate
  if (payment_fee_pct > 2.5) score -= 15;
  if (payment_fee_pct <= 1.8) score += 10;

  return Math.max(0, Math.min(100, score));
}

function scoreGeoFit(input) {
  const { dtc_pct, marketplace_pct, wholesale_pct, monthly_revenue } = input;
  let score = 65;

  if (dtc_pct >= 50 && monthly_revenue >= 100000) score += 15;
  if (dtc_pct >= 70) score += 10;
  if (marketplace_pct >= 60) score -= 20;
  if (wholesale_pct >= 60) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function scoreDataCompleteness(dataQuality) {
  if (dataQuality === "connected") return 95;
  if (dataQuality === "partial") return 65;
  return 35;
}

function generateImpacts(input, scores, benchmarks) {
  const impacts = [];
  const { payment_fee_pct, monthly_shipping_cost, monthly_shipments, total_saas_spend, monthly_revenue } = input;
  const shipCount = Math.max(monthly_shipments || 1, 1);
  const costPerShipment = (monthly_shipping_cost || 0) / shipCount;
  const saasRatio = monthly_revenue > 0 ? (total_saas_spend || 0) / monthly_revenue : 0;

  if ((payment_fee_pct || 2.9) > benchmarks.payment.rate + 0.3) {
    const pctAbove = ((payment_fee_pct || 2.9) - benchmarks.payment.rate).toFixed(1);
    impacts.push({
      category: "Payments",
      issue: `Your rate (${(payment_fee_pct || 2.9).toFixed(1)}%) is ${pctAbove}% above the network benchmark of ${benchmarks.payment.rate}%`,
      pointsGain: Math.min(18, Math.round(parseFloat(pctAbove) * 5)),
      action: "Unlock network payment rate",
      severity: parseFloat(pctAbove) > 1.0 ? "high" : "medium",
    });
  }

  if (costPerShipment > benchmarks.shipping.perUnit * 1.15) {
    impacts.push({
      category: "Shipping",
      issue: `€${costPerShipment.toFixed(2)}/shipment vs €${benchmarks.shipping.perUnit.toFixed(2)} network target — efficiency gap identified`,
      pointsGain: 8,
      action: "Activate collective shipping contracts",
      severity: "medium",
    });
  }

  if (saasRatio > benchmarks.saas.pct * 1.2) {
    impacts.push({
      category: "SaaS",
      issue: `Stack spend at ${(saasRatio * 100).toFixed(1)}% of revenue — network range: ${(benchmarks.saas.range[0] * 100).toFixed(1)}–${(benchmarks.saas.range[1] * 100).toFixed(1)}%`,
      pointsGain: 7,
      action: "Reduce stack cost via group licenses",
      severity: "medium",
    });
  }

  if (scores.dataCompleteness < 60) {
    impacts.push({
      category: "Data quality",
      issue: "Analysis based on estimated inputs — precision improves significantly with connected tools",
      pointsGain: 6,
      action: "Connect your data for precise insights",
      severity: "low",
    });
  }

  return impacts;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
export function computeInfraScore(input, dataQuality = "manual") {
  const { monthly_revenue = 0, avg_order_value = 0, total_saas_spend = 0, intl_pct = 0 } = input || {};
  const annualGMV = Math.max(0, (monthly_revenue || 0) * 12);

  // If we can't compute GMV, return a neutral score
  if (annualGMV <= 0) {
    return {
      total: 50,
      potentialTotal: 65,
      label: "Optimization opportunity detected",
      scoreColor: "#f97316",
      accuracyLabel: dataQuality === "connected" ? "High — real data" : dataQuality === "partial" ? "Medium — partial data" : "Estimated — connect tools to refine",
      dataQuality,
      benchmarks: null,
      dimensions: [
        { key: "efficiency", label: "Efficiency", weight: "100%", score: 50, desc: "Preliminary score" },
      ],
      impacts: [],
    };
  }

  // Financial model constants
  const fee_actual = 0.019, fee_node = 0.012;
  const fijo_actual = 0.25, fijo_node = 0.15;
  const aov = Math.max(1, avg_order_value || 1);
  const annualTransactions = Math.floor(annualGMV / aov);

  const ahorro_variable = annualGMV * (fee_actual - fee_node);
  const ahorro_fijo = annualTransactions * (fijo_actual - fijo_node);
  const intlBonus = annualGMV * (Math.max(0, Math.min(100, intl_pct)) / 100) * 0.01;

  const saasAnnual = (total_saas_spend || 0) * 12;
  const saasThreshold = annualGMV * 0.02;
  const saasExcess = Math.max(0, saasAnnual - saasThreshold);
  const saasSavings = saasExcess * 0.20 + saasAnnual * 0.10;

  const totalSavings = Math.max(0, ahorro_variable + ahorro_fijo + intlBonus + saasSavings);

  // New scoring model
  let total = 100 - ((totalSavings / annualGMV) * 500);
  total = Math.max(0, Math.min(100, Math.round(total)));

  const potentialTotal = Math.min(100, total + 15);

  const label =
    total >= 80 ? "Strong" :
    total >= 60 ? "Efficient" :
    total >= 40 ? "Optimization opportunity detected" :
    "High optimization potential";

  const scoreColor = total < 50 ? "#ef4444" : (total > 80 ? "#22c55e" : "#f59e0b");
  const accuracyLabel = dataQuality === "connected" ? "High — real data" : dataQuality === "partial" ? "Medium — partial data" : "Estimated — connect tools to refine";

  return {
    total,
    potentialTotal,
    label,
    scoreColor,
    accuracyLabel,
    dataQuality,
    benchmarks: null,
    dimensions: [
      { key: "paymentsEfficiency", label: "Payments", weight: "—", score: Math.max(0, Math.min(100, Math.round((ahorro_variable + ahorro_fijo + intlBonus) / Math.max(annualGMV * 0.03, 1) * 100))), desc: "Impacto de pagos" },
      { key: "saasEfficiency", label: "SaaS", weight: "—", score: Math.max(0, Math.min(100, Math.round(100 - (saasExcess / Math.max(saasThreshold || 1, 1)) * 50))), desc: "Gasto vs umbral" },
      { key: "overall", label: "Overall", weight: "—", score: total, desc: "Puntuación global" },
    ],
    impacts: [],
  };
}