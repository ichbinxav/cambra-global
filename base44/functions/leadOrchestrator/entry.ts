import { safeBestEffort } from "../../shared/bestEffort.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import { attachCanonicalChildTask, createCanonicalAgentTask } from "../../shared/agentTaskEnvelope.ts";
import { unwrapCommandFunctionResponse } from "../../shared/commandFunctionResult.ts";

const ORCHESTRATOR_NAME = "lead_orchestrator";
const TASK_TYPE = "orchestrate";
const CONTACT_LAST_CHAIN_VERSION = "lead-chain-contact-last-v1.0.0";

type ChainStep = {
  name: string;
  phase: string;
  payload: Record<string, any>;
};

function chainPlan(body: any, icp: any): {
  mode: string;
  steps: ChainStep[];
} {
  const legacyRequested = String(body?.chain_mode || "").toUpperCase() ===
    "LEGACY_ENRICH_FIRST";
  const legacyEnabled =
    Deno.env.get("LEAD_ORCHESTRATOR_LEGACY_CHAIN_ENABLED") ===
      "true";
  if (legacyRequested && legacyEnabled) {
    return {
      mode: "LEGACY_COMPATIBILITY_COMPANY_ONLY",
      steps: [
        { name: "leadDiscoveryAgent", phase: "DISCOVERY", payload: { ...icp } },
        {
          name: "leadEnrichmentAgent",
          phase: "COMPANY_ENRICHMENT",
          payload: { operation: "COMPANY_ENRICHMENT" },
        },
        {
          name: "leadScoringAgent",
          phase: "COMPANY_SCORING",
          payload: {},
        },
        { name: "crmAgent", phase: "COMPANY_CRM_HANDOFF", payload: {} },
      ],
    };
  }
  return {
    mode: "CONTACT_LAST",
    steps: [
      { name: "leadDiscoveryAgent", phase: "DISCOVERY", payload: { ...icp } },
      {
        name: "leadScoringAgent",
        phase: "COMPANY_SCORING",
        payload: {},
      },
      {
        name: "leadEnrichmentAgent",
        phase: "CONTACT_RESOLUTION",
        payload: {
          operation: "CONTACT_RESOLUTION",
          maximum_contacts: 2,
        },
      },
      { name: "crmAgent", phase: "COMPANY_CRM_HANDOFF", payload: {} },
    ],
  };
}

