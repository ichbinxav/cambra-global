import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { callCambraClaude } from "../../shared/commercialModelRouter.ts";
import {
  buildResilientLeadScore,
  type LeadModelStatus,
  validLeadModelRow,
} from "../../shared/leadScoringResilience.ts";
import { leadOutcomeCalibration } from "../../shared/leadOutcomeCalibration.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import {
  reconcileCommittedAdaptiveLeadDecisionProjection,
} from "../../shared/intelligenceFoundationContracts.ts";
import {
  readExactActiveMerchantAcquisitionPolicy,
} from "../../shared/commercialPolicyAuthority.ts";
import { readCompleteEntityPages } from "../../shared/privacySafeIntelligence.ts";

const AGENT_NAME = "lead_scoring";
const TASK_TYPE = "score_leads";
const RISK_LEVEL = 1;

async function callClaude(svc: any, prompt: string, eventKey: string) {
  return (await callCambraClaude(prompt, {
    tier: "standard",
    maxTokens: 4096,
    svc,
    eventKey,
    source: "leadScoringAgent",
  })).text;
}

function safeParseJSON(text: unknown) {
  if (!text) return null;
  if (typeof text !== "string") return null;
  // Strip markdown fences if present
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch { /* fallthrough */ }
  // Try to extract the first JSON array/object substring
  const match = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch { /* fallthrough */ }
  }
  return null;
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    // One immutable prediction timestamp governs every aggregate lookup and
    // every lead in this scoring task. Replays must never see outcomes that
    // became available after this point.
    const predictionTime = new Date().toISOString();
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) {
      return gate.response ||
        Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const operation = String(body?.operation || "SCORE").trim().toUpperCase();
    const reconciliationOnly = operation ===
      "RECONCILE_ADAPTIVE_EXPERIENCE";
    const leadIds: string[] | null = Array.isArray(body?.lead_ids)
      ? Array.from(
        new Set<string>(
          (body.lead_ids as unknown[]).map((value) => String(value).trim())
            .filter(Boolean),
        ),
      ).slice(0, 50)
      : null;
    const limit = Math.min(Number(body?.limit) || 25, 50);
    const deterministicOnly = body?.deterministic_only === true;

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: reconciliationOnly
        ? `Reconcile Adaptive Lead experience projection for ${
          leadIds?.length || 0
        } committed leads without rescoring`
        : leadIds
        ? `Score ${leadIds.length} leads`
        : `Score latest ${limit} unscored leads`,
      started_at: new Date().toISOString(),
    });

    // Existing physical entry point, recovery-only operation. It reconstructs
    // Event rows from the committed OutboundLead decision snapshot and exits
    // before model calls, aggregate reads, score calculation or source writes.
    if (reconciliationOnly) {
      if (!leadIds?.length) {
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "waiting_input",
          review_required: true,
          output_summary:
            "Adaptive Lead projection reconciliation requires explicit lead_ids",
          output_payload_json: {
            rescore_performed: false,
            source_mutated: false,
            learning_eligible: false,
          },
          error: "adaptive_projection_reconciliation_lead_ids_required",
          completed_at: new Date().toISOString(),
        });
        return Response.json({
          ok: false,
          error: "adaptive_projection_reconciliation_lead_ids_required",
          rescore_performed: false,
          source_mutated: false,
          learning_eligible: false,
        }, { status: 400 });
      }

      let committed: any[];
      try {
        committed = await base44.asServiceRole.entities.OutboundLead.filter(
          { id: { $in: leadIds } },
          "-created_date",
          leadIds.length,
        );
      } catch (_) {
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "waiting_input",
          review_required: true,
          output_summary:
            "Committed Adaptive Lead snapshots could not be read for reconciliation",
          output_payload_json: {
            requested: leadIds.length,
            rescore_performed: false,
            source_mutated: false,
            learning_eligible: false,
          },
          error: "adaptive_projection_source_lookup_unavailable",
          completed_at: new Date().toISOString(),
        });
        return Response.json({
          ok: false,
          error: "adaptive_projection_source_lookup_unavailable",
          rescore_performed: false,
          source_mutated: false,
          learning_eligible: false,
        }, { status: 503 });
      }
      const found = new Set(committed.map((lead: any) => String(lead.id)));
      const missingLeadIds = leadIds.filter((id) => !found.has(id));
      const reconciliation = [];
      for (const lead of committed) {
        reconciliation.push(
          await reconcileCommittedAdaptiveLeadDecisionProjection(
            base44.asServiceRole,
            lead,
            `adaptive-reconcile:${task.id}:${lead.id}`,
          ),
        );
      }
      const incomplete = reconciliation.filter((item) => !item.allowed);
      const ok = missingLeadIds.length === 0 && incomplete.length === 0;
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: ok ? "completed" : "waiting_input",
        review_required: !ok,
        output_summary: ok
          ? `Reconciled ${reconciliation.length} committed Adaptive Lead projections without rescoring`
          : "Adaptive Lead projection reconciliation remains incomplete",
        output_payload_json: {
          requested: leadIds.length,
          reconciled: reconciliation.filter((item) => item.allowed).length,
          missing_lead_ids: missingLeadIds,
          reconciliation,
          rescore_performed: false,
          source_mutated: false,
          learning_eligible: false,
        },
        ...(!ok
          ? { error: "adaptive_lead_experience_projection_incomplete" }
          : {}),
        completed_at: new Date().toISOString(),
      });
      return Response.json({
        ok,
        task_id: task.id,
        requested: leadIds.length,
        reconciled: reconciliation.filter((item) => item.allowed).length,
        missing_lead_ids: missingLeadIds,
        reconciliation,
        rescore_performed: false,
        source_mutated: false,
        learning_eligible: false,
      }, { status: ok ? 200 : 409 });
    }

    // A score may still be computed for review when policy authority is
    // missing, but the persisted Adaptive decision can grant contact
    // eligibility only when it is bound to exactly one active policy row and
    // that row's full authority-bearing content hash.
    const policyAuthority =
      await readExactActiveMerchantAcquisitionPolicy(
        base44.asServiceRole,
        Date.parse(predictionTime),
      );
    const adaptiveGovernance = policyAuthority.allowed
      ? {
        policy: policyAuthority.policy,
        policy_binding: policyAuthority.binding,
      }
      : {
        policy: {},
        policy_binding: {
          authority_status: "BLOCKED",
          blockers: policyAuthority.blockers,
        },
      };

    let leads = [];
    if (leadIds && leadIds.length) {
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ id: { $in: leadIds } }, "-created_date", leadIds.length)
        .catch((error: any) =>
          safeBestEffort(error, {
            operation: "leadScoringAgent",
            fallback: [],
            severity: "secondary",
          })
        );
    } else {
      // Prefer enriched, fall back to any unscored
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ score: null }, "-created_date", limit).catch((error: any) =>
          safeBestEffort(error, {
            operation: "leadScoringAgent",
            fallback: [],
            severity: "secondary",
          })
        );
      if (!leads.length) {
        leads = await base44.asServiceRole.entities.OutboundLead
          .list("-created_date", limit).catch((error: any) =>
            safeBestEffort(error, {
              operation: "leadScoringAgent",
              fallback: [],
              severity: "secondary",
            })
          );
      }
    }

    if (!leads.length) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "No leads to score",
        output_payload_json: { count: 0 },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, count: 0 });
    }

    // Compact lead payload for Claude
    const compact = leads.map((l: any) => ({
      id: l.id,
      company: l.company_name,
      domain: l.company_domain,
      country: l.country,
      industry: l.industry,
      company_evidence: {
        employee_range: l.employee_range || null,
        revenue_range: l.revenue_range || null,
        technologies: Array.isArray(l.detected_technologies)
          ? l.detected_technologies
          : [],
        ecommerce_platform: l.ecommerce_platform || null,
        probable_payment_stack: Array.isArray(l.probable_payment_stack)
          ? l.probable_payment_stack
          : [],
        source_evidence: {
          source: l.source || l.source_evidence_json?.source || null,
          observed_at: l.source_evidence_json?.observed_at || l.discovered_at ||
            null,
          technology_source: l.source_evidence_json?.technology_source || null,
          payment_source: l.source_evidence_json?.payment_source || null,
          country_source: l.source_evidence_json?.country_source || null,
        },
      },
    }));

    const prompt = [
      "Eres el motor de priorización COMPANY-ONLY de merchants de CAMBRA. No inventes datos ausentes: una señal no observada permanece UNKNOWN, no suma ni resta y nunca se convierte en cero observado.",
      "No se proporcionan ni se permiten nombre, email, cargo, LinkedIn u otras señales de persona. No las infieras. La calidad/relevancia de contacto se decide después del gate OUTREACH_WORTHY y nunca modifica este score de compañía.",
      "Objetivo: priorizar merchants FR/ES con suficiente infraestructura de pagos para que un análisis de CAMBRA tenga ROI real.",
      "Puntúa 0-100 con esta rúbrica explícita:",
      "- Commerce/payment fit: 30 pts. Ecommerce/DTC/omnichannel real, retail físico, checkout propio, Shopify/WooCommerce/BigCommerce u otra evidencia de comercio.",
      "- Economic potential: 30 pts. Tamaño/empleados/revenue/traffic/store count/funding u otras señales verificables que sugieran volumen de pagos material. No inventar GMV.",
      "- Payments complexity/opportunity signals: 25 pts. PSP/TPV detectado, múltiples canales/países/tiendas, stack de payments visible, expansión internacional. No afirmar fees sin evidencia.",
      "- Timing/growth signal: 10 pts. Funding, hiring, expansión, nuevas tiendas/mercados, crecimiento o cambio de stack verificable.",
      "- Company evidence confidence: 5 pts. Evidencia empresarial suficientemente completa, temporal y con provenance clara.",
      "Hard penalties: -40 si no hay evidencia de commerce; -25 si parece micro-negocio sin señal de volumen material. No apliques ninguna penalización ni bonus por contacto/cargo/email.",
      "Devuelve SOLO JSON array con shape:",
      `[{"id":"<lead_id>","score":<0-100>,"breakdown":{"commerce_fit":<0-30>,"economic_potential":<0-30>,"payments_complexity":<0-25>,"decision_maker":0,"timing":<0-10>,"data_confidence":<0-5>,"penalties":<0-negative>},"signals":{"commerce_platform":null,"payment_provider":null,"physical_retail":null,"store_count":null,"employee_range":null,"revenue_signal":null,"funding_signal":null,"international_signal":null},"reasoning":"<1 línea basada solo en evidencia de compañía; UNKNOWN explícito>","next_action":"<acción company-only concreta>"}]`,
      "Leads:",
      JSON.stringify(compact),
    ].join("\n");

    let text = "";
    let parsed: any = null;
    let modelErrorCode: string | null = null;
    if (!deterministicOnly) {
      try {
        text = await callClaude(
          base44.asServiceRole,
          prompt,
          task?.id || crypto.randomUUID(),
        );
        parsed = safeParseJSON(text);
        if (!Array.isArray(parsed)) modelErrorCode = "model_output_unparseable";
      } catch (error) {
        modelErrorCode = String(
          (error as Error)?.message || "model_call_failed",
        ).split(":")[0].slice(0, 80);
      }
    }
    const validRows = Array.isArray(parsed)
      ? parsed.filter(validLeadModelRow)
      : [];
    const validById = new Map(
      validRows.map((row: any) => [String(row.id), row]),
    );
    const matchedCount = leads.filter((lead: any) =>
      validById.has(String(lead.id))
    ).length;
    const modelStatus: LeadModelStatus = deterministicOnly
      ? "SKIPPED_DETERMINISTIC_ONLY"
      : matchedCount === leads.length
      ? "PARSED"
      : matchedCount > 0
      ? "PARTIAL"
      : "UNAVAILABLE_OR_UNPARSEABLE";
    const degraded = modelStatus === "PARTIAL" ||
      modelStatus === "UNAVAILABLE_OR_UNPARSEABLE";

    // Every requested lead receives a deterministic result. A missing or malformed
    // model row can reduce confidence, but it must never strand the whole P6 chain.
    const aggregateRead = await readCompleteEntityPages(
      base44.asServiceRole.entities.AnonymizedIntelligenceAggregate,
      {
        source_entity: "AnonymizedIntelligenceAggregate",
        snapshot_at: predictionTime,
        page_size: 1000,
        max_pages: 1000,
      },
    );
    // A partial first page is never treated as the full learning population.
    // Scoring remains deterministic-only when coverage cannot be proven.
    const outcomeAggregates = aggregateRead.ok
      ? aggregateRead.rows.filter((row: any) =>
        row?.aggregate_type === "verified_outcomes" &&
        Date.parse(String(row?.last_verified_at || "")) <=
          Date.parse(predictionTime)
      )
      : [];
    const outcomeAdvisories = new Map(
      leads.map((
        lead: any,
      ) => [
        String(lead.id),
        leadOutcomeCalibration(lead, outcomeAggregates, {
          prediction_time: predictionTime,
        }),
      ]),
    );
    const updates = leads.map((lead: any) =>
      buildResilientLeadScore(
        lead,
        validById.get(String(lead.id)),
        modelStatus,
        outcomeAdvisories.get(String(lead.id)),
        {
          ...adaptiveGovernance,
          aggregate_coverage: aggregateRead.coverage,
        },
      )
    );

    const committedLeads: any[] = [];
    if (updates.length) {
      try {
        await base44.asServiceRole.entities.OutboundLead.bulkUpdate(updates);
        for (const update of updates) {
          const committed = await base44.asServiceRole.entities.OutboundLead
            .get(update.id).catch((error:any)=>safeBestEffort(error,{operation:'leadScoringAgent.bulk_commit_readback',fallback:null,severity:'critical'}));
          if (!committed) {
            throw new Error("adaptive_lead_commit_readback_unavailable");
          }
          committedLeads.push(committed);
        }
      } catch (e) {
        committedLeads.length = 0;
        for (const u of updates) {
          const { id, ...patch } = u;
          await base44.asServiceRole.entities.OutboundLead.update(id, patch);
          const committed = await base44.asServiceRole.entities.OutboundLead
            .get(id).catch((error:any)=>safeBestEffort(error,{operation:'leadScoringAgent.serial_commit_readback',fallback:null,severity:'critical'}));
          if (!committed) {
            throw new Error("adaptive_lead_commit_readback_unavailable");
          }
          committedLeads.push(committed);
        }
      }
    }

    // Source-first append-only history. Projection failure never rolls back the
    // committed company score, but it does fail this task closed and leaves an
    // explicit REVIEW_REQUIRED record for deterministic reconciliation/replay.
    const adaptiveExperienceProjection = [];
    for (const committed of committedLeads) {
      adaptiveExperienceProjection.push(
        await reconcileCommittedAdaptiveLeadDecisionProjection(
          base44.asServiceRole,
          committed,
          task.id,
        ),
      );
    }
    const projectionErrors = adaptiveExperienceProjection.flatMap((item) =>
      item.allowed ? [] : item.blockers.map((code) => ({
        candidate_id: item.candidate_id,
        decision_id: item.decision_id,
        code,
      }))
    );
    if (projectionErrors.length) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "waiting_input",
        review_required: true,
        output_summary:
          "Company scores committed; Adaptive Lead experience projection requires reconciliation",
        output_payload_json: {
          count: leads.length,
          scored: updates.length,
          prediction_time: predictionTime,
          adaptive_experience_projection: adaptiveExperienceProjection,
          execution_authority_granted: false,
          learning_eligible: false,
        },
        error: "adaptive_lead_experience_projection_incomplete",
        completed_at: new Date().toISOString(),
      });
      return Response.json({
        ok: false,
        error: "adaptive_lead_experience_projection_incomplete",
        review_required: true,
        task_id: task.id,
        scored: updates.length,
        projection_errors: projectionErrors,
      }, { status: 409 });
    }

    const ranked = updates.map((row: any) => ({
      id: row.id,
      score: row.score,
      reasoning: row.score_breakdown_json.reasoning,
      next_action: row.next_action,
      model_status: row.score_breakdown_json.model_status,
    })).sort((a: any, b: any) => b.score - a.score);

    if (degraded) {
      await base44.asServiceRole.entities.OperationalLog.create({
        event_type: "lead_scoring_model_degraded",
        message: modelStatus,
        data_json: {
          task_id: task.id,
          lead_count: leads.length,
          model_rows_matched: matchedCount,
          model_error_code: modelErrorCode || "partial_or_missing_rows",
          deterministic_fallback: true,
          raw_model_output_persisted: false,
        },
        actor_email: "lead_scoring_agent",
        created_at: new Date().toISOString(),
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "leadScoringAgent",
          fallback: null,
          severity: "secondary",
        })
      );
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Scored ${updates.length} of ${leads.length} leads${
        degraded ? " with deterministic fallback" : ""
      }`,
      output_payload_json: {
        count: leads.length,
        scored: updates.length,
        model_status: modelStatus,
        degraded,
        model_error_code: modelErrorCode,
        deterministic_fallback: modelStatus !== "PARSED",
        privacy_safe_outcome_advisories:
          Array.from(outcomeAdvisories.values()).filter((x: any) => x.applied)
            .length,
        privacy_safe_outcome_calibrations:
          Array.from(outcomeAdvisories.values()).filter((x: any) => x.applied)
            .length,
        outcome_advisory_methodology:
          "DESCRIPTIVE_AGGREGATE_HEURISTIC_NOT_PROBABILISTIC_CALIBRATION",
        prediction_time: predictionTime,
        merchant_acquisition_policy_authority: {
          status: policyAuthority.status,
          active_count: policyAuthority.active_count,
          binding: policyAuthority.binding,
          blockers: policyAuthority.blockers,
          default_policy_authority_used: false,
        },
        privacy_safe_outcome_aggregate_coverage: aggregateRead.coverage,
        adaptive_experience_projection: {
          candidates: adaptiveExperienceProjection.length,
          created: adaptiveExperienceProjection.reduce(
            (sum, item) => sum + item.append.created,
            0,
          ),
          duplicate: adaptiveExperienceProjection.reduce(
            (sum, item) => sum + item.append.duplicate,
            0,
          ),
          exact_projection_verified: true,
          learning_eligible: false,
        },
        top: ranked.slice(0, 10),
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      task_id: task.id,
      count: leads.length,
      scored: updates.length,
      model_status: modelStatus,
      degraded,
      model_error_code: modelErrorCode,
      deterministic_fallback: modelStatus !== "PARSED",
      prediction_time: predictionTime,
      merchant_acquisition_policy_authority: {
        status: policyAuthority.status,
        active_count: policyAuthority.active_count,
        binding: policyAuthority.binding,
        blockers: policyAuthority.blockers,
        default_policy_authority_used: false,
      },
      privacy_safe_outcome_aggregate_coverage: aggregateRead.coverage,
      adaptive_experience_projection: {
        candidates: adaptiveExperienceProjection.length,
        created: adaptiveExperienceProjection.reduce(
          (sum, item) => sum + item.append.created,
          0,
        ),
        duplicate: adaptiveExperienceProjection.reduce(
          (sum, item) => sum + item.append.duplicate,
          0,
        ),
        exact_projection_verified: true,
        learning_eligible: false,
      },
      ranked,
    });
  } catch (error: any) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, {
          status: "failed",
          error: error.message,
          completed_at: new Date().toISOString(),
        });
      } catch (_) { /* swallow */ }
    }
    return internalErrorResponse(error, "leadScoringAgent");
  }
});
