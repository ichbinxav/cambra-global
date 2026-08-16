import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  assertNoMerchantIdentifiers,
  outcomeCohortKey,
  PRIVACY_SAFE_INTELLIGENCE_VERSION,
  privacySafeBenchmarkAggregate,
  privacySafeOutcomeAggregate,
  readCompleteEntityPages,
} from "../../shared/privacySafeIntelligence.ts";
import {
  retentionEvidenceComplete,
  retentionEvidenceStart,
} from "../../shared/retentionPolicy.ts";
import { guardedScheduledServe } from "../../shared/schedulerRun.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import { validateStoredIntelligenceRecord } from "../../shared/intelligenceTenantScope.ts";

const SOURCE_PAGE_SIZE = 1000;
const SOURCE_MAX_PAGES = 1000;

function publishablePayload(payload: any, sourceCoverage: any, runAt: string) {
  const retained = {
    ...payload,
    aggregate_version: PRIVACY_SAFE_INTELLIGENCE_VERSION,
    aggregate_snapshot_version: `${PRIVACY_SAFE_INTELLIGENCE_VERSION}@${runAt}`,
    generated_at: runAt,
    source_coverage: sourceCoverage,
  };
  const privacy = assertNoMerchantIdentifiers(retained);
  if (!privacy.ok) {
    throw new Error(
      `privacy_safe_identifier_violation:${privacy.violations.join(",")}`,
    );
  }
  return retained;
}

async function appendAggregateSnapshot(
  service: any,
  seriesKey: string,
  payload: any,
  verifiedAt: string,
) {
  const snapshotVersion = String(payload.aggregate_snapshot_version || "");
  const aggregateKey = `${seriesKey}@${verifiedAt}`;
  const exact = await service.entities.AnonymizedIntelligenceAggregate.filter(
    { aggregate_key: aggregateKey },
    "-created_date",
    2,
  );
  if (exact.length > 1) {
    throw new Error("aggregate_snapshot_identity_ambiguous");
  }
  if (exact[0]) return "deduplicated";
  const previous = (await service.entities.AnonymizedIntelligenceAggregate
    .filter(
      { aggregate_series_key: seriesKey },
      "-last_verified_at",
      1,
    ))[0] || null;
  const row = {
    aggregate_key: aggregateKey,
    aggregate_series_key: seriesKey,
    aggregate_snapshot_version: snapshotVersion,
    supersedes_aggregate_id: previous?.id || null,
    aggregate_type: payload.kind,
    vertical: payload.vertical || "unknown",
    provider_bucket: payload.provider_bucket || "",
    country_bucket: payload.country || "",
    cohort_bucket: payload.revenue_tier ||
      (payload.currency ? `currency:${payload.currency}` : ""),
    currency_bucket: payload.currency || "",
    period: payload.period,
    sample_size: payload.sample_size,
    metrics_json: payload,
    source_coverage_json: payload.source_coverage,
    anonymization_method: "irreversible_aggregate_k10_coarsened",
    anonymization_version: PRIVACY_SAFE_INTELLIGENCE_VERSION,
    reidentification_mapping_retained: false,
    last_verified_at: verifiedAt,
  };
  const created = await service.entities.AnonymizedIntelligenceAggregate.create(
    row,
  );
  const committed = await service.entities.AnonymizedIntelligenceAggregate
    .filter(
      { aggregate_key: aggregateKey },
      "-created_date",
      2,
    );
  if (
    committed.length !== 1 ||
    String(committed[0]?.id || "") !== String(created?.id || "")
  ) throw new Error("aggregate_snapshot_postcommit_ambiguous");
  return "created";
}

function sourceCoverageForAggregate(read: any, eligibleRecords: number) {
  return {
    ...read.coverage,
    eligible_records: eligibleRecords,
    aggregate_input_complete: read.ok === true &&
      read.coverage?.coverage_complete === true,
  };
}

