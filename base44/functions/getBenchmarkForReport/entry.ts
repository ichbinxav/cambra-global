import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * getBenchmarkForReport
 *
 * Returns the network benchmark for a given vertical + revenue tier + country,
 * scoped to a public cohort (n >= 5). Falls back to a static reference value
 * when no public cohort exists.
 *
 * Request: { vertical: "payments"|"shipping"|"saas", revenue_tier: "micro"|"small"|"mid"|"large", country: string }
 * Response: { source: "network"|"static", median, p25, p75, n, vertical, tier, country }
 */

const STATIC_FALLBACK = {
  payments: { median: 1.7, p25: 1.4, p75: 2.0, unit: "pct" },
  shipping: { median: 4.8, p25: 4.2, p75: 5.6, unit: "eur_per_shipment" },
  saas:     { median: 2.8, p25: 2.0, p75: 3.6, unit: "pct_of_revenue" },
};

function isEU(country) {
  const EU = ["France","Germany","Spain","Italy","Netherlands","Belgium","Portugal","Ireland","Sweden","Denmark","Finland","Austria","Poland","Czech Republic","Romania","Hungary","Greece","Luxembourg"];
  return EU.includes(country);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const vertical = String(body.vertical || "").toLowerCase();
    const tier = String(body.revenue_tier || "small").toLowerCase();
    const country = String(body.country || "");

    if (!["payments", "shipping", "saas"].includes(vertical)) {
      return Response.json({ error: 'Invalid vertical' }, { status: 400 });
    }

    // Try to find a public network cohort
    const cohortKey = `${tier}|${country}|${vertical}`;
    let cohort = null;
    try {
      const rows = await base44.asServiceRole.entities.BenchmarkCohort.filter({
        cohort_key: cohortKey,
        metric_key: vertical,
        is_public: true,
      }, "-month", 1);
      cohort = rows[0] || null;
    } catch (_) { /* fall through to static */ }

    // Fall back to EU-wide cohort if country-specific doesn't exist
    if (!cohort && country) {
      const euKey = `${tier}|EU|${vertical}`;
      try {
        const rows = await base44.asServiceRole.entities.BenchmarkCohort.filter({
          cohort_key: euKey,
          metric_key: vertical,
          is_public: true,
        }, "-month", 1);
        cohort = rows[0] || null;
      } catch (_) {}
    }

    if (cohort && Number(cohort.n) >= 5) {
      return Response.json({
        source: "network",
        median: Number(cohort.median),
        p25: Number(cohort.p25),
        p75: Number(cohort.p75),
        n: Number(cohort.n),
        vertical, tier, country,
      });
    }

    // Static fallback
    const s = STATIC_FALLBACK[vertical];
    return Response.json({
      source: "static",
      median: s.median,
      p25: s.p25,
      p75: s.p75,
      n: 0,
      vertical, tier, country,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});