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

// Static fallbacks mirror scoreEngine.getBenchmarks() — keep in sync.
const STATIC_BENCHMARKS: Record<string, Record<string, number>> = {
  payments: { micro: 2.4, small: 2.0, mid: 1.7, large: 1.4 },
  shipping: { micro: 7.5, small: 6.5, mid: 5.5, large: 4.8 },
  saas: { micro: 0.045, small: 0.035, mid: 0.025, large: 0.018 },
};

function staticFor(vertical: string, tier: string): number | null {
  const v = STATIC_BENCHMARKS[vertical];
  if (!v) return null;
  return v[tier] ?? v["small"] ?? null;
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
      // Honesty guard: a cohort with n < 5 is a seeded synthetic reference,
      // not real network data. Surface that to the UI so we never claim
      // "network benchmark" when there's no actual network behind it yet.
      const isSeed = n < 5;
      const source = isSeed ? "seed" : "network";
      const confidence = isSeed ? "seed" : confidenceFor(n);
      const note = isSeed
        ? "Benchmark from CAMBRA seeded reference cohort — not yet backed by network data"
        : confidence === "low"
        ? `Benchmark based on ${n} anonymized companies — low confidence`
        : confidence === "medium"
        ? `Benchmark based on ${n} anonymized companies`
        : `Benchmark based on ${n} anonymized companies — high confidence`;

      return Response.json({
        source,
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
    const staticVal = staticFor(vertical, revenue_tier);
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
    return Response.json({ error: (error as any)?.message || String(error) }, { status: 500 });
  }
});