import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ORCHESTRATOR_NAME = "outreach_orchestrator";
const TASK_TYPE = "orchestrate";

// Patrón: outreachAgent draft (siempre para en Approval L3) → al aprobar, llamar de nuevo con mode:execute → followUpAgent draft
// Este orchestrator SIEMPRE para en el primer Approval. La continuación es una segunda invocación tras approve.

Deno.serve(async (req) => {
  let parent = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const resume = body?.resume === true;
    const parentId = body?.parent_task_id || null;

    // ─── RESUME path: continúa una cadena ya parada en Approval ─────────
    if (resume && parentId) {
      parent = await base44.asServiceRole.entities.AgentTask.get(parentId).catch(() => null);
      if (!parent) return Response.json({ ok: false, error: "Parent task not found" }, { status: 404 });
      if (parent.agent_name !== ORCHESTRATOR_NAME) return Response.json({ ok: false, error: "Not an outreach chain" }, { status: 400 });

      const approvalId = body?.approval_id;
      if (!approvalId) return Response.json({ ok: false, error: "approval_id required to resume" }, { status: 400 });

      const ap = await base44.asServiceRole.entities.Approval.get(approvalId).catch(() => null);
      if (!ap) return Response.json({ ok: false, error: "Approval not found" }, { status: 404 });
      if (ap.status !== "approved") return Response.json({ ok: false, error: `Cannot resume: approval status="${ap.status}"`, gate: "blocked" }, { status: 403 });

      await base44.asServiceRole.entities.AgentTask.update(parent.id, { status: "running" });
      const prevSteps = parent.output_payload_json?.steps || [];

      // Execute outreach (gated por Approval)
      const executeStep = { step: "outreachAgent:execute", child_task_id: null, status: "unknown", error: null };
      try {
        const res = await base44.functions.invoke("outreachAgent", { mode: "execute", approval_id: approvalId });
        const data = res?.data || res || {};
        executeStep.child_task_id = data.task_id || ap.agent_task_id;
        executeStep.status = data.ok === false ? "failed" : "completed";
        if (data.ok === false) executeStep.error = data.error;
      } catch (e) { executeStep.status = "failed"; executeStep.error = e.message; }

      const allSteps = [...prevSteps, executeStep];
      if (executeStep.status === "failed") {
        await base44.asServiceRole.entities.AgentTask.update(parent.id, {
          status: "failed",
          output_summary: `Chain halted at outreach execute: ${executeStep.error}`,
          output_payload_json: { ...parent.output_payload_json, steps: allSteps, halted_at_step: prevSteps.length },
          error: executeStep.error,
          completed_at: new Date().toISOString(),
        });
        return Response.json({ ok: true, parent_task_id: parent.id, status: "halted", halted_at: "outreachAgent:execute" });
      }

      // followUp draft → siempre creará otro Approval → cadena vuelve a parar
      const followStep = { step: "followUpAgent:draft", child_task_id: null, status: "unknown", error: null };
      try {
        const res = await base44.functions.invoke("followUpAgent", { lead_id: ap.draft_payload_json?.lead_id });
        const data = res?.data || res || {};
        followStep.child_task_id = data.task_id || null;
        if (data.task_id) {
          const child = await base44.asServiceRole.entities.AgentTask.get(data.task_id).catch(() => null);
          followStep.status = child?.status || (data.ok === false ? "failed" : "completed");
        } else {
          followStep.status = data.ok === false ? "failed" : "completed";
        }
        if (data.ok === false) followStep.error = data.error;
      } catch (e) { followStep.status = "failed"; followStep.error = e.message; }

      const finalSteps = [...allSteps, followStep];
      const haltStatuses = ["failed", "waiting_approval", "waiting_input"];
      const parentStatus = haltStatuses.includes(followStep.status)
        ? (followStep.status === "failed" ? "failed" : "waiting_approval")
        : "completed";

      await base44.asServiceRole.entities.AgentTask.update(parent.id, {
        status: parentStatus,
        output_summary: parentStatus === "completed"
          ? "Outreach chain completed (outreach sent + followup drafted)"
          : `Chain halted at followUpAgent: ${followStep.status}${followStep.error ? " — " + followStep.error : ""}`,
        output_payload_json: { ...parent.output_payload_json, steps: finalSteps },
        completed_at: new Date().toISOString(),
      });

      if (parentStatus !== "completed") {
        await base44.asServiceRole.entities.Event.create({
          brand_id: "_platform",
          event_type: `chain.halted.${ORCHESTRATOR_NAME}`,
          source: ORCHESTRATOR_NAME,
          entity_type: "AgentTask",
          entity_id: parent.id,
          agent_task_id: parent.id,
          payload_json: { halted_at: "followUpAgent", reason: followStep.status, error: followStep.error },
          status: "pending",
        }).catch(() => null);
      }
      return Response.json({ ok: true, parent_task_id: parent.id, status: parentStatus === "completed" ? "completed" : "halted" });
    }

    // ─── START path: pick high-score lead → outreach draft → HALT ───────
    let leadId = body?.lead_id || null;
    if (!leadId) {
      const leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ stage: "scored" }, "-score", 1).catch(() => []);
      leadId = leads[0]?.id || null;
    }
    if (!leadId) return Response.json({ ok: false, error: "No scored OutboundLead found and no lead_id provided" }, { status: 400 });

    parent = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: ORCHESTRATOR_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: 1,
      input_summary: `Outreach chain for lead ${leadId}: outreach.draft → [APPROVAL] → execute → followup.draft → [APPROVAL]`,
      output_payload_json: { chain: ["outreachAgent:draft", "outreachAgent:execute", "followUpAgent:draft"], steps: [], lead_id: leadId },
      started_at: new Date().toISOString(),
    });

    const draftStep = { step: "outreachAgent:draft", child_task_id: null, status: "unknown", error: null, approval_id: null };
    try {
      const res = await base44.functions.invoke("outreachAgent", { lead_id: leadId });
      const data = res?.data || res || {};
      draftStep.child_task_id = data.task_id || null;
      draftStep.approval_id = data.approval_id || null;
      if (data.task_id) {
        const child = await base44.asServiceRole.entities.AgentTask.get(data.task_id).catch(() => null);
        draftStep.status = child?.status || (data.ok === false ? "failed" : "waiting_approval");
      } else {
        draftStep.status = data.ok === false ? "failed" : "waiting_approval";
      }
      if (data.ok === false) draftStep.error = data.error;
    } catch (e) { draftStep.status = "failed"; draftStep.error = e.message; }

    const haltStatuses = ["failed", "waiting_approval", "waiting_input"];
    const isHalted = haltStatuses.includes(draftStep.status);
    const parentStatus = draftStep.status === "failed" ? "failed" : "waiting_approval";

    await base44.asServiceRole.entities.AgentTask.update(parent.id, {
      status: parentStatus,
      output_summary: isHalted
        ? `Chain halted at outreach draft: ${draftStep.status === "waiting_approval" ? "awaiting approval" : draftStep.error}`
        : "Outreach draft created",
      output_payload_json: { ...parent.output_payload_json, steps: [draftStep], halted_at_step: 0, halt_reason: draftStep.status, pending_approval_id: draftStep.approval_id },
      error: draftStep.status === "failed" ? draftStep.error : null,
      completed_at: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.Event.create({
      brand_id: "_platform",
      event_type: `chain.halted.${ORCHESTRATOR_NAME}`,
      source: ORCHESTRATOR_NAME,
      entity_type: "AgentTask",
      entity_id: parent.id,
      agent_task_id: parent.id,
      payload_json: { halted_at: "outreachAgent:draft", reason: draftStep.status, approval_id: draftStep.approval_id, lead_id: leadId },
      status: "pending",
    }).catch(() => null);

    return Response.json({ ok: true, parent_task_id: parent.id, status: "halted", halted_at: "outreachAgent:draft", reason: draftStep.status, approval_id: draftStep.approval_id });
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