import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M2 — Benchmark Learning Engine
 *
 * Ingests a completed AnalyzerResult and produces pseudonymized BenchmarkContribution records.
 *
 * IMPORTANT: source_anon_id = SHA-256(BENCHMARK_ANON_SALT + brand_id).
 * This is a STABLE PSEUDONYM, not anonymous data under GDPR while the salt exists.
 * The salt MUST NEVER be rotated without a full migration of all existing
 * BenchmarkContribution records — rotating it would orphan all historic contributions
 * from their cohort identity. Treat BENCHMARK_ANON_SALT as a permanent secret.
 *
 * Admin / service role only — not callable by regular users.
 */

const EU_COUNTRIES = new Set([
  "Austria","Belgium","Bulgaria","Croatia","Cyprus","Czech Republic","Denmark","Estonia",
  "Finland","France","Germany","Greece","Hungary","Ireland","Italy","Latvia","Lithuania",
  "Luxembourg","Malta","Netherlands","Poland","Portugal","Romania","Slovakia","Slovenia",
  "Spain","Sweden"
]);

function revenueTier(monthlyRevenue: number): string {
  const m = Number(monthlyRevenue || 0);
  if (m < 10000) return "micro";
  if (m < 100000) return "small";
  if (m < 500000) return "mid";
  return "large";
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Modified Z-score using median absolute deviation
function modifiedZScore(value: number, values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = values.map((v) => Math.abs(v - median));
  const sortedDev = deviations.sort((a, b) => a - b);
  const mad = sortedDev[Math.floor(sortedDev.length / 2)] || 0;
  if (mad === 0) return 0;
  return (0.6745 * (value - median)) / mad;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: admin OR service role (no user attached)
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") {
      return Response.json({ error: "Forbidden: admin or service role required" }, { status: 403 });
    }

    const SALT = Deno.env.get("BENCHMARK_ANON_SALT");
    if (!SALT) {
      throw new Error("BENCHMARK_ANON_SALT environment variable is required");
    }

    const body = await req.json().catch(() => ({}));
    const resultId = body?.resultId;
    if (!resultId) {
      return Response.json({ error: "resultId is required" }, { status: 400 });
    }

    // Load result + input
    const result = await base44.asServiceRole.entities.AnalyzerResult.get(resultId);
    if (!result) return Response.json({ error: "AnalyzerResult not found" }, { status: 404 });

    // ─── ANONYMOUS QUARANTINE (poisoning defense) ─────────────────────────
    //
    // Two gates, both must pass, checked as a single OR:
    //
    //   (a) anon_session_id — still set while the record is un-claimed.
    //       Cleared by claimAnonymousAnalysis on first claim.
    //   (b) was_anonymous — sticky origin flag, set to true by
    //       submitAnonymousAnalysis at creation. NEVER cleared, including
    //       after claim.
    //
    // Records with an active `anon_session_id` were submitted by unauthenticated
    // callers via submitAnonymousAnalysis. Their savings/score numbers come
    // straight from the CLIENT (see the trust-boundary note in that function)
    // and MUST NOT feed the network learning loop — one attacker could
    // otherwise poison every cohort's benchmark values with a single POST.
    //
    // Once claimed, `anon_session_id` is cleared but the client-provided numbers
    // are still in the record. `was_anonymous` stays true so the quarantine
    // continues to hold. This record becomes eligible for the learning loop only
    // after we add server-side recalculation of savings/score (see the TODO in
    // submitAnonymousAnalysis) — at that point the recalculation path would
    // create a fresh, trusted AnalyzerResult, not re-use this one.
    //
    // Defense in depth: this check protects even against direct invocations
    // of benchmarkLearningEngine that bypass onAnalyzerCompleted.
    if (result.anon_session_id || result.was_anonymous) {
      return Response.json({
        ok: false,
        reason: "anonymous_result_quarantined",
      });
    }

    let input: any = null;
    if (result.input_id) {
      input = await base44.asServiceRole.entities.AnalyzerInput.get(result.input_id).catch(() => null);
    }
    if (!input) return Response.json({ ok: false, reason: "no_input" });

    const brandId = result.brand_id || input.brand_id || "";
    if (!brandId) return Response.json({ ok: false, reason: "no_brand_id" });

    const country = input.country || "unknown";
    const is_eu = EU_COUNTRIES.has(country);
    const tier = revenueTier(Number(input.monthly_revenue || 0));
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const engine_version = result.benchmark_version || "unknown";

    const source_anon_id = await sha256Hex(SALT + brandId);

    // ─── Contribution source classification ──────────────────────────────
    //
    // 'verified' when the AnalyzerResult was materialized from a connected
    // integration (Integration→Analyzer bridge, e.g. Stripe balance_transactions).
    // 'estimated' otherwise — anonymous submission, manual wizard, admin-created.
    //
    // This value is:
    //   1. Included in the contribution_hash → estimated + verified for the
    //      same brand-cohort-month coexist as separate rows.
    //   2. Persisted on each BenchmarkContribution row.
    //   3. Used to segment the outlier detector: a verified is compared only
    //      to other verified peers, an estimated only to other estimated peers.
    //      Otherwise a legitimately different verified rate (which is exactly
    //      what we want to learn from) would be flagged as an outlier against
    //      noisy estimated peers and auto-excluded from the cohort.
    //
    // Aggregation precedence — "verified beats estimated for the same brand-
    // cohort-month" — lives downstream in scheduledBenchmarkRecompute, NOT here.
    // This function is the producer; it does not mutate estimated rows when a
    // verified arrives. Both persist; the aggregator decides who counts.
    const contribution_source: "estimated" | "verified" =
      result.verification_status === "verified" ? "verified" : "estimated";

    // Build candidate metrics
    const candidates: Array<{ vertical: string; metric_key: string; metric_value: number }> = [];

    const payRate = Number(result?.details?.payment_current_rate || 0);
    if (payRate > 0) {
      candidates.push({ vertical: "payments", metric_key: "payment_effective_rate", metric_value: payRate });
    }

    const shipAvg = Number(result?.details?.shipping_current_avg || 0);
    if (shipAvg > 0) {
      candidates.push({ vertical: "shipping", metric_key: "shipping_avg_cost_per_unit", metric_value: shipAvg });
    }

    const saasSpend = Number(input.total_saas_spend || 0);
    const monthlyRev = Number(input.monthly_revenue || 0);
    if (saasSpend > 0 && monthlyRev > 0) {
      candidates.push({
        vertical: "saas",
        metric_key: "saas_monthly_spend_pct_revenue",
        metric_value: saasSpend / monthlyRev,
      });
    }

    const created: string[] = [];
    const skipped: string[] = [];
    const affectedCohorts = new Set<string>();

    for (const c of candidates) {
      const cohort_key = `${tier}|${country}|${c.vertical}`;
      // contribution_source is part of the hash so estimated and verified from
      // the same brand-cohort-month DO NOT collide and are BOTH persisted.
      // The aggregator (scheduledBenchmarkRecompute) enforces precedence.
      const contribution_hash = await sha256Hex(
        source_anon_id + cohort_key + c.metric_key + month + contribution_source
      );

      // Dedup — retries with the same (brand, cohort, metric, month, source)
      // are still idempotent. Only a switch from estimated → verified (or the
      // reverse, which shouldn't happen) creates a second row.
      const existing = await base44.asServiceRole.entities.BenchmarkContribution.filter(
        { contribution_hash },
        "-created_date",
        1
      );
      if (existing.length) {
        skipped.push(c.metric_key);
        continue;
      }

      // Outlier detection — segmented by contribution_source.
      // A verified is compared ONLY to other verified peers; an estimated
      // ONLY to other estimated peers. Without this segmentation, the first
      // real verified rate to hit a cohort (which is precisely the highest-
      // quality signal we want) would be flagged as an outlier against the
      // noisier estimated peers already there, and silently auto-excluded
      // by the `flagged: false` filter in scheduledBenchmarkRecompute —
      // reintroducing the same "verified gets buried" bug we just fixed at
      // the dedup layer, via a different pathway.
      const cohortPeers = await base44.asServiceRole.entities.BenchmarkContribution.filter(
        {
          cohort_key,
          metric_key: c.metric_key,
          validated: true,
          flagged: false,
          contribution_source,
        },
        "-created_date",
        500
      );
      const peerValues = (cohortPeers || []).map((p: any) => Number(p.metric_value)).filter((v: number) => isFinite(v));
      let flagged = false;
      let flag_reason = "";
      if (peerValues.length >= 5) {
        const z = modifiedZScore(c.metric_value, peerValues);
        if (Math.abs(z) > 3.5) {
          flagged = true;
          flag_reason = `outlier: modified z-score ${z.toFixed(2)}`;
        }
      }

      await base44.asServiceRole.entities.BenchmarkContribution.create({
        source_anon_id,
        cohort_key,
        vertical: c.vertical,
        metric_key: c.metric_key,
        metric_value: c.metric_value,
        revenue_tier: tier,
        country,
        is_eu,
        engine_version,
        contribution_hash,
        month,
        flagged,
        flag_reason,
        validated: true,
        contribution_source,
      });

      created.push(c.metric_key);
      affectedCohorts.add(`${cohort_key}::${c.metric_key}`);
    }

    // Trigger cohort recompute for affected cohorts (non-blocking)
    if (affectedCohorts.size > 0) {
      try {
        await base44.asServiceRole.functions.invoke("scheduledBenchmarkRecompute", {
          trigger: "new_contribution",
          cohort_filter: Array.from(affectedCohorts),
        });
      } catch (e) {
        console.warn("scheduledBenchmarkRecompute trigger failed (non-blocking):", (e as any)?.message || e);
      }
    }

    return Response.json({ ok: true, created, skipped, cohorts_touched: affectedCohorts.size });
  } catch (error) {
    return Response.json({ error: (error as any)?.message || String(error) }, { status: 500 });
  }
});