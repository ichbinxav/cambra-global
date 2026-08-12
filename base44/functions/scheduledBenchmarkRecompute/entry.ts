import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { deriveBenchmarkCohort, groupBenchmarkContributions } from "../../shared/p4BenchmarkIntelligence.ts";
import { sha256 } from "../../shared/p3RateIntelligence.ts";
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

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

guardedScheduledServe({"worker_key":"scheduledBenchmarkRecompute","cadence_seconds":604800},createClientFromRequest,async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // SECURITY-2 (2026-07-24) — canonical gate. The platform scheduler
    // authenticates as the app-owner admin (verified 2026-07-24), so the
    // weekly cron passes; anonymous callers no longer do.
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const user = gate.user;
    const trigger = body?.trigger || (req.headers.get("base44-scheduled-task") === "true" ? "scheduled" : "manual");

    // Load all validated, non-flagged contributions
    const contributions = await base44.asServiceRole.entities.BenchmarkContribution.filter(
      { validated: true, flagged: false },
      "-created_date",
      5000
    );

    // ─── Per-brand precedence pre-filter (Chunk 3, Option A) ──────────────
    //
    // Rule: for a given (brand, cohort, metric, month), if ANY row exists with
    // contribution_source === "verified", ONLY the verified rows of that brand
    // count for that cohort-month. The estimated rows of the SAME brand for
    // that key are dropped from aggregation. Other brands in the cohort are
    // NOT affected — they keep whatever contribution_source they have.
    //
    // Why this lives in the aggregator (not the producer):
    //   - Both estimated and verified rows remain persisted in the DB, so the
    //     history is fully auditable. An admin can inspect "this brand
    //     started estimated at 2.8%, later verified at 1.65% via Stripe" as
    //     two rows with different created_date and contribution_source.
    //   - The producer (benchmarkLearningEngine) does not mutate existing
    //     rows when a new one lands. No cross-row side effects, no backfills.
    //   - Retrocompat: rows created before contribution_source existed carry
    //     the default "estimated" (schema default). If any such brand later
    //     produces a verified row, this filter drops the legacy estimated —
    //     no data migration needed.
    //
    // Complexity: O(n) pre-pass over the contributions array. 5000 rows fit
    // comfortably in memory. If future scale needs it, this can be pushed
    // into the DB filter later.
    const perBrandKeyMap = new Map<string, { hasVerified: boolean; rows: any[] }>();
    for (const c of contributions || []) {
      const brandKey = `${c.source_anon_id}::${c.cohort_key}::${c.metric_key}::${c.month}`;
      let entry = perBrandKeyMap.get(brandKey);
      if (!entry) {
        entry = { hasVerified: false, rows: [] };
        perBrandKeyMap.set(brandKey, entry);
      }
      entry.rows.push(c);
      // Missing contribution_source (legacy rows) treated as "estimated".
      if (c.contribution_source === "verified") entry.hasVerified = true;
    }
    const filteredContributions: any[] = [];
    for (const entry of perBrandKeyMap.values()) {
      if (entry.hasVerified) {
        // Keep only verified rows of this brand for this key; drop estimated.
        for (const r of entry.rows) {
          if (r.contribution_source === "verified") filteredContributions.push(r);
        }
      } else {
        // No verified for this brand-key — keep everything as before.
        for (const r of entry.rows) filteredContributions.push(r);
      }
    }

    const groups = groupBenchmarkContributions(filteredContributions);

    let cohorts_updated = 0;

    for (const [groupKey, items] of groups.entries()) {
      const derived = deriveBenchmarkCohort(items);

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
        n: derived.sampleSize,
        median: derived.median,
        p25: derived.p25,
        p75: derived.p75,
        avg: derived.average,
        best_in_class: derived.p10,
        engine_version: sample.engine_version || "",
        is_public: derived.isPublic,
        benchmark_version: derived.derivationVersion,
        derivation_version: derived.derivationVersion,
        minimum_cohort_size: derived.minimumDistinctMerchants,
        raw_distinct_merchants: derived.rawDistinctMerchants,
        excluded_outlier_count: derived.excludedOutliers,
        outlier_policy: derived.outlierPolicy,
        confidence: derived.confidence,
        derivation_status: derived.status,
        insufficient_data_reason: derived.insufficientDataReason,
        source_count_json: derived.sourceCounts,
        lineage_hash: await sha256(items.map((item: any) => item.contribution_hash || '').filter(Boolean).sort()),
        derived_at: new Date().toISOString(),
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
    return internalErrorResponse(error, 'scheduledBenchmarkRecompute');
  }
});
