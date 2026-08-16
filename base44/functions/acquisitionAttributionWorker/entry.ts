import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { guardedScheduledServe } from "../../shared/schedulerRun.ts";
import { VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT } from "../../shared/adaptiveLeadLearning.ts";

const norm = (value: unknown) => String(value || "").trim().toLowerCase();
const iso = (value: unknown) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

function reportObservedAt(report: any) {
  // verified_at is the first authoritative observation of verified savings.
  // Mutable update/approval timestamps could make a pre-existing outcome look
  // post-exposure, so they are deliberately not accepted as substitutes.
  return iso(report?.verified_at);
}

function verifiedReport(report: any) {
  return report?.measurement_mode === "fully_verified" &&
    ["verified", "realized", "invoiced", "paid"].includes(
      String(report?.verification_status || ""),
    ) && Number(report?.billable_savings_amount ?? report?.savings) > 0;
}

async function upsertAttribution(service: any, row: any) {
  let existing: any[] | null = null;
  try {
    const rows = await service.entities.AcquisitionAttribution.filter(
      { brand_id: row.brand_id, lead_id: row.lead_id },
      "-attributed_at",
      2,
    );
    if (Array.isArray(rows)) existing = rows;
  } catch (error: any) {
    safeBestEffort(error, {
      operation: "acquisitionAttributionWorker.attributionRead",
      fallback: null,
      severity: "critical",
    });
  }
  if (!existing) return "lookup_unavailable";
  if (existing.length === 1) {
    await service.entities.AcquisitionAttribution.update(existing[0].id, row);
    return "updated";
  }
  if (existing.length > 1) return "ambiguous_existing";
  await service.entities.AcquisitionAttribution.create(row);
  return "created";
}