async function markCoverageReview(
  service: any,
  evidence: any,
  start: any,
  runAt: string,
  sources: any[],
) {
  const recordsRead = sources.reduce(
    (sum, source) => sum + Math.max(0, Number(source?.records_read) || 0),
    0,
  );
  const audit = {
    ...start.row,
    status: "COMPLETED_WITH_ERRORS",
    completed_at: new Date().toISOString(),
    candidate_count: Math.max(1, recordsRead),
    succeeded_count: 0,
    failed_count: 1,
    evidence_json: {
      ...start.row.evidence_json,
      review_required: true,
      blocker: "source_coverage_incomplete",
      aggregate_updates_attempted: 0,
      aggregate_snapshot_version:
        `${PRIVACY_SAFE_INTELLIGENCE_VERSION}@${runAt}`,
      source_coverage: sources,
      raw_identifiers_persisted: false,
    },
  };
  await service.entities.RetentionExecutionEvidence.update(evidence.id, audit);
  await service.entities.OperationalLog.create({
    event_type: "intelligence_event",
    message: "privacy_safe_intelligence_coverage_review_required",
    data_json: {
      review_required: true,
      blocker: "source_coverage_incomplete",
      aggregate_updates_attempted: 0,
      version: PRIVACY_SAFE_INTELLIGENCE_VERSION,
      source_coverage: sources,
      retention_evidence_id: evidence.id,
    },
    actor_email: "internal",
    created_at: new Date().toISOString(),
  }).catch((error: any) =>
    safeBestEffort(error, {
      operation: "privacySafeIntelligenceWorker",
      fallback: null,
      severity: "secondary",
    })
  );
  return Response.json({
    ok: false,
    error: "source_coverage_incomplete",
    review_required: true,
    aggregates_published: 0,
    source_coverage: sources,
    retention_evidence_id: evidence.id,
  }, { status: 409 });
}

