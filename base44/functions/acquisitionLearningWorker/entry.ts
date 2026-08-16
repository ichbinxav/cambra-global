import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { safeBestEffort } from "../../shared/bestEffort.ts";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  ACQUISITION_ADVISORY_LABEL_CONTRACT,
  acquisitionAdvisoryEligible,
  evaluateAcquisitionLearningEligibility,
  VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT,
  verifiedSavingsAttributionEligibility,
} from "../../shared/adaptiveLeadLearning.ts";
import {
  boundedLearningMultiplier,
  cohortKey,
  type Outcome,
  outcomeValue,
} from "../../shared/acquisitionLearning.ts";
import { guardedScheduledServe } from "../../shared/schedulerRun.ts";

function newestThreadByLead(threads: any[]) {
  const result = new Map<string, any>();
  for (const thread of threads) {
    const leadId = String(thread?.lead_id || "");
    if (!leadId) continue;
    const current = result.get(leadId);
    const candidateAt = Date.parse(
      thread?.last_outbound_at || thread?.last_message_at ||
        thread?.created_date || "",
    );
    const currentAt = Date.parse(
      current?.last_outbound_at || current?.last_message_at ||
        current?.created_date || "",
    );
    if (
      !current ||
      (Number.isFinite(candidateAt) &&
        (!Number.isFinite(currentAt) || candidateAt > currentAt))
    ) {
      result.set(leadId, thread);
    }
  }
  return result;
}

