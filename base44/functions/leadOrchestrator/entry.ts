import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';

const ORCHESTRATOR_NAME = "lead_orchestrator";
const TASK_TYPE = "orchestrate";

// Encadena: leadDiscovery → leadEnrichment → leadScoring → crmAgent
// Para si cualquier paso queda en failed/waiting_approval/waiting_input.

Deno.serve(async (req) => {
  let parent = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const icp = body?.icp || {};

    parent = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: ORCHESTRATOR_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: 1,
      input_summary: `Lead chain: discovery → enrichment → scoring → crm`,
      output_payload_json: { chain: ["leadDiscoveryAgent", "leadEnrichmentAgent", "leadScoringAgent", "crmAgent"], steps: [] },
      started_at: new Date().toISOString(),
    });

    const steps = [
      { name: "leadDiscoveryAgent", payload: { ...icp } },
      { name: "leadEnrichmentAgent", payload: {} },
      { name: "leadScoringAgent",    payload: {} },
      { name: "crmAgent",            payload: {} },
    ];

    const executed = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      let childTaskId = null;
      let childStatus = "unknown";
      let stepError = null;

      try {
        const internal = Deno.env.get('INTERNAL_CALL_SECRET') || '';
        const res = await base44.functions.invoke(step.name, { ...step.payload, internal_secret: internal });
        const data = res?.data || res || {};
        childTaskId = data.task_id || null;

        // Re-read the child AgentTask to know its real status (source of truth)
        if (childTaskId) {
          const child = await base44.asServiceRole.entities.AgentTask.get(childTaskId).catch(() => null);
          childStatus = child?.status || (data.ok === false ? "failed" : "completed");
        } else {
          childStatus = data.ok === false ? "failed" : "completed";
        }
        if (data.ok === false) stepError = data.error || "agent reported ok=false";
      } catch (e) {
        childStatus = "failed";
        stepError = e.message;
      }

      executed.push({ step: step.name, child_task_id: childTaskId, status: childStatus, error: stepError });

      const haltStatuses = ["failed", "waiting_approval", "waiting_input"];
      if (haltStatuses.includes(childStatus)) {
        const haltSummary = `Chain halted at step ${i + 1}/${steps.length} (${step.name}): ${childStatus}${stepError ? ` — ${stepError}` : ""}`;
        await base44.asServiceRole.entities.AgentTask.update(parent.id, {
          status: childStatus === "failed" ? "failed" : "waiting_approval",
          output_summary: haltSummary,
          output_payload_json: { chain: steps.map(s => s.name), steps: executed, halted_at_step: i, halt_reason: childStatus },
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
          payload_json: { halted_at: step.name, reason: childStatus, error: stepError, executed },
          status: "pending",
        }).catch(() => null);
        return Response.json({ ok: true, parent_task_id: parent.id, status: "halted", halted_at: step.name, reason: childStatus, executed });
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(parent.id, {
      status: "completed",
      output_summary: `Lead chain completed (${steps.length} steps)`,
      output_payload_json: { chain: steps.map(s => s.name), steps: executed },
      completed_at: new Date().toISOString(),
    });
    return Response.json({ ok: true, parent_task_id: parent.id, status: "completed", executed });
  } catch (error) {
    if (parent?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(parent.id, { status: "failed", error: error.message, completed_at: new Date().toISOString() });
      } catch (_) { /* swallow */ }
    }
    return Response.json({ ok: false, error: error.message, parent_task_id: parent?.id || null }, { status: 500 });
  }
});