guardedScheduledServe(
  { worker_key: "privacySafeIntelligenceWorker", cadence_seconds: 86400 },
  createClientFromRequest,
  async (req) => {
    let service: any = null;
    let evidence: any = null;
    let start: any = null;
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      const gate = await requireAdminOrInternal(req, base44, body);
      if (!gate.ok) return gate.response as Response;
      service = base44.asServiceRole;
      const runAt = new Date().toISOString();
      start = retentionEvidenceStart({
        run_key: `privacy-safe-intelligence:${runAt}:${crypto.randomUUID()}`,
        policy_key: "intelligence_outcomes_aggregate",
        action: "ANONYMIZE",
        scope:
          "BenchmarkCohort+IntelligenceOutcome -> AnonymizedIntelligenceAggregate",
      });
      if (!start.ok) {
        return Response.json({ ok: false, error: start.error }, {
          status: 503,
        });
      }
      evidence = await service.entities.RetentionExecutionEvidence.create(
        start.row,
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "privacySafeIntelligenceWorker",
          fallback: null,
          severity: "secondary",
        })
      );
      if (!evidence) {
        return Response.json({
          ok: false,
          error: "retention_audit_evidence_unavailable",
        }, { status: 503 });
      }

      const [cohortRead, outcomeRead] = await Promise.all([
        readCompleteEntityPages(service.entities.BenchmarkCohort, {
          source_entity: "BenchmarkCohort",
          snapshot_at: runAt,
          page_size: SOURCE_PAGE_SIZE,
          max_pages: SOURCE_MAX_PAGES,
        }),
        readCompleteEntityPages(service.entities.IntelligenceOutcome, {
          source_entity: "IntelligenceOutcome",
          snapshot_at: runAt,
          page_size: SOURCE_PAGE_SIZE,
          max_pages: SOURCE_MAX_PAGES,
        }),
      ]);
      const sourceCoverage = [cohortRead.coverage, outcomeRead.coverage];
      if (!cohortRead.ok || !outcomeRead.ok) {
        return await markCoverageReview(
          service,
          evidence,
          start,
          runAt,
          sourceCoverage,
        );
      }

      const cohorts = cohortRead.rows;
      const outcomes = outcomeRead.rows.filter((row: any) =>
        !row.is_demo && row.quarantined !== true &&
        validateStoredIntelligenceRecord(row, "outcome").ok
      );
      const cohortCoverage = sourceCoverageForAggregate(
        cohortRead,
        cohorts.length,
      );
      const outcomeCoverage = sourceCoverageForAggregate(
        outcomeRead,
        outcomes.length,
      );
      let created = 0;
      let deduplicated = 0;
      let suppressed = 0;

      for (const cohort of cohorts) {
        const aggregate = privacySafeBenchmarkAggregate(cohort);
        if (!aggregate) {
          suppressed++;
          continue;
        }
        const payload = publishablePayload(
          aggregate,
          cohortCoverage,
          runAt,
        );
        const key = [
          "benchmark",
          aggregate.vertical,
          aggregate.country,
          aggregate.revenue_tier,
          aggregate.metric_key,
          aggregate.period,
        ].join(":");
        (await appendAggregateSnapshot(service, key, payload, runAt)) ===
            "created"
          ? created++
          : deduplicated++;
      }

      const groups = new Map<string, any[]>();
      for (const outcome of outcomes) {
        const key = outcomeCohortKey(outcome);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(outcome);
      }
      for (const [key, rows] of groups) {
        const aggregate = privacySafeOutcomeAggregate(rows);
        if (!aggregate) {
          suppressed++;
          continue;
        }
        const payload = publishablePayload(
          aggregate,
          outcomeCoverage,
          runAt,
        );
        (await appendAggregateSnapshot(
            service,
            `outcome:${key}`,
            payload,
            runAt,
          )) === "created"
          ? created++
          : deduplicated++;
      }

      const complete = retentionEvidenceComplete(start, {
        candidate_count: created + deduplicated + suppressed,
        succeeded_count: created + deduplicated,
        failed_count: 0,
        suppressed_count: suppressed,
        batches_processed: cohortRead.coverage.pages_fetched +
          outcomeRead.coverage.pages_fetched,
      });
      complete.evidence_json = {
        ...complete.evidence_json,
        aggregate_snapshot_version:
          `${PRIVACY_SAFE_INTELLIGENCE_VERSION}@${runAt}`,
        source_coverage: sourceCoverage,
        raw_identifiers_persisted: false,
      };
      await service.entities.RetentionExecutionEvidence.update(
        evidence.id,
        complete,
      );
      await service.entities.OperationalLog.create({
        event_type: "intelligence_event",
        message: "privacy_safe_intelligence_refresh",
        data_json: {
          created,
          deduplicated,
          suppressed,
          version: PRIVACY_SAFE_INTELLIGENCE_VERSION,
          aggregate_snapshot_version:
            `${PRIVACY_SAFE_INTELLIGENCE_VERSION}@${runAt}`,
          source_coverage: sourceCoverage,
          retention_evidence_id: evidence.id,
        },
        actor_email: "internal",
        created_at: new Date().toISOString(),
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "privacySafeIntelligenceWorker",
          fallback: null,
          severity: "secondary",
        })
      );
      return Response.json({
        ok: true,
        created,
        deduplicated,
        suppressed,
        version: PRIVACY_SAFE_INTELLIGENCE_VERSION,
        aggregate_snapshot_version:
          `${PRIVACY_SAFE_INTELLIGENCE_VERSION}@${runAt}`,
        source_coverage: sourceCoverage,
        retention_evidence_id: evidence.id,
      });
    } catch (error) {
      console.error(error);
      if (service && evidence?.id) {
        await service.entities.RetentionExecutionEvidence.update(evidence.id, {
          status: "FAILED",
          completed_at: new Date().toISOString(),
          failed_count: 1,
          evidence_json: {
            raw_identifiers_persisted: false,
            error_code: "privacy_safe_intelligence_failed",
          },
        }).catch((updateError: any) =>
          safeBestEffort(updateError, {
            operation: "privacySafeIntelligenceWorker",
            fallback: null,
            severity: "secondary",
          })
        );
      }
      return internalErrorResponse(error, "privacySafeIntelligenceWorker");
    }
  },
);
