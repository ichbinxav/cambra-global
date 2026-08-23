import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { safeBestEffort } from "../../shared/bestEffort.ts";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { guardedScheduledServe } from "../../shared/schedulerRun.ts";

export const SALES_PIPELINE_BATCH_SIZE = 50;
const SALES_PIPELINE_CONTEXT_LIMIT = SALES_PIPELINE_BATCH_SIZE * 20;
const UPDATE_CONCURRENCY = 10;

const stageMap: Record<string, string> = {
  lead: "discovered",
  enriched: "enriched",
  scored: "qualified",
  outreach_ready: "outreach_ready",
  waiting_window: "outreach_ready",
  waiting_capacity: "outreach_ready",
  contacted: "contacted",
  meeting: "discovery",
  won: "won",
  lost: "lost",
};

const clamp = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

function rowsOrEmpty(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function reportReadFailure(error: unknown) {
  return safeBestEffort(error, {
    operation: "salesPipelineWorker",
    fallback: [],
    severity: "secondary",
  });
}

function groupByBrand(rows: any[]) {
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const brandId = String(row?.brand_id || "");
    if (!brandId) continue;
    const existing = grouped.get(brandId) || [];
    existing.push(row);
    grouped.set(brandId, existing);
  }
  return grouped;
}

function probabilityForStage(stage: string) {
  if (["qualified", "outreach_ready"].includes(stage)) return .12;
  if (stage === "contacted") return .18;
  if (stage === "engaged") return .3;
  if (stage === "discovery") return .45;
  if (stage === "won") return 1;
  if (stage === "lost") return 0;
  return .05;
}

