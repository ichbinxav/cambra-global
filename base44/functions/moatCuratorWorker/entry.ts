import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  informationValue,
  moatScore,
  P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS,
} from "../../shared/intelligenceCore.ts";
import { guardedScheduledServe } from "../../shared/schedulerRun.ts";
import {
  canonicalOutcomeCurrency,
  latestVerifiedOutcomeAggregateSnapshots,
  readCompleteEntityPages,
  UNKNOWN_OUTCOME_CURRENCY,
} from "../../shared/privacySafeIntelligence.ts";

const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;
const lower = (value: any) => String(value || "unknown").trim().toLowerCase();

async function upsert(
  service: any,
  entity: string,
  keyField: string,
  key: string,
  row: any,
) {
  const old = await service.entities[entity].filter(
    { [keyField]: key },
    "-created_date",
    2,
  );
  if (old.length > 1) throw new Error(`${entity}_identity_ambiguous`);
  if (old[0]) await service.entities[entity].update(old[0].id, row);
  else await service.entities[entity].create(row);
}

function newestOutcomeCohort(rows: any[], provider: string, currency: string) {
  return rows.filter((row) =>
    row.vertical === "payments" &&
    row.provider_bucket === lower(provider) &&
    row.currency === currency
  ).sort((a, b) =>
    b.last_verified_at_ms - a.last_verified_at_ms ||
    String(b.aggregate_ref).localeCompare(String(a.aggregate_ref))
  )[0] || null;
}

async function coverageFailure(service: any, coverage: any) {
  await service.entities.OperationalLog.create({
    event_type: "intelligence_event",
    message: "moat_curator_privacy_safe_source_coverage_incomplete",
    data_json: {
      review_required: true,
      blocker: "privacy_safe_outcome_coverage_incomplete",
      metrics_published: 0,
      source_coverage: coverage,
    },
    actor_email: "internal",
    created_at: new Date().toISOString(),
  }).catch((error: any) =>
    safeBestEffort(error, {
      operation: "moatCuratorWorker.coverageEvidence",
      fallback: null,
      severity: "secondary",
    })
  );
  return Response.json({
    ok: false,
    error: "privacy_safe_outcome_coverage_incomplete",
    review_required: true,
    metrics_published: 0,
    source_coverage: coverage,
  }, { status: 409 });
}

