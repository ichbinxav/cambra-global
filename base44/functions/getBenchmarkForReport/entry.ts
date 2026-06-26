import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M2 — Public-facing benchmark accessor.
 *
 * This is the ONLY function the frontend may call to obtain benchmark data.
 * It returns ONLY aggregated, anonymized data. It NEVER exposes:
 *   - source_anon_id
 *   - individual contribution values
 *   - cohort internals beyond aggregates
 *   - cohorts with n < 5 (those have is_public=false)
 *
 * Confidence labels are ALWAYS attached and MUST be shown when rendering.
 */

// ⚠️ SOURCE OF TRUTH for static fallbacks.
// These values MUST mirror lib/scoreEngine.js → getBenchmarks() exactly.
// Deno backend cannot import scoreEngine (frontend lib), so the values are
// duplicated by necessity. If scoreEngine changes, update here too.
//
// Structure mirrors the engine:
//   - payments + shipping: split EU / non-EU (PSD2 caps, SEPA, EU carrier blend)
//   - saas: no geo split (same Gartner/Paddle ratios globally)
//
// Last sync: 2026-06-26 against scoreEngine v1.0.0
const STATIC_BENCHMARKS = {
  payments: {
    eu:     { micro: 2.4, small: 2.2, mid: 1.9, large: 1.6 },
    nonEu:  { micro: 2.9, small: 2.6, mid: 2.3, large: 1.9 },
  },
  shipping: {
    eu:     { micro: 5.80, small: 5.20, mid: 4.60, large: 3.90 },
    nonEu:  { micro: 7.20, small: 6.50, mid: 5.80, large: 4.80 },
  },
  saas:     { micro: 0.060, small: 0.040, mid: 0.025, large: 0.015 },
};

// Same EU list as scoreEngine.js — keep in sync.
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

function staticFor(vertical, tier, country) {
  const v = STATIC_BENCHMARKS[vertical];
  if (!v) return null;
  // SaaS: no geo split
  if (vertical === "saas") {
    return v[tier] ?? v["small"] ?? null;
  }
  // Payments + shipping: split by EU vs non-EU
  const geoTable = isEU(country) ? v.eu : v.nonEu;
  return geoTable[tier] ?? geoTable["small"] ?? null;
}

function metricKeyFor(vertical) {
  if (vertical === "payments") return "payment_effective_rate";
  if (vertical === "shipping") return "shipping_avg_cost_per_unit";
  if (vertical === "saas") return "saas_monthly_spend_pct_revenue";
  return null;
}

function confidenceFor(n) {
  if (n >= 40) return "high";
  if (n >= 15) return "medium";
  if (n >= 5) return "low";
  return "static";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const vertical = String(body?.vertical || "").toLowerCase();
    const revenue_tier = String(body?.revenue_tier || "small").toLowerCase();
    const country = String(body?.country || "unknown");

    if (!vertical) {
      return Response.json({ error: "vertical is required" }, { status: 400 });
    }

    const metric_key = metricKeyFor(vertical);
    if (!metric_key) {
      return Response.json({ error: "unsupported vertical" }, { status: 400 });
    }

    const cohort_key = `${revenue_tier}|${country}|${vertical}`;

    // Look up most recent public cohort
    const cohorts = await base44.asServiceRole.entities.BenchmarkCohort.filter(
      { cohort_key, metric_key, is_public: true },
      "-month",
      1
    );

    if (cohorts && cohorts.length > 0) {
      const c = cohorts[0];
      const n = Number(c.n || 0);
      const confidence = confidenceFor(n);
      const note =
        confidence === "low"
          ? `Benchmark based on ${n} anonymized companies — low confidence`
          : confidence === "medium"
          ? `Benchmark based on ${n} anonymized companies`
          : `Benchmark based on ${n} anonymized companies — high confidence`;

      return Response.json({
        source: "network",
        confidence,
        n,
        median: c.median ?? null,
        p25: c.p25 ?? null,
        p75: c.p75 ?? null,
        best_in_class: c.best_in_class ?? null,
        note,
      });
    }

    // Fallback to static benchmark from scoreEngine
    const staticVal = staticFor(vertical, revenue_tier, country);
    return Response.json({
      source: "static",
      confidence: "static",
      n: 0,
      median: staticVal,
      p25: null,
      p75: null,
      best_in_class: null,
      note: "Benchmark from CAMBRA static reference table — network sample too small",
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});