import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M2 — Cohort recomputation.
 *
 * Recomputes BenchmarkCohort aggregates from validated, non-flagged BenchmarkContribution records.
 * Admin or scheduler only.
 *
 * Triggered:
 *   - manually by admin
 *   - on a schedule (automation)
 *   - inline by benchmarkLearningEngine after a new contribution
 */

function quantile(sortedArr, q) {
  const n = sortedArr.length;
  if (!n) return null;
  const pos = (n - 1) * q;
  const b = Math.floor(pos);
  const r = pos - b;
  return sortedArr[b + 1] !== undefined ? sortedArr[b] + r * (sortedArr[b + 1] - sortedArr[b]) : sortedArr[b];
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") {
      return Response.json({ error: "Forbidden: admin or scheduler only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const trigger = body?.trigger || (user ? "manual" : "scheduled");

    // Load all validated, non-flagged contributions
    const contributions = await base44.asServiceRole.entities.BenchmarkContribution.filter(
      { validated: true, flagged: false },
      "-created_date",
      5000
    );

    // Group by cohort_key + metric_key + month
    const groups = new Map();
    for (const c of contributions || []) {
      const key = `${c.cohort_key}::${c.metric_key}::${c.month}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }

    let cohorts_updated = 0;

    for (const [groupKey, items] of groups.entries()) {
      const values = items.map((i) => Number(i.metric_value)).filter((v) => isFinite(v)).sort((a, b) => a - b);
      const n = values.length;
      if (n < 1) continue;

      const sample = items[0];
      const cohort_key = sample.cohort_key;
      const metric_key = sample.metric_key;
      const month = sample.month;

      const payload = {
        cohort_key,
        vertical: sample.vertical,
        metric_key,
        revenue_tier: sample.revenue_tier,
        country: sample.country,
        is_eu: !!sample.is_eu,
        month,
        n,
        median: quantile(values, 0.5),
        p25: quantile(values, 0.25),
        p75: quantile(values, 0.75),
        avg: avg(values),
        best_in_class: quantile(values, 0.1),
        engine_version: sample.engine_version || "",
        is_public: n >= 5,
        benchmark_version: sample.engine_version || "",
      };

      const existing = await base44.asServiceRole.entities.BenchmarkCohort.filter(
        { cohort_key, metric_key, month },
        "-created_date",
        1
      );
      if (existing.length) {
        await base44.asServiceRole.entities.BenchmarkCohort.update(existing[0].id, payload);
      } else {
        await base44.asServiceRole.entities.BenchmarkCohort.create(payload);
      }
      cohorts_updated++;
    }

    // Log the run
    await base44.asServiceRole.entities.BenchmarkUpdateLog.create({
      trigger,
      cohorts_updated,
      contributions_processed: contributions?.length || 0,
      engine_version: contributions?.[0]?.engine_version || "",
      notes: `Recompute over ${groups.size} cohort/metric/month groups`,
      created_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      cohorts_updated,
      contributions_processed: contributions?.length || 0,
    });
  } catch (error) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
});