guardedScheduledServe(
  { worker_key: "moatCuratorWorker", cadence_seconds: 86400 },
  createClientFromRequest,
  async (req) => {
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      const gate = await requireAdminOrInternal(req, base44, body);
      if (!gate.ok) return gate.response as Response;
      const service = base44.asServiceRole;
      const runAt = new Date().toISOString();

      // This is the sole financial-outcome input to the moat. The worker never
      // reads tenant-private IntelligenceOutcome rows. An incomplete/capped
      // aggregate scan blocks every write, rather than silently understating or
      // selecting a convenient cohort.
      const outcomeRead = await readCompleteEntityPages(
        service.entities.AnonymizedIntelligenceAggregate,
        {
          source_entity: "AnonymizedIntelligenceAggregate",
          snapshot_at: runAt,
          page_size: PAGE_SIZE,
          max_pages: MAX_PAGES,
        },
      );
      if (!outcomeRead.ok) {
        return await coverageFailure(service, outcomeRead.coverage);
      }
      const outcomeAggregates = latestVerifiedOutcomeAggregateSnapshots(
        outcomeRead.rows,
        runAt,
      );

      const [
        pricing,
        conflicts,
        routingPerformance,
        aggregatePools,
        aggregateBids,
        privateRates,
      ] = await Promise.all([
        service.entities.ProviderPricingVersion.list("-observed_at", 3000),
        service.entities.KnowledgeConflict.filter(
          { status: { $in: ["open", "investigating"] } },
          "-created_at",
          1000,
        ),
        service.entities.RoutingProviderPerformance.list(
          "-calculated_at",
          3000,
        ),
        service.entities.AggregatePool.list("-updated_at", 2000),
        service.entities.AggregateBid.list("-created_at", 3000),
        service.entities.PrivateRateCard.list("-effective_at", 2000),
      ]);
      const pricingRows = pricing.filter((row: any) => !row.is_demo);
      const routingRows = routingPerformance.filter((row: any) => !row.is_demo);
      let metrics = 0;
      let gaps = 0;

      const pricingGroups = new Map<string, any[]>();
      for (const row of pricingRows) {
        const currency = canonicalOutcomeCurrency(row.currency);
        const key = [
          "payments",
          row.country || row.region || "GLOBAL",
          row.provider_slug,
          currency,
        ].join("|");
        pricingGroups.set(key, [...(pricingGroups.get(key) || []), row]);
      }
      for (const [key, rows] of pricingGroups) {
        const [vertical, country, provider, currency] = key.split("|");
        const fresh = rows.filter((row: any) =>
          Date.now() - Date.parse(row.observed_at || "") < 90 * 86400000
        ).length / Math.max(1, rows.length);
        const verified = rows.filter((row: any) =>
          row.truth_level === "verified_official"
        ).length;
        const openConflicts = conflicts.filter((row: any) =>
          row.provider_slug === provider
        ).length;
        const coverage = Math.min(
          1,
          new Set(
            rows.map((row: any) => `${row.channel}|${row.pricing_dimension}`),
          ).size / 4,
        );
        const sourceQuality = verified / Math.max(1, rows.length);
        const contradictionRate = openConflicts / Math.max(1, rows.length);
        const outcome = currency === UNKNOWN_OUTCOME_CURRENCY
          ? null
          : newestOutcomeCohort(outcomeAggregates, provider, currency);
        const verifiedSavingsOutcomes = outcome?.sample_size || 0;
        const confidence = Math.min(1, (sourceQuality + fresh + coverage) / 3);
        const score = moatScore({
          sample_size: rows.length,
          coverage,
          freshness: fresh,
          source_quality: sourceQuality,
          verified_savings_outcomes: verifiedSavingsOutcomes,
          contradiction_rate: contradictionRate,
          top_concentration_share: rows.length ? 1 : 0,
        });
        const metricKey = key;
        await upsert(service, "MoatMetric", "metric_key", metricKey, {
          metric_key: metricKey,
          vertical,
          country,
          provider_slug: provider,
          cohort_key: `native_currency:${currency}`,
          sample_size: rows.length,
          verified_observations: verified,
          negotiation_outcomes: 0,
          migration_outcomes: 0,
          verified_savings_outcomes: verifiedSavingsOutcomes,
          coverage,
          freshness: fresh,
          source_quality: sourceQuality,
          confidence,
          contradiction_rate: contradictionRate,
          concentration_penalty: .35,
          moat_score: score,
          methodology_version: "moat-p13-privacy-safe-outcomes-2.0.0",
          calculated_at: runAt,
        });
        metrics++;
        const uncertainty = 1 - confidence;
        const strategic = Math.min(
          1,
          .55 + .05 * Math.min(9, verifiedSavingsOutcomes),
        );
        const reuse = Math.min(1, .6 + .1 * coverage);
        const gapKey = `gap:${metricKey}`;
        await upsert(service, "KnowledgeGap", "gap_key", gapKey, {
          gap_key: gapKey,
          vertical,
          country,
          provider_slug: provider,
          cohort_key: metricKey,
          strategic_value: strategic,
          intelligence_depth: score / 100,
          uncertainty,
          expected_reuse: reuse,
          information_value: informationValue(strategic, uncertainty, reuse),
          recommended_action: verified === 0
            ? "verify official provider pricing"
            : fresh < .5
            ? "refresh stale provider evidence"
            : openConflicts
            ? "resolve pricing conflicts"
            : !outcome
            ? "await a complete privacy-safe k>=10 outcome cohort in the same native currency"
            : "collect naturally occurring verified outcomes",
          status: score < 70 ? "open" : "resolved",
          reason:
            `pricing score=${score}; currency=${currency}; verified=${verified}; fresh=${
              fresh.toFixed(2)
            }; conflicts=${openConflicts}; privacy_safe_distinct_merchants=${verifiedSavingsOutcomes}`,
          updated_at: runAt,
        });
        gaps++;
      }

      const routingGroups = new Map<string, any[]>();
      for (const row of routingRows) {
        const key = [
          "routing",
          row.country || "GLOBAL",
          row.provider_slug,
          row.network || "ANY",
        ].join("|");
        routingGroups.set(key, [...(routingGroups.get(key) || []), row]);
      }
      for (const [key, rows] of routingGroups) {
        const [, country, provider, network] = key.split("|");
        const sample = rows.reduce(
          (sum: number, row: any) => sum + Number(row.sample_size || 0),
          0,
        );
        const maxSample = Math.max(
          0,
          ...rows.map((row: any) => Number(row.sample_size || 0)),
        );
        const topShare = sample ? maxSample / sample : 1;
        const freshness = rows.reduce(
          (sum: number, row: any) => sum + Number(row.freshness || 0),
          0,
        ) / Math.max(1, rows.length);
        const quality = rows.reduce(
          (sum: number, row: any) => sum + Number(row.confidence || 0),
          0,
        ) / Math.max(1, rows.length);
        const coverage = Math.min(
          1,
          new Set(rows.map((row: any) =>
            [
              row.issuer_country,
              row.payment_method,
              row.amount_bucket,
              row.three_ds_status,
              row.recurring_type,
            ].filter(Boolean).join("|")
          )).size / 8,
        );
        const score = moatScore({
          sample_size: sample,
          coverage,
          freshness,
          source_quality: quality,
          verified_savings_outcomes: 0,
          contradiction_rate: 0,
          top_concentration_share: topShare,
        });
        const confidence = Math.min(1, (freshness + quality + coverage) / 3);
        await upsert(service, "MoatMetric", "metric_key", key, {
          metric_key: key,
          vertical: "payments",
          country,
          provider_slug: provider,
          cohort_key: `routing:${network}`,
          sample_size: sample,
          verified_observations: sample,
          negotiation_outcomes: 0,
          migration_outcomes: 0,
          verified_savings_outcomes: 0,
          coverage,
          freshness,
          source_quality: quality,
          confidence,
          contradiction_rate: 0,
          concentration_penalty: Math.max(.35, 1 - .65 * topShare * topShare),
          moat_score: score,
          methodology_version: "moat-p13-routing-1.0.0",
          calculated_at: runAt,
        });
        metrics++;
        const uncertainty = 1 - confidence;
        const gapKey = `gap:${key}`;
        await upsert(service, "KnowledgeGap", "gap_key", gapKey, {
          gap_key: gapKey,
          vertical: "payments",
          country,
          provider_slug: provider,
          cohort_key: `routing:${network}`,
          strategic_value: .8,
          intelligence_depth: score / 100,
          uncertainty,
          expected_reuse: .85,
          information_value: informationValue(.8, uncertainty, .85),
          recommended_action: sample < 50
            ? "collect naturally occurring observed outcomes"
            : freshness < .5
            ? "refresh routing observations"
            : coverage < .5
            ? "increase representative cohort coverage"
            : "maintain routing evidence",
          status: score < 70 ? "open" : "resolved",
          reason: `routing score=${score}; sample=${sample}; freshness=${
            freshness.toFixed(2)
          }; concentration=${topShare.toFixed(2)}`,
          updated_at: runAt,
        });
        gaps++;
      }

      // AggregatePool is already coarsened operational data. Only a single
      // pool that itself proves k>=10 is eligible; counts are never summed as
      // distinct merchants across overlapping pools.
      const poolGroups = new Map<string, any[]>();
      for (const pool of aggregatePools) {
        if (
          Number(pool.merchant_count || 0) <
            P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS
        ) continue;
        const currency = canonicalOutcomeCurrency(pool.currency);
        const key = [
          "aggregate",
          pool.vertical || "payments",
          pool.country || "GLOBAL",
          currency,
        ].join("|");
        poolGroups.set(key, [...(poolGroups.get(key) || []), pool]);
      }
      for (const [key, pools] of poolGroups) {
        const [, vertical, country, currency] = key.split("|");
        const anchor = [...pools].sort((a, b) =>
          Number(b.merchant_count || 0) - Number(a.merchant_count || 0)
        )[0];
        const merchantCount = Number(anchor.merchant_count || 0);
        const addressable = Number(anchor.addressable_annual_volume_minor || 0);
        const committed = Number(anchor.committed_annual_volume_minor || 0);
        const fresh = Date.now() - Date.parse(anchor.updated_at || "") <
            14 * 86400000
          ? 1
          : 0;
        const bidCount = aggregateBids.filter((bid: any) =>
          bid.pool_id === anchor.id
        ).length;
        const rateCount = privateRates.filter((rate: any) =>
          rate.segment_json?.pool_id === anchor.id ||
          rate.segment_json?.pool_key === anchor.pool_key
        ).length;
        const coverage = Math.min(
          1,
          (merchantCount / 20 + bidCount / 5 + rateCount / 3) / 3,
        );
        const confidence = Math.min(
          1,
          (fresh + Math.min(1, merchantCount / 20) +
            Math.min(1, bidCount / 5)) / 3,
        );
        const score = moatScore({
          sample_size: merchantCount,
          coverage,
          freshness: fresh,
          source_quality: confidence,
          verified_savings_outcomes: rateCount,
          contradiction_rate: 0,
          top_concentration_share: 1,
        });
        await upsert(service, "MoatMetric", "metric_key", key, {
          metric_key: key,
          vertical,
          country,
          cohort_key: `aggregate_demand:native_currency:${currency}`,
          sample_size: merchantCount,
          verified_observations: merchantCount,
          negotiation_outcomes: bidCount,
          migration_outcomes: 0,
          verified_savings_outcomes: 0,
          coverage,
          freshness: fresh,
          source_quality: confidence,
          confidence,
          contradiction_rate: 0,
          concentration_penalty: .35,
          moat_score: score,
          methodology_version: "moat-p14-aggregate-1.0.0+privacy-safe-k10-v2",
          calculated_at: runAt,
        });
        metrics++;
        const uncertainty = 1 - confidence;
        const gapKey = `gap:${key}`;
        await upsert(service, "KnowledgeGap", "gap_key", gapKey, {
          gap_key: gapKey,
          vertical,
          country,
          cohort_key: `aggregate_demand:native_currency:${currency}`,
          strategic_value: .9,
          intelligence_depth: score / 100,
          uncertainty,
          expected_reuse: .95,
          information_value: informationValue(.9, uncertainty, .95),
          recommended_action: bidCount < 2
            ? "obtain competitive provider bids"
            : rateCount < 1
            ? "convert negotiated evidence into active private rate"
            : "maintain pool freshness and outcomes",
          status: score < 70 ? "open" : "resolved",
          reason:
            `aggregate score=${score}; distinct_merchants_at_least=${merchantCount}; currency=${currency}; addressable=${addressable}; committed=${committed}; bids=${bidCount}; private_rates=${rateCount}`,
          updated_at: runAt,
        });
        gaps++;
      }

      return Response.json({
        ok: true,
        metrics,
        gaps,
        pricing_groups: pricingGroups.size,
        routing_groups: routingGroups.size,
        aggregate_groups: poolGroups.size,
        privacy_safe_outcome_cohorts: outcomeAggregates.length,
        source_coverage: outcomeRead.coverage,
        note:
          "Financial outcomes come only from complete privacy-safe k>=10 distinct-merchant native-currency aggregates. No tenant-private outcome row is read or emitted.",
      });
    } catch (error) {
      console.error(error);
      return Response.json({ ok: false, error: "moat_curator_failed" }, {
        status: 500,
      });
    }
  },
);
