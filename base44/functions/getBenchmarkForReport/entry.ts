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

// ════════════════════════════════════════════════════════════════════════════
// ⚠️  SOURCE OF TRUTH WARNING — READ BEFORE EDITING
// ════════════════════════════════════════════════════════════════════════════
// The canonical benchmark values live in lib/scoreEngine.js → getBenchmarks().
// Deno backend cannot import frontend files, so the values below are an
// INTENTIONAL INLINE COPY that MUST stay byte-identical to scoreEngine.js.
//
// If you change a number here, you MUST change it in scoreEngine.js too,
// and vice versa. A divergence will cause Results.jsx to show a benchmark
// different from the one the Analyzer used to compute savings — silently
// breaking client trust. See Decision_Log for context.
//
// Future improvement (deferred, more invasive): move both consumers to read
// from a shared Benchmark entity in the DB so this duplication disappears.
//
// Format rules (all values in their NATURAL, READABLE unit):
//   - payments / saas  →  % as displayed (2.2 means 2.2%, NOT 0.022)
//   - shipping         →  euros per parcel (7.5 means 7.50 €/parcel)
//   - The frontend renders `median + unit symbol` directly; never multiplies.
// ════════════════════════════════════════════════════════════════════════════

// Payments — tier + EU/non-EU aware. MUST equal scoreEngine.js paymentBenchmarks.rate.
const PAYMENT_BENCHMARKS_EU = { micro: 2.4, small: 2.2, mid: 1.9, large: 1.6 };
const PAYMENT_BENCHMARKS_NON_EU = { micro: 2.9, small: 2.6, mid: 2.3, large: 1.9 };

// Shipping — tier + EU/non-EU aware. MUST equal scoreEngine.js shippingBenchmarks.perUnit.
const SHIPPING_BENCHMARKS_EU = { micro: 5.80, small: 5.20, mid: 4.60, large: 3.90 };
const SHIPPING_BENCHMARKS_NON_EU = { micro: 7.20, small: 6.50, mid: 5.80, large: 4.80 };

// SaaS — tier-aware only. scoreEngine.js stores as ratio (0.060); we expose as % (6.0).
const SAAS_BENCHMARKS_PCT = { micro: 6.0, small: 4.0, mid: 2.5, large: 1.5 };

const STATIC_UNITS: Record<string, string> = {
  payments: "%",
  saas: "%",
  shipping: "EUR_per_parcel",
};

const EU_COUNTRIES = new Set([
  "France", "Germany", "Spain", "Italy", "Netherlands", "Belgium", "Portugal",
  "Sweden", "Denmark", "Finland", "Norway", "Austria", "Switzerland", "Ireland",
  "Poland", "Czech Republic", "Romania", "Hungary", "Greece", "Luxembourg",
  "Malta", "Cyprus", "Slovakia", "Slovenia", "Croatia", "Estonia", "Latvia",
  "Lithuania", "Bulgaria",
]);

function staticFor(vertical: string, tier: string, country: string): number | null {
  const isEU = EU_COUNTRIES.has(country);
  const safeTier = (tier === "micro" || tier === "small" || tier === "mid" || tier === "large") ? tier : "small";
  if (vertical === "payments") {
    return (isEU ? PAYMENT_BENCHMARKS_EU : PAYMENT_BENCHMARKS_NON_EU)[safeTier];
  }
  if (vertical === "shipping") {
    return (isEU ? SHIPPING_BENCHMARKS_EU : SHIPPING_BENCHMARKS_NON_EU)[safeTier];
  }
  if (vertical === "saas") {
    return SAAS_BENCHMARKS_PCT[safeTier];
  }
  return null;
}

function unitFor(vertical: string): string | null {
  return STATIC_UNITS[vertical] ?? null;
}

function metricKeyFor(vertical: string): string | null {
  if (vertical === "payments") return "payment_effective_rate";
  if (vertical === "shipping") return "shipping_avg_cost_per_unit";
  if (vertical === "saas") return "saas_monthly_spend_pct_revenue";
  return null;
}

function confidenceFor(n: number): string {
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
        unit: unitFor(vertical),
        note,
      });
    }

    // Fallback to static benchmark — values mirrored from scoreEngine.js
    const staticVal = staticFor(vertical, revenue_tier, country);
    return Response.json({
      source: "static",
      confidence: "static",
      n: 0,
      median: staticVal,
      p25: null,
      p75: null,
      best_in_class: null,
      unit: unitFor(vertical),
      note: "Benchmark from CAMBRA static reference table — network sample too small",
    });
  } catch (error) {
    return Response.json({ error: (error as any)?.message || String(error) }, { status: 500 });
  }
});