guardedScheduledServe(
  { worker_key: "acquisitionAttributionWorker", cadence_seconds: 3600 },
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
      const brands = await service.entities.Brand.filter(
        {},
        "-created_date",
        1000,
      ).catch((error: any) =>
        safeBestEffort(error, {
          operation: "acquisitionAttributionWorker",
          fallback: [],
          severity: "secondary",
        })
      );
      let dealRows: any[] | null = null;
      try {
        const rows = await service.entities.DealActivation.filter(
          {},
          "-activated_at",
          5000,
        );
        if (Array.isArray(rows)) dealRows = rows;
      } catch (error: any) {
        safeBestEffort(error, {
          operation: "acquisitionAttributionWorker.dealRead",
          fallback: null,
          severity: "critical",
        });
      }
      const dealById = new Map(
        (dealRows || []).map((deal: any) => [String(deal.id), deal]),
      );
      let created = 0;
      let updated = 0;
      let exact = 0;
      let ambiguous = 0;
      let unattributed = 0;
      let skipped = 0;

      for (const brand of brands) {
        const email = norm(brand.contact_email || brand.created_by);
        if (!email) {
          skipped++;
          continue;
        }
        const leads = await service.entities.OutboundLead.filter(
          { contact_email: email },
          "-created_date",
          20,
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "acquisitionAttributionWorker",
            fallback: [],
            severity: "secondary",
          })
        );
        const eligibleLeads = leads.filter((lead: any) =>
          ["contacted", "meeting", "won"].includes(String(lead.stage || ""))
        );
        if (eligibleLeads.length !== 1) {
          if (eligibleLeads.length > 1) ambiguous++;
          else unattributed++;
          continue;
        }
        const lead = eligibleLeads[0];
        const threads = await service.entities.CommunicationThread.filter(
          { engine: "merchant_acquisition", lead_id: lead.id },
          "-created_date",
          5,
        ).catch((error: any) =>
          safeBestEffort(error, {
            operation: "acquisitionAttributionWorker",
            fallback: [],
            severity: "secondary",
          })
        );
        const sent = threads.filter((thread: any) =>
          iso(thread.last_outbound_at)
        );
        if (sent.length !== 1) {
          if (sent.length > 1) ambiguous++;
          else unattributed++;
          continue;
        }
        const thread = sent[0];
        const exposureAt = iso(thread.last_outbound_at);
        // Brand.created_date is the durable merchant-record onboarding
        // observation available in the canonical schema. We do not infer an
        // unrecorded completion time. An incomplete Brand can never grant an
        // economic learning label.
        const onboardingObservedAt = brand.onboarding_complete === true
          ? iso(brand.created_date)
          : null;
        let reports: any[] | null = null;
        try {
          const rows = await service.entities.MonthlySavingsReport.filter(
            { brand_id: brand.id, measurement_mode: "fully_verified" },
            "-verified_at",
            100,
          );
          if (Array.isArray(rows)) reports = rows;
        } catch (error: any) {
          safeBestEffort(error, {
            operation: "acquisitionAttributionWorker.reportRead",
            fallback: null,
            severity: "critical",
          });
        }
        if (!reports) {
          ambiguous++;
          continue;
        }
        const exactReports = reports.filter((report: any) => {
          const observedAt = reportObservedAt(report);
          const deal = dealById.get(String(report?.deal_activation_id || ""));
          const dealActivatedAt = iso(
            deal?.conditions_activated_at || deal?.activated_at,
          );
          const observedMs = Date.parse(String(observedAt || ""));
          return verifiedReport(report) && observedAt && exposureAt &&
            onboardingObservedAt && dealActivatedAt &&
            String(report.brand_id || "") === String(brand.id) &&
            String(deal?.brand_id || "") === String(brand.id) &&
            observedMs >= Date.parse(exposureAt) &&
            observedMs >= Date.parse(onboardingObservedAt) &&
            observedMs >= Date.parse(dealActivatedAt);
        });
        const attributionState = exactReports.length === 1
          ? "EXACT"
          : exactReports.length > 1
          ? "AMBIGUOUS"
          : "UNATTRIBUTED";
        const report = attributionState === "EXACT" ? exactReports[0] : null;
        const reportDeal = report
          ? dealById.get(String(report.deal_activation_id || ""))
          : null;
        const dealActivatedAt = reportDeal
          ? iso(
            reportDeal.conditions_activated_at || reportDeal.activated_at,
          )
          : null;
        const attributedAt = new Date().toISOString();
        const row = {
          lead_id: lead.id,
          brand_id: brand.id,
          thread_id: thread.id,
          contact_email: email,
          company_domain: String(lead.company_domain || ""),
          attribution_method: report
            ? VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT.method
            : "exact_contact_email",
          attribution_method_version: report
            ? VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT.version
            : "exact-contact-email-v1.0.0",
          attribution_state: attributionState,
          confidence: attributionState === "EXACT"
            ? "deterministic"
            : "unknown",
          exposure_at: exposureAt,
          exposure_event_id: thread.external_thread_id || thread.id,
          source_event: "brand_exact_email_match",
          source_event_id: brand.id,
          source_run_id: body?.source_run_id ||
            lead.source_evidence_json?.discovery_run_id || null,
          candidate_lineage_json: {
            candidate_id: lead.id,
            lead_id: lead.id,
            thread_id: thread.id,
            exposure_at: exposureAt,
            onboarding_observed_at: onboardingObservedAt,
            source: lead.source || null,
            discovery_run_id: lead.source_evidence_json?.discovery_run_id ||
              null,
            company_key: lead.canonical_company_key || null,
            report_candidate_ids: exactReports.map((item: any) => item.id),
            deal_candidate_ids: [
              ...new Set(
                exactReports.map((item: any) => item.deal_activation_id)
                  .filter(Boolean),
              ),
            ],
            causal_claim: false,
            training_label: false,
          },
          onboarding_observed_at: onboardingObservedAt,
          deal_activation_id: report?.deal_activation_id || null,
          deal_activated_at: dealActivatedAt,
          monthly_savings_report_id: report?.id || null,
          report_observed_at: report ? reportObservedAt(report) : null,
          economic_attribution_eligible: attributionState === "EXACT",
          attribution_reason: attributionState === "EXACT"
            ? "specific_verified_report_observed_after_exposure_onboarding_and_deal_activation"
            : attributionState === "AMBIGUOUS"
            ? "multiple_exact_temporal_report_candidates_require_explicit_report_link"
            : "no_exact_post_exposure_onboarding_deal_report_lineage",
          attributed_at: attributedAt,
        };
        const result = await upsertAttribution(service, row);
        if (result === "created") created++;
        else if (result === "updated") updated++;
        else {
          ambiguous++;
          continue;
        }
        if (attributionState === "EXACT") exact++;
        else if (attributionState === "AMBIGUOUS") ambiguous++;
        else unattributed++;
      }

      return Response.json({
        ok: true,
        created,
        updated,
        exact,
        ambiguous,
        unattributed,
        skipped,
        attribution_contract: VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT,
        note:
          "Only one specific fully-verified MonthlySavingsReport observed after exact exposure, durable merchant onboarding observation and exact deal activation may grant the bounded economic advisory label. Ambiguous or missing report lineage remains non-economic; no causal or training claim.",
      });
    } catch (error) {
      console.error("acquisitionAttributionWorker failed", error);
      return Response.json(
        { ok: false, error: "acquisition_attribution_failed" },
        { status: 500 },
      );
    }
  },
);
