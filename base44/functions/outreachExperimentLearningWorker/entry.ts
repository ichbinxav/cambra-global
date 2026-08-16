import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { safeBestEffort } from "../../shared/bestEffort.ts";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  evaluateOutreachExperimentEligibility,
  OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT,
  outreachExperimentAdvisoryEligible,
} from "../../shared/adaptiveLeadLearning.ts";
import { guardedScheduledServe } from "../../shared/schedulerRun.ts";

guardedScheduledServe(
  { worker_key: "outreachExperimentLearningWorker", cadence_seconds: 86_400 },
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
      const [threads, merchantLeads, partnerProspects] = await Promise.all([
        service.entities.CommunicationThread.filter(
          { engine: { $in: ["merchant_acquisition", "partner_acquisition"] } },
          "-created_date",
          5000,
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "outreachExperimentLearningWorker",
            fallback: [],
            severity: "secondary",
          })
        ),
        service.entities.OutboundLead.list("-created_date", 5000).catch((
          error: any,
        ) =>
          safeBestEffort(error, {
            operation: "outreachExperimentLearningWorker",
            fallback: [],
            severity: "secondary",
          })
        ),
        service.entities.PartnerProspect.list("-created_date", 5000).catch((
          error: any,
        ) =>
          safeBestEffort(error, {
            operation: "outreachExperimentLearningWorker",
            fallback: [],
            severity: "secondary",
          })
        ),
      ]);
      const merchants = new Map(
        merchantLeads.map((row: any) => [String(row.id), row]),
      );
      const partners = new Map(
        partnerProspects.map((row: any) => [String(row.id), row]),
      );
      const aggregates = new Map<string, any>();
      const statusCounts: Record<string, number> = {};

      for (const thread of threads) {
        const variant = String(thread.experiment_variant || "");
        if (!variant) continue;
        const subject = thread.related_entity_type === "OutboundLead"
          ? merchants.get(String(thread.related_entity_id)) || null
          : thread.related_entity_type === "PartnerProspect"
          ? partners.get(String(thread.related_entity_id)) || null
          : null;
        const eligibility = evaluateOutreachExperimentEligibility({
          thread,
          subject,
        });
        statusCounts[eligibility.status] =
          (statusCounts[eligibility.status] || 0) + 1;
        if (!outreachExperimentAdvisoryEligible(eligibility)) continue;

        const key = `${thread.engine}:${variant}`;
        const aggregate = aggregates.get(key) || {
          engine: thread.engine,
          variant_key: variant,
          sample_size: 0,
          eligible_sample_size: 0,
          exposure_count: 0,
          negative_count: 0,
          reply_count: 0,
          positive_reply_count: 0,
          meeting_count: 0,
          won_count: 0,
          verified_savings_total: 0,
          label_contract_version:
            OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT.label_version,
          methodology_class:
            OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT.methodology_class,
          probabilistic_calibration: false,
          training_eligible: false,
          selected_population_note:
            "Confirmed outbound exposure only; pending/unknown rows excluded",
        };
        aggregate.sample_size++;
        aggregate.eligible_sample_size++;
        aggregate.exposure_count++;
        if (eligibility.negative) aggregate.negative_count++;
        if (eligibility.outcomes.includes("reply")) aggregate.reply_count++;
        if (eligibility.outcomes.includes("positive_reply")) {
          aggregate.positive_reply_count++;
        }
        if (eligibility.outcomes.includes("meeting")) aggregate.meeting_count++;
        aggregates.set(key, aggregate);
      }

      let updated = 0;
      for (const aggregate of aggregates.values()) {
        aggregate.performance_score = Number((
          (aggregate.reply_count * 0.08 +
            aggregate.positive_reply_count * 0.18 +
            aggregate.meeting_count * 0.32) /
          aggregate.eligible_sample_size
        ).toFixed(5));
        aggregate.updated_at = new Date().toISOString();
        const existing = await service.entities.OutreachExperimentStats.filter(
          { engine: aggregate.engine, variant_key: aggregate.variant_key },
          "-updated_at",
          1,
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "outreachExperimentLearningWorker",
            fallback: [],
            severity: "secondary",
          })
        );
        if (existing[0]) {
          await service.entities.OutreachExperimentStats.update(
            existing[0].id,
            aggregate,
          );
        } else {
          await service.entities.OutreachExperimentStats.create(aggregate);
        }
        updated++;
      }

      return Response.json({
        ok: true,
        variants: updated,
        threads: threads.length,
        eligibility_status_counts: statusCounts,
        label_contract: OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT,
        note:
          "Bounded descriptive selected-population advisory only. UNKNOWN/pending threads are excluded and a negative requires confirmed send exposure plus a mature horizon. The worker does not train or calibrate a model and cannot change claims, sender identity, pricing, policy, or authorization.",
      });
    } catch (error) {
      console.error("outreachExperimentLearningWorker failed", error);
      return Response.json(
        { ok: false, error: "outreach_experiment_learning_failed" },
        { status: 500 },
      );
    }
  },
);