Deno.serve(async (req) => {
  let parent: any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) {
      return gate.response ||
        Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const icp = body?.icp || {};
    const plan = chainPlan(body, icp);
    const internal = Deno.env.get("INTERNAL_CALL_SECRET") || "";

    parent = await createCanonicalAgentTask(base44.asServiceRole, req, {
      brand_id: "_platform",
      agent_name: ORCHESTRATOR_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: 1,
      input_summary: plan.mode === "CONTACT_LAST"
        ? "Lead chain: company discovery → company scoring → gated contact resolution → CRM"
        : "Legacy compatibility chain: company discovery → company-only enrichment → scoring → CRM",
      output_payload_json: {
        chain_version: CONTACT_LAST_CHAIN_VERSION,
        chain_mode: plan.mode,
        chain: plan.steps.map((step) => step.phase),
        steps: [],
      },
      started_at: new Date().toISOString(),
    }, {
      workflowKey:'lead_contact_last_chain', workflowVersion:CONTACT_LAST_CHAIN_VERSION, tenantKey:'_platform',
      processingPurpose:'commercial_lead_discovery_and_qualification', functionName:'leadOrchestrator',
      input:{icp,chain_mode:plan.mode,discovery_run_id:body?.discovery_run_id||null}, triggerType:gate.isInternal?'INTERNAL':undefined,
      sourceRefs:body?.discovery_run_id?[{type:'discovery_run',id:String(body.discovery_run_id)}]:[],
    });

    const executed: any[] = [];
    let chainLeadIds: string[] = [];
    let enrichmentLeadIds: string[] = [];
    let discoverySummary: any = {
      scanned: 0,
      decision_makers_found: 0,
      contact_records_acquired: 0,
      count: 0,
      rejected_count: 0,
      duplicate_rejected: 0,
      next_page: null,
      source_credit_cost_documented: null,
    };

    for (let index = 0; index < plan.steps.length; index++) {
      const step = plan.steps[index];
      let childTaskId: string | null = null;
      let childStatus = "unknown";
      let stepError: string | null = null;

      if (step.phase !== "DISCOVERY" && !chainLeadIds.length) {
        executed.push({
          step: step.name,
          phase: step.phase,
          child_task_id: null,
          status: "completed",
          skipped: true,
          reason: "no_new_canonical_companies",
        });
        continue;
      }

      const payload = {
        ...step.payload,
        ...(step.phase !== "DISCOVERY"
          ? { lead_ids: chainLeadIds, limit: chainLeadIds.length }
          : {}),
        ...(step.phase === "CONTACT_RESOLUTION" && body?.discovery_run_id
          ? { discovery_run_id: body.discovery_run_id }
          : {}),
        internal_secret: internal,
      };
      try {
        const result = await base44.functions.invoke(step.name, payload);
        const data = unwrapCommandFunctionResponse(result) || {};
        if (step.phase === "DISCOVERY") {
          chainLeadIds = Array.isArray(data.created_ids)
            ? data.created_ids.map(String).filter(Boolean)
            : [];
          enrichmentLeadIds = Array.isArray(data.enrichment_ids)
            ? data.enrichment_ids.map(String).filter((id: string) =>
              chainLeadIds.includes(id)
            )
            : [];
          discoverySummary = {
            scanned: Number(data.scanned || 0),
            decision_makers_found: 0,
            contact_records_acquired: 0,
            count: chainLeadIds.length,
            rejected_count: Number(data.rejected_count || 0),
            duplicate_rejected: Number(data.duplicate_rejected || 0),
            next_page: data.next_page ?? null,
            source_credit_cost_documented: data.source_credit_cost_documented ??
              null,
          };
        }
        childTaskId = data.task_id || null;
        if (childTaskId) {
          await attachCanonicalChildTask(base44.asServiceRole, childTaskId, parent, {
            stepKey: step.phase.toLowerCase(),
            stepIndex: index + 1,
            input: payload,
            sourceRefs: [{ type: "function", id: step.name }],
          });
        }
        if (childTaskId) {
          const child = await base44.asServiceRole.entities.AgentTask.get(
            childTaskId,
          ).catch((error: any) =>
            safeBestEffort(error, {
              operation: "leadOrchestrator",
              fallback: null,
              severity: "secondary",
            })
          );
          childStatus = child?.status ||
            (data.ok === false ? "failed" : "completed");
        } else childStatus = data.ok === false ? "failed" : "completed";
        if (data.ok === false) {
          stepError = data.error || "agent reported ok=false";
        }
      } catch (error: any) {
        const data = unwrapCommandFunctionResponse(
          error?.response?.data ?? error?.data ?? null,
        ) || {};
        childTaskId = data?.task_id || null;
        stepError = String(data?.error || error?.message || error).slice(0, 200);
        if (childTaskId) {
          await attachCanonicalChildTask(base44.asServiceRole, childTaskId, parent, {
            stepKey: step.phase.toLowerCase(),
            stepIndex: index + 1,
            input: payload,
            sourceRefs: [{ type: "function", id: step.name }],
          });
          const child = await base44.asServiceRole.entities.AgentTask.get(
            childTaskId,
          ).catch((readError: any) =>
            safeBestEffort(readError, {
              operation: "leadOrchestrator.readRejectedChild",
              fallback: null,
              severity: "secondary",
            })
          );
          childStatus = child?.status ||
            (data?.review_required === true ? "waiting_input" : "failed");
        } else {
          childStatus = data?.review_required === true
            ? "waiting_input"
            : "failed";
        }
      }

      executed.push({
        step: step.name,
        phase: step.phase,
        child_task_id: childTaskId,
        status: childStatus,
        error: stepError,
        ...(step.phase === "DISCOVERY" ? { result: discoverySummary } : {}),
      });
      if (
        ["failed", "waiting_approval", "waiting_input"].includes(childStatus)
      ) {
        const summary = `Chain halted at ${step.phase}: ${childStatus}${
          stepError ? ` — ${stepError}` : ""
        }`;
        await base44.asServiceRole.entities.AgentTask.update(parent.id, {
          status: childStatus,
          output_summary: summary,
          output_payload_json: {
            chain_version: CONTACT_LAST_CHAIN_VERSION,
            chain_mode: plan.mode,
            chain: plan.steps.map((row) => row.phase),
            steps: executed,
            halted_at_step: index,
            halt_reason: childStatus,
          },
          error: childStatus === "failed" ? stepError : null,
          completed_at: new Date().toISOString(),
        });
        await base44.asServiceRole.entities.Event.create({
          brand_id: "_platform",
          event_type: `chain.halted.${ORCHESTRATOR_NAME}`,
          source: ORCHESTRATOR_NAME,
          entity_type: "AgentTask",
          entity_id: parent.id,
          agent_task_id: parent.id,
          payload_json: {
            chain_version: CONTACT_LAST_CHAIN_VERSION,
            chain_mode: plan.mode,
            halted_at: step.phase,
            reason: childStatus,
            error: stepError,
            executed,
          },
          status: "pending",
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "leadOrchestrator",
            fallback: null,
            severity: "secondary",
          })
        );
        return Response.json({
          ok: true,
          parent_task_id: parent.id,
          status: "halted",
          chain_version: CONTACT_LAST_CHAIN_VERSION,
          chain_mode: plan.mode,
          halted_at: step.phase,
          reason: childStatus,
          executed,
          ...discoverySummary,
          created_ids: chainLeadIds,
          enrichment_ids: enrichmentLeadIds,
        });
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(parent.id, {
      status: "completed",
      output_summary:
        `Lead chain completed (${plan.mode}; ${plan.steps.length} exclusive steps)`,
      output_payload_json: {
        chain_version: CONTACT_LAST_CHAIN_VERSION,
        chain_mode: plan.mode,
        chain: plan.steps.map((step) => step.phase),
        steps: executed,
        discovery_summary: discoverySummary,
        created_ids: chainLeadIds,
        enrichment_ids: enrichmentLeadIds,
        double_run_prevented: true,
      },
      completed_at: new Date().toISOString(),
    });
    return Response.json({
      ok: true,
      parent_task_id: parent.id,
      status: "completed",
      chain_version: CONTACT_LAST_CHAIN_VERSION,
      chain_mode: plan.mode,
      executed,
      ...discoverySummary,
      created_ids: chainLeadIds,
      enrichment_ids: enrichmentLeadIds,
      double_run_prevented: true,
    });
  } catch (error: any) {
    if (parent?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(parent.id, {
          status: "failed",
          error: String(error?.message || error).slice(0, 200),
          completed_at: new Date().toISOString(),
        });
      } catch (_) { /* fail closed without masking original */ }
    }
    return internalErrorResponse(error, "leadOrchestrator");
  }
});