guardedScheduledServe(
  { worker_key: "salesPipelineWorker", cadence_seconds: 3600 },
  createClientFromRequest,
  async (req) => {
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      const gate = await requireAdminOrInternal(req, base44, body);
      if (!gate.ok) return gate.response;

      const service = base44.asServiceRole;
      // Updating a row moves it to the back of this oldest-first queue. Failed
      // rows remain at the front and are retried on the next bounded run.
      const leads = rowsOrEmpty(
        await service.entities.OutboundLead
          .list("updated_date", SALES_PIPELINE_BATCH_SIZE)
          .catch(reportReadFailure),
      );
      if (!leads.length) {
        return Response.json({
          ok: true,
          processed: 0,
          updated: 0,
          batch_size: SALES_PIPELINE_BATCH_SIZE,
          note:
            "Unknown monetary value remains unknown; revenue priority never fabricates GMV, savings or CAMBRA fee.",
        });
      }

      const leadIds = leads.map((lead: any) => String(lead.id)).filter(Boolean);
      const attributions = rowsOrEmpty(
        await service.entities.AcquisitionAttribution.filter(
          { lead_id: { $in: leadIds } },
          "-attributed_at",
          SALES_PIPELINE_CONTEXT_LIMIT,
        ).catch(reportReadFailure),
      );
      const attributionByLead = new Map<string, any>();
      for (const attribution of attributions) {
        // Ambiguous or unattributed lineage can never influence a brand's
        // commercial stage or observed economics.
        if (
          attribution?.attribution_state !== "EXACT" ||
          attribution?.confidence !== "deterministic"
        ) continue;
        const leadId = String(attribution.lead_id || "");
        if (leadId && !attributionByLead.has(leadId)) {
          attributionByLead.set(leadId, attribution);
        }
      }

      const brandIds = [...new Set(
        [...attributionByLead.values()]
          .map((attribution: any) => String(attribution.brand_id || ""))
          .filter(Boolean),
      )];
      const brandFilter = { brand_id: { $in: brandIds } };
      const [activations, analyzerResults, lifecycles, memberships, pools] =
        brandIds.length
          ? await Promise.all([
            service.entities.DealActivation.filter(
              brandFilter,
              "-created_date",
              SALES_PIPELINE_CONTEXT_LIMIT,
            ).catch(reportReadFailure),
            service.entities.AnalyzerResult.filter(
              brandFilter,
              "-created_date",
              SALES_PIPELINE_CONTEXT_LIMIT,
            ).catch(reportReadFailure),
            service.entities.RevenueLifecycle.filter(
              brandFilter,
              "-updated_at",
              SALES_PIPELINE_CONTEXT_LIMIT,
            ).catch(reportReadFailure),
            service.entities.AggregatePoolMember.filter(
              {
                ...brandFilter,
                status: { $in: ["eligible", "potential"] },
              },
              "-updated_at",
              SALES_PIPELINE_CONTEXT_LIMIT,
            ).catch(reportReadFailure),
            service.entities.AggregatePool.list(
              "-updated_at",
              SALES_PIPELINE_CONTEXT_LIMIT,
            ).catch(reportReadFailure),
          ])
          : [[], [], [], [], []];

      const activationsByBrand = groupByBrand(rowsOrEmpty(activations));
      const resultsByBrand = groupByBrand(rowsOrEmpty(analyzerResults));
      const lifecyclesByBrand = groupByBrand(rowsOrEmpty(lifecycles));
      const membershipsByBrand = groupByBrand(rowsOrEmpty(memberships));
      const poolById = new Map(
        rowsOrEmpty(pools).map((pool: any) => [String(pool.id), pool]),
      );

      async function updateLead(lead: any) {
        let revenueStage = stageMap[String(lead.stage || "lead")] || "discovered";
        let closeProbability = probabilityForStage(revenueStage);
        let expectedRevenue: number | null = null;
        let aggregateContribution = 0;
        const attribution = attributionByLead.get(String(lead.id));
        const brandId = String(attribution?.brand_id || "");

        if (brandId) {
          const brandActivations = activationsByBrand.get(brandId) || [];
          if (
            brandActivations.some((activation: any) =>
              ["authorized", "migrating", "live", "monetizing"].includes(
                activation.status,
              )
            )
          ) {
            revenueStage = "recover";
          } else if ((resultsByBrand.get(brandId) || []).length) {
            revenueStage = "analyzed";
          }

          const collected = (lifecyclesByBrand.get(brandId) || []).reduce(
            (total: number, lifecycle: any) =>
              total + Number(lifecycle.collected_amount || 0),
            0,
          );
          if (collected > 0) {
            revenueStage = "won";
            expectedRevenue = collected;
            closeProbability = 1;
          }

          for (const membership of membershipsByBrand.get(brandId) || []) {
            const pool = poolById.get(String(membership.pool_id || ""));
            if (!pool) continue;
            aggregateContribution = Math.max(
              aggregateContribution,
              Number(pool.aggregation_power_score || 0) / 100,
            );
          }
        }

        const breakdown = lead.score_breakdown_json || {};
        const opportunity = clamp(
          Number(breakdown.opportunity_score ?? lead.score ?? 0) / 100,
        );
        const confidence = clamp(
          Number(breakdown.evidence_confidence ?? .5),
        );
        const strategic = clamp(
          .55 + .25 * aggregateContribution +
            .2 * clamp(Number(lead.score || 0) / 100),
        );
        const patch: Record<string, unknown> = {
          revenue_stage: revenueStage,
          revenue_opportunity_score: Math.round(
            100 * opportunity * confidence * strategic,
          ),
          close_probability: closeProbability,
          strategic_value: strategic,
          revenue_confidence: confidence,
          sales_owner: "CAMBRA autonomous commercial loop",
        };
        if (expectedRevenue !== null) {
          patch.expected_revenue_value = expectedRevenue;
        }

        const updated = await service.entities.OutboundLead.update(lead.id, patch)
          .catch((error: unknown) =>
            safeBestEffort(error, {
              operation: "salesPipelineWorker",
              fallback: null,
              severity: "secondary",
            })
          );
        return Boolean(updated);
      }

      let updated = 0;
      for (let offset = 0; offset < leads.length; offset += UPDATE_CONCURRENCY) {
        const results = await Promise.all(
          leads.slice(offset, offset + UPDATE_CONCURRENCY).map(updateLead),
        );
        updated += results.filter(Boolean).length;
      }

      return Response.json({
        ok: true,
        processed: leads.length,
        updated,
        failed_updates: leads.length - updated,
        batch_size: SALES_PIPELINE_BATCH_SIZE,
        batch_full: leads.length === SALES_PIPELINE_BATCH_SIZE,
        exact_attributions_used: attributionByLead.size,
        note:
          "Unknown monetary value remains unknown; revenue priority never fabricates GMV, savings or CAMBRA fee.",
      });
    } catch (error) {
      console.error(error);
      return Response.json(
        { ok: false, error: "sales_pipeline_worker_failed" },
        { status: 500 },
      );
    }
  },
);