guardedScheduledServe(
  { worker_key: "acquisitionLearningWorker", cadence_seconds: 86_400 },
  createClientFromRequest,
  async (req) => {
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      const gate = await requireAdminOrInternal(req, base44, body);
      if (!gate.ok) {
        return gate.response ||
          Response.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
      const service = base44.asServiceRole;
      const [leads, threads, attributions, reports] = await Promise.all([
        service.entities.OutboundLead.filter({}, "-created_date", 5000).catch((
          error: any,
        ) =>
          safeBestEffort(error, {
            operation: "acquisitionLearningWorker",
            fallback: [],
            severity: "secondary",
          })
        ),
        service.entities.CommunicationThread.filter(
          { engine: "merchant_acquisition" },
          "-created_date",
          5000,
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "acquisitionLearningWorker",
            fallback: [],
            severity: "secondary",
          })
        ),
        service.entities.AcquisitionAttribution.filter(
          {},
          "-attributed_at",
          5000,
        ).catch(
          (error: any) =>
            safeBestEffort(error, {
              operation: "acquisitionLearningWorker",
              fallback: [],
              severity: "secondary",
            }),
        ),
        service.entities.MonthlySavingsReport.filter(
          { measurement_mode: "fully_verified" },
          "-month",
          5000,
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "acquisitionLearningWorker",
            fallback: [],
            severity: "secondary",
          })
        ),
      ]);

      const byLead = newestThreadByLead(threads);
      const attributionRowsByLead = new Map<string, any[]>();
      for (const attribution of attributions) {
        const leadId = String(attribution?.lead_id || "");
        if (!leadId) continue;
        attributionRowsByLead.set(leadId, [
          ...(attributionRowsByLead.get(leadId) || []),
          attribution,
        ]);
      }
      const reportById = new Map<
        string,
        {
          amount: number;
          observed_at: string | null;
          report_id: string;
          deal_activation_id: string | null;
          brand_id: string | null;
        }
      >();
      const reportCandidatesByBrand = new Map<string, any[]>();
      for (const report of reports) {
        if (
          !["verified", "realized", "invoiced", "paid"].includes(
            String(report.verification_status || ""),
          )
        ) {
          continue;
        }
        const rawAmount = report.billable_savings_amount ?? report.savings;
        if (rawAmount === null || rawAmount === undefined || rawAmount === "") {
          continue;
        }
        const amount = Number(rawAmount);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        // Never use mutable updated/approval timestamps here: doing so could
        // relabel a pre-existing verified outcome as post-exposure.
        const observedAt = String(report.verified_at || "") || null;
        if (!report?.id || !observedAt) continue;
        const reportEvidence = {
          amount,
          observed_at: observedAt,
          report_id: String(report.id),
          deal_activation_id: report.deal_activation_id
            ? String(report.deal_activation_id)
            : null,
          brand_id: report.brand_id ? String(report.brand_id) : null,
        };
        reportById.set(String(report.id), reportEvidence);
        if (reportEvidence.brand_id && reportEvidence.deal_activation_id) {
          reportCandidatesByBrand.set(reportEvidence.brand_id, [
            ...(reportCandidatesByBrand.get(reportEvidence.brand_id) || []),
            reportEvidence,
          ]);
        }
      }

      const aggregates = new Map<string, any>();
      const statusCounts: Record<string, number> = {};
      const eligibilityPatches: any[] = [];
      for (const lead of leads) {
        if (!lead?.score_breakdown_json?.scoring_version) continue;
        const thread = byLead.get(String(lead.id)) || null;
        const attributionRows = attributionRowsByLead.get(String(lead.id)) ||
          [];
        const threadAttributionRows = thread
          ? attributionRows.filter((row: any) =>
            String(row?.thread_id || "") === String(thread.id || "")
          )
          : [];
        // Never let array/map ordering silently pick lineage. A single exact
        // lead/thread row can preserve commercial progression even when its
        // economic state is AMBIGUOUS or UNATTRIBUTED.
        const attribution: any = threadAttributionRows.length === 1
          ? threadAttributionRows[0]
          : null;
        // Economic learning is report-specific. A Brand-level sum must never
        // leak onto every lead attributed to that merchant.
        const reportCandidateKey = String(attribution?.brand_id || "");
        const temporalFloors = [
          thread?.last_outbound_at,
          attribution?.onboarding_observed_at,
          attribution?.deal_activated_at,
        ].map((value) => Date.parse(String(value || "")));
        const exactTemporalReportCandidates = reportCandidateKey &&
            temporalFloors.every(Number.isFinite)
          ? (reportCandidatesByBrand.get(reportCandidateKey) || []).filter(
            (report: any) => {
              const observedAt = Date.parse(String(report.observed_at || ""));
              return Number.isFinite(observedAt) &&
                temporalFloors.every((floor) => observedAt >= floor);
            },
          )
          : [];
        const referencedReport = attribution?.monthly_savings_report_id
          ? reportById.get(String(attribution.monthly_savings_report_id)) ||
            null
          : null;
        const verifiedSavings = attribution?.attribution_state === "EXACT" &&
            attribution?.economic_attribution_eligible === true &&
            attribution?.attribution_method ===
              VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT.method &&
            attribution?.attribution_method_version ===
              VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT.version &&
            exactTemporalReportCandidates.length === 1 && referencedReport &&
            exactTemporalReportCandidates[0].report_id ===
              referencedReport.report_id
          ? referencedReport
          : null;
        const eligibility = evaluateAcquisitionLearningEligibility({
          lead,
          thread,
          attribution,
          verified_savings: verifiedSavings,
        });
        const verifiedSavingsLineage = verifiedSavingsAttributionEligibility(
          lead,
          thread,
          attribution,
          verifiedSavings,
        );
        statusCounts[eligibility.status] =
          (statusCounts[eligibility.status] || 0) + 1;
        eligibilityPatches.push({
          id: lead.id,
          learning_eligibility_json: {
            ...eligibility,
            verified_savings_attribution: {
              ...verifiedSavingsLineage,
              contract_version: VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT.version,
              causal_claim: false,
              training_eligible: false,
            },
            evaluated_at: new Date().toISOString(),
          },
        });

        if (!acquisitionAdvisoryEligible(eligibility)) continue;
        const key = cohortKey(lead);
        const aggregate = aggregates.get(key) || {
          cohort_key: key,
          sample_size: 0,
          eligible_sample_size: 0,
          exposure_count: 0,
          negative_count: 0,
          reply_count: 0,
          positive_reply_count: 0,
          meeting_count: 0,
          won_count: 0,
          verified_savings_count: 0,
          verified_savings_total: 0,
          outcome_value_total: 0,
          label_contract_version:
            ACQUISITION_ADVISORY_LABEL_CONTRACT.label_version,
          methodology_class:
            ACQUISITION_ADVISORY_LABEL_CONTRACT.methodology_class,
          probabilistic_calibration: false,
          training_eligible: false,
          selected_population_note:
            "Confirmed outbound exposure only; pending/unknown rows excluded",
        };
        aggregate.sample_size++;
        aggregate.eligible_sample_size++;
        if (eligibility.actual_exposure) aggregate.exposure_count++;
        if (eligibility.negative) aggregate.negative_count++;
        for (const outcome of eligibility.outcomes as Outcome[]) {
          if (outcome === "reply") aggregate.reply_count++;
          if (outcome === "positive_reply") aggregate.positive_reply_count++;
          if (outcome === "meeting") aggregate.meeting_count++;
          if (outcome === "won") aggregate.won_count++;
          if (outcome === "verified_savings") {
            aggregate.verified_savings_count++;
            aggregate.verified_savings_total += Number(
              verifiedSavings?.amount || 0,
            );
          }
          aggregate.outcome_value_total += outcomeValue(
            outcome,
            outcome === "verified_savings"
              ? Number(verifiedSavings?.amount || 0)
              : 0,
          );
        }
        aggregates.set(key, aggregate);
      }

      let eligibilityWrites = 0;
      for (let start = 0; start < eligibilityPatches.length; start += 200) {
        const chunk = eligibilityPatches.slice(start, start + 200);
        try {
          await service.entities.OutboundLead.bulkUpdate(chunk);
          eligibilityWrites += chunk.length;
        } catch (error) {
          safeBestEffort(error, {
            operation: "acquisitionLearningWorker",
            fallback: null,
            severity: "secondary",
          });
          for (const patch of chunk) {
            const { id, ...value } = patch;
            await service.entities.OutboundLead.update(id, value).then(() => {
              eligibilityWrites++;
            }).catch((fallbackError: any) =>
              safeBestEffort(fallbackError, {
                operation: "acquisitionLearningWorker",
                fallback: null,
                severity: "secondary",
              })
            );
          }
        }
      }

      let updated = 0;
      for (const aggregate of aggregates.values()) {
        // sample_size is never zero here; no UNKNOWN row becomes a fabricated
        // zero-valued outcome or denominator.
        aggregate.mean_outcome_value = aggregate.outcome_value_total /
          aggregate.eligible_sample_size;
        aggregate.learning_multiplier = boundedLearningMultiplier(aggregate);
        aggregate.updated_at = new Date().toISOString();
        const existing = await service.entities.AcquisitionLearningCohort
          .filter(
            { cohort_key: aggregate.cohort_key },
            "-created_date",
            1,
          ).catch((error: any) =>
            safeBestEffort(error, {
              operation: "acquisitionLearningWorker",
              fallback: [],
              severity: "secondary",
            })
          );
        if (existing[0]) {
          await service.entities.AcquisitionLearningCohort.update(
            existing[0].id,
            aggregate,
          );
        } else {
          await service.entities.AcquisitionLearningCohort.create(aggregate);
        }
        updated++;
      }

      return Response.json({
        ok: true,
        cohorts: updated,
        leads: leads.length,
        eligibility_writes: eligibilityWrites,
        eligibility_status_counts: statusCounts,
        label_contract: ACQUISITION_ADVISORY_LABEL_CONTRACT,
        note:
          "Bounded descriptive advisory only (±15% ordering among already eligible leads). UNKNOWN/pending is excluded, negatives require confirmed exposure plus a mature horizon, and Verified Savings requires deterministic AcquisitionAttribution. This is not trained, calibrated, causal, billing, policy, or authorization evidence.",
        verified_savings_attribution_contract:
          VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT,
      });
    } catch (error) {
      console.error("acquisitionLearningWorker failed", error);
      return Response.json(
        { ok: false, error: "acquisition_learning_failed" },
        { status: 500 },
      );
    }
  },
);
