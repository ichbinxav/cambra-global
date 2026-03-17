/**
 * THE NoDE — Infrastructure Score Engine
 * 
 * Dimensions:
 *   1. Cost Efficiency      (40%)
 *   2. Stack Optimization   (20%)
 *   3. Provider Quality     (15%)
 *   4. Geo & Structural Fit (10%)
 *   5. Data Completeness    (15%)
 */

const BENCHMARKS = {
  payment_rate: 1.4,           // % — network benchmark
  shipping_per_unit: 5.2,      // € per shipment
  saas_pct_of_revenue: 0.025,  // 2.5% of monthly rev
};

const WEIGHTS = {
  costEfficiency: 0.40,
  stackOptimization: 0.20,
  providerQuality: 0.15,
  geoStructuralFit: 0.10,
  dataCompleteness: 0.15,
};

// Tier-1 payment providers (top-quality)
const TIER1_PAYMENT = ["Adyen", "Checkout.com", "Stripe", "Mollie", "Braintree"];
const TIER1_SHIPPING = ["DHL", "FedEx", "UPS", "Sendcloud", "DPD"];

/**
 * Score: Cost Efficiency (0–100)
 * Based on payment rate, shipping cost/unit, SaaS spend vs revenue
 */
function scoreCostEfficiency(input) {
  const { payment_fee_pct, monthly_shipping_cost, monthly_shipments, total_saas_spend, monthly_revenue } = input;

  // Payment score: 100 at benchmark, 0 at 5% or above
  const payGap = Math.max(0, payment_fee_pct - BENCHMARKS.payment_rate);
  const payScore = Math.max(0, 100 - (payGap / (5 - BENCHMARKS.payment_rate)) * 100);

  // Shipping score: cost per shipment vs benchmark
  const shipments = Math.max(monthly_shipments || 1, 1);
  const costPerShipment = (monthly_shipping_cost || 0) / shipments;
  const shipGap = Math.max(0, costPerShipment - BENCHMARKS.shipping_per_unit);
  const shipScore = Math.max(0, Math.min(100, 100 - (shipGap / BENCHMARKS.shipping_per_unit) * 50));

  // SaaS score: total_saas_spend as % of monthly revenue
  const saasRatio = monthly_revenue > 0 ? (total_saas_spend || 0) / monthly_revenue : 0;
  const saasGap = Math.max(0, saasRatio - BENCHMARKS.saas_pct_of_revenue);
  const saasScore = Math.max(0, Math.min(100, 100 - (saasGap / 0.05) * 100));

  return Math.round((payScore * 0.50 + shipScore * 0.30 + saasScore * 0.20));
}

/**
 * Score: Stack Optimization (0–100)
 * Heuristic — based on SaaS spend level and fragmentation signals
 */
function scoreStackOptimization(input) {
  const { total_saas_spend, monthly_revenue } = input;
  const ratio = monthly_revenue > 0 ? (total_saas_spend || 0) / monthly_revenue : 0;

  // Low ratio = well-optimized, high ratio = fragmented
  if (ratio < 0.02) return 92;
  if (ratio < 0.03) return 78;
  if (ratio < 0.05) return 60;
  if (ratio < 0.08) return 42;
  return 25;
}

/**
 * Score: Provider Quality (0–100)
 * Based on whether the user is on top-tier providers
 */
