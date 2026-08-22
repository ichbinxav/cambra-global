import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import {
  isP4PublishableObservedCohort,
  normalizeP4SourcePopulation,
} from '../../shared/p4BenchmarkIntelligence.ts';

/**
 * M2 — Public-facing benchmark accessor.
 *
 * This is the ONLY function the frontend may call to obtain benchmark data.
 * It returns ONLY aggregated, anonymized data. It NEVER exposes:
 *   - source_anon_id
 *   - individual contribution values
 *   - cohort internals beyond aggregates
 *   - cohorts with fewer than 20 distinct merchants
 *   - internal INDICATIVE cohorts
 *
 * Confidence labels are ALWAYS attached and MUST be shown when rendering.
 */

// ════════════════════════════════════════════════════════════════════
// STATIC FALLBACK BENCHMARKS — EXACT MIRROR of lib/scoreEngine.js v1.0.0
//
// DO NOT DIVERGE. Every value here MUST match getBenchmarks() in
// lib/scoreEngine.js AND the mirrors inside:
//   - functions/spendIntelligenceAgent.js
//   - functions/recommendationEngineAgent.js
//
// If you change a value here without changing the other three, the brand
// will see a benchmark on screen that B3 did NOT use to compute their
// savings — the credibility bug we keep killing. Verify all four files
// after any edit.
// ════════════════════════════════════════════════════════════════════

const EU_COUNTRIES = new Set([
  "France","Germany","Spain","Italy","Netherlands","Belgium","Portugal",
  "Sweden","Denmark","Finland","Norway","Austria","Switzerland","Ireland",
  "Poland","Czech Republic","Romania","Hungary","Greece","Luxembourg",
  "Malta","Cyprus","Slovakia","Slovenia","Croatia","Estonia","Latvia",
  "Lithuania","Bulgaria",
]);
const isEU = (c) => EU_COUNTRIES.has(c);

// Mirror of scoreEngine.getBenchmarks() v1.0.0 — see file header
const STATIC_BENCHMARKS = {
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
    // SaaS benchmark is % of monthly revenue — region-agnostic in scoreEngine v1.0.0
    micro: 0.060,
    small: 0.040,
    mid:   0.025,
    large: 0.015,
  },
};

function staticFor(vertical, tier, country) {
  const v = STATIC_BENCHMARKS[vertical];
  if (!v) return null;
  const t = v[tier] || v["small"];
  if (t == null) return null;
  if (vertical === "saas") return typeof t === "number" ? t : null;
  return isEU(country) ? t.eu : t.nonEu;
}

function metricKeyFor(vertical) {
  if (vertical === "payments") return "payment_effective_rate";
  if (vertical === "shipping") return "shipping_avg_cost_per_unit";
  if (vertical === "saas") return "saas_monthly_spend_pct_revenue";
  return null;
}

function confidenceFor(n) {
  if (n >= 40) return "high";
  if (n >= 20) return "medium";
  if (n >= 10) return "low";
  return "static";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    const vertical = String(body?.vertical || "").toLowerCase();
    const revenue_tier = String(body?.revenue_tier || "small").toLowerCase();
    const country = String(body?.country || "unknown");
    const source_population = normalizeP4SourcePopulation(
      body?.source_population || "inbound",
    );

    if (!vertical) {
      return Response.json({ error: "vertical is required" }, { status: 400 });
    }

    const metric_key = metricKeyFor(vertical);
    if (!metric_key) {
      return Response.json({ error: "unsupported vertical" }, { status: 400 });
    }
    if (!source_population) {
      return Response.json({ error: "unsupported source_population" }, {
        status: 400,
      });
    }

    const cohort_key = `${revenue_tier}|${country}|${vertical}`;

    // Look up most recent public cohort
    const cohorts = await base44.asServiceRole.entities.BenchmarkCohort.filter(
      {
        cohort_key,
        metric_key,
        source_population,
        data_origin: "observed_contributions",
        publication_status: "PUBLISHABLE",
        is_public: true,
      },
      "-month",
      1
    );

    if (cohorts && cohorts.length > 0 && isP4PublishableObservedCohort(cohorts[0])) {
      const c = cohorts[0];
      const n = Number(c.n || 0);
      const confidence = confidenceFor(n);
      const note = `Observed among ${n} merchants diagnosed by CAMBRA.`;

      return Response.json({
        source: "network",
        source_population,
        publication_status: "PUBLISHABLE",
        confidence,
        n,
        median: c.median ?? null,
        p25: c.p25 ?? null,
        p75: c.p75 ?? null,
        best_in_class: c.best_in_class ?? null,
        benchmark_version: c.benchmark_version || c.derivation_version || null,
        lineage_hash: c.lineage_hash || null,
        derived_at: c.derived_at || null,
        note,
      });
    }

    // Fallback to static benchmark — MUST match scoreEngine v1.0.0 (mirror above)
    const staticVal = staticFor(vertical, revenue_tier, country);
    return Response.json({
      source: "static",
      source_population,
      confidence: "static",
      n: 0,
      median: staticVal,
      p25: null,
      p75: null,
      best_in_class: null,
      score_engine_version: "1.0.0",
      region: isEU(country) ? "EU" : "non-EU",
      note: "Static reference, not a statistical cohort — network sample is below the privacy/sufficiency threshold",
    });
  } catch (error) {
    return internalErrorResponse(error, 'getBenchmarkForReport');
  }
});
