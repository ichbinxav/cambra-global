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

// Static fallbacks — EXACT MIRROR of lib/scoreEngine.js getBenchmarks() v1.0.0.
// DO NOT diverge. If you change values here, change them there too (and in
// functions/spendIntelligenceAgent.js). All three must produce the same number
// for the same (vertical, tier, region) tuple — otherwise the brand will see a
// benchmark on screen that B3 didn't use to compute their savings (credibility bug).
const EU_COUNTRIES = new Set([
  "France","Germany","Spain","Italy","Netherlands","Belgium","Portugal",
  "Sweden","Denmark","Finland","Norway","Austria","Switzerland","Ireland",
  "Poland","Czech Republic","Romania","Hungary","Greece","Luxembourg",
  "Malta","Cyprus","Slovakia","Slovenia","Croatia","Estonia","Latvia",
  "Lithuania","Bulgaria",
]);
const isEU = (c: string) => EU_COUNTRIES.has(c);

const STATIC_BENCHMARKS: Record<string, any> = {
  payments: {
    micro: { eu: 2.4, nonEu: 2.9 },
    small: { eu: 2.2, nonEu: 2.6 },
    mid:   { eu: 1.9, nonEu: 2.3 },
    large: { eu: 1.6, nonEu: 1.9 },
  },
  shipping: {
    micro: { eu: 5.80, nonEu: 7.20 },
    small: { eu: 5.20, nonEu: 6.50 },
    mid:   { eu: 4.60, nonEu: 5.80 },
    large: { eu: 3.90, nonEu: 4.80 },
  },
  saas: {
    // % of monthly revenue — region-agnostic in scoreEngine v1.0.0
    micro: 0.060,
    small: 0.040,
    mid:   0.025,
    large: 0.015,
  },
};

function staticFor(vertical: string, tier: string, country: string): number | null {
  const v = STATIC_BENCHMARKS[vertical];
  if (!v) return null;
  const t = v[tier] || v["small"];
  if (t == null) return null;
  if (vertical === "saas") return typeof t === "number" ? t : null;
  return isEU(country) ? t.eu : t.nonEu;
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
        note,
      });
    }

    // Fallback to static benchmark — MUST match scoreEngine v1.0.0 (mirrored above).
    const staticVal = staticFor(vertical, revenue_tier, country);
    return Response.json({
      source: "static",
      confidence: "static",
      n: 0,
      median: staticVal,
      p25: null,
      p75: null,
      best_in_class: null,
      score_engine_version: "1.0.0",
      region: isEU(country) ? "EU" : "non-EU",
      note: "Benchmark from CAMBRA static reference table (scoreEngine v1.0.0) — network sample too small",
    });
  } catch (error) {
    return Response.json({ error: (error as any)?.message || String(error) }, { status: 500 });
  }
});