function scoreProviderQuality(input) {
  const { payment_provider, shipping_provider, payment_fee_pct } = input;
  let score = 50; // baseline

  // Tier-1 payment provider bonus
  if (payment_provider && TIER1_PAYMENT.some(p => payment_provider.toLowerCase().includes(p.toLowerCase()))) {
    score += 20;
  }

  // Tier-1 shipping provider bonus
  if (shipping_provider && TIER1_SHIPPING.some(p => shipping_provider.toLowerCase().includes(p.toLowerCase()))) {
    score += 15;
  }

  // Negotiation potential penalty — if on a tier-1 provider but paying too much
  if (payment_fee_pct > 2.5) score -= 15;
  if (payment_fee_pct <= 2.0) score += 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score: Geographic & Structural Fit (0–100)
 * Based on channel mix and country/provider alignment
 */
function scoreGeoFit(input) {
  const { dtc_pct, marketplace_pct, wholesale_pct, monthly_revenue } = input;
  let score = 70; // default baseline

  // Higher DTC with high rev = good structural fit
  if (dtc_pct >= 50 && monthly_revenue >= 100000) score += 15;
  if (dtc_pct >= 70) score += 10;

  // Heavy marketplace dependency = structural risk
  if (marketplace_pct >= 60) score -= 20;
  if (wholesale_pct >= 60) score -= 10;

  return Math.max(0, Math.min(100, score));
}

/**
 * Score: Data Completeness (0–100)
 * How much real data vs estimates
 */
function scoreDataCompleteness(dataQuality) {
  // dataQuality: "manual" | "partial" | "connected"
  if (dataQuality === "connected") return 95;
  if (dataQuality === "partial") return 65;
  return 35; // manual estimate only
}

/**
 * Generate score impact breakdown — what's hurting the score most
 */
function generateImpacts(input, scores) {
  const impacts = [];

  if (input.payment_fee_pct > BENCHMARKS.payment_rate + 0.5) {
    const potential = Math.round((input.payment_fee_pct - BENCHMARKS.payment_rate) / (5 - BENCHMARKS.payment_rate) * 40 * WEIGHTS.costEfficiency);
    impacts.push({
      category: "Payments",
      issue: `Paying ${input.payment_fee_pct.toFixed(1)}% vs ${BENCHMARKS.payment_rate}% network rate`,
      pointsGain: Math.min(potential, 18),
      action: "Switch to network payment rate",
      severity: "high",
    });
  }

  const costPerShipment = (input.monthly_shipping_cost || 0) / Math.max(input.monthly_shipments || 1, 1);
  if (costPerShipment > BENCHMARKS.shipping_per_unit * 1.2) {
    impacts.push({
      category: "Shipping",
      issue: `€${costPerShipment.toFixed(2)}/shipment vs €${BENCHMARKS.shipping_per_unit} benchmark`,
      pointsGain: 8,
      action: "Access network shipping contracts",
      severity: "medium",
    });
  }

  const saasRatio = input.monthly_revenue > 0 ? (input.total_saas_spend || 0) / input.monthly_revenue : 0;
  if (saasRatio > BENCHMARKS.saas_pct_of_revenue) {
    impacts.push({
      category: "SaaS",
      issue: `SaaS spend at ${(saasRatio * 100).toFixed(1)}% of revenue (benchmark: 2.5%)`,
      pointsGain: 7,
      action: "Consolidate tools via group licenses",
      severity: "medium",
    });
  }

  if (scores.dataCompleteness < 60) {
    impacts.push({
      category: "Data quality",
      issue: "Score based on manual estimates — accuracy can be improved",
      pointsGain: 6,
      action: "Connect your tools or upload statements",
      severity: "low",
    });
  }

  return impacts;
}

/**
 * MAIN SCORING FUNCTION
 * @param {object} input — AnalyzerInput data
 * @param {string} dataQuality — "manual" | "partial" | "connected"
 * @returns {object} full score report
 */
export function computeInfraScore(input, dataQuality = "manual") {
  const costEfficiency = scoreCostEfficiency(input);
  const stackOptimization = scoreStackOptimization(input);
  const providerQuality = scoreProviderQuality(input);
  const geoFit = scoreGeoFit(input);
  const dataCompleteness = scoreDataCompleteness(dataQuality);

  const scores = { costEfficiency, stackOptimization, providerQuality, geoFit, dataCompleteness };

  const total = Math.round(
    costEfficiency * WEIGHTS.costEfficiency +
    stackOptimization * WEIGHTS.stackOptimization +
    providerQuality * WEIGHTS.providerQuality +
    geoFit * WEIGHTS.geoStructuralFit +
    dataCompleteness * WEIGHTS.dataCompleteness
  );

  // Potential score — assume all impacts resolved and data quality improves
  const potentialTotal = Math.min(100, Math.round(
    Math.min(100, costEfficiency + 20) * WEIGHTS.costEfficiency +
    Math.min(100, stackOptimization + 15) * WEIGHTS.stackOptimization +
    Math.min(100, providerQuality + 10) * WEIGHTS.providerQuality +
    Math.min(100, geoFit + 5) * WEIGHTS.geoStructuralFit +
    95 * WEIGHTS.dataCompleteness
  ));

  const impacts = generateImpacts(input, scores);

  const label =
    total >= 90 ? "Best-in-class" :
    total >= 80 ? "Strong" :
    total >= 60 ? "Good" :
    total >= 40 ? "Under-optimized" :
    "Poor";

  const accuracyLabel =
    dataQuality === "connected" ? "High — real data" :
    dataQuality === "partial" ? "Medium — partial data" :
    "Low — estimated";

  const scoreColor =
    total >= 80 ? "#22c55e" :
    total >= 60 ? "#f97316" :
    "#3b82f6";

  return {
    total,
    potentialTotal,
    label,
    scoreColor,
    accuracyLabel,
    dataQuality,
    dimensions: [
      { key: "costEfficiency", label: "Cost Efficiency", weight: "40%", score: costEfficiency, desc: "Payments, shipping, SaaS vs benchmarks" },
      { key: "stackOptimization", label: "Stack Optimization", weight: "20%", score: stackOptimization, desc: "Tool redundancy & fragmentation" },
      { key: "providerQuality", label: "Provider Quality", weight: "15%", score: providerQuality, desc: "Tier-1 providers & scalability" },
      { key: "geoFit", label: "Geo & Structural Fit", weight: "10%", score: geoFit, desc: "Channel mix & country alignment" },
      { key: "dataCompleteness", label: "Data Completeness", weight: "15%", score: dataCompleteness, desc: "Real data vs estimates" },
    ],
    impacts,
  };
}