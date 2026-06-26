import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ORCHESTRATOR_NAME = "research_orchestrator";
const TASK_TYPE = "orchestrate";

// Encadena: competitorMonitor → providerResearch → providerMonitor (todos L1, sin Approval).
// Corre entera salvo fallo. Resume todo en un Event para el Copilot.

Deno.serve(async (req) => {
  let parent = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const providerToResearch = body?.provider_name || "Stripe";
    const providerCategory = body?.category || "payments";
    const providerCountry = body?.country || "Spain";

    parent = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: ORCHESTRATOR_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: 1,
      input_summary: `Research chain: competitor monitor → provider research (${providerToResearch}) → provider monitor`,
      output_payload_json: { chain: ["competitorMonitorAgent", "providerResearchAgent", "providerMonitorAgent"], steps: [] },
      started_at: new Date().toISOString(),
    });

    const steps = [
      { name: "competitorMonitorAgent", payload: body?.competitors ? { competitors: body.competitors } : {} },
      { name: "providerResearchAgent",  payload: { provider_name: providerToResearch, category: providerCategory, country: providerCountry } },
      { name: "providerMonitorAgent",   payload: {} },
    ];

    const executed = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepEntry = { step: step.name, child_task_id: null, status: "unknown", error: null, output_summary: null };
      try {
        const res = await base44.functions.invoke(step.name, step.payload);
        const data = res?.data || res || {};
        stepEntry.child_task_id = data.task_id || null;
        if (data.task_id) {
          const child = await base44.asServiceRole.entities.AgentTask.get(data.task_id).catch(() => null);
          stepEntry.status = child?.status || (data.ok === false ? "failed" : "completed");
          stepEntry.output_summary = child?.output_summary || null;
        } else {
          stepEntry.status = data.ok === false ? "failed" : "completed";
        }
        if (data.ok === false) stepEntry.error = data.error;
      } catch (e) { stepEntry.status = "failed"; stepEntry.error = e.message; }

      executed.push(stepEntry);

      if (stepEntry.status === "failed") {
        await base44.asServiceRole.entities.AgentTask.update(parent.id, {
          status: "failed",
          output_summary: `Chain halted at step ${i + 1}/${steps.length} (${step.name}): ${stepEntry.error}`,
          output_payload_json: { ...parent.output_payload_json, steps: executed, halted_at_step: i, halt_reason: "failed" },
          error: stepEntry.error,
          completed_at: new Date().toISOString(),
        });
        await base44.asServiceRole.entities.Event.create({
          brand_id: "_platform",
          event_type: `chain.halted.${ORCHESTRATOR_NAME}`,
          source: ORCHESTRATOR_NAME,
          entity_type: "AgentTask",
          entity_id: parent.id,
          agent_task_id: parent.id,
          payload_json: { halted_at: step.name, reason: "failed", error: stepEntry.error, executed },
          status: "pending",
        }).catch(() => null);
        return Response.json({ ok: true, parent_task_id: parent.id, status: "halted", halted_at: step.name, executed });
      }
    }

    // All 3 OK — emit a single research.bundle.completed Event for the Copilot
    await base44.asServiceRole.entities.AgentTask.update(parent.id, {
      status: "completed",
      output_summary: `Research chain completed: ${executed.map(s => s.step.replace("Agent","")).join(" → ")}`,
      output_payload_json: { ...parent.output_payload_json, steps: executed },
      completed_at: new Date().toISOString(),
    });
    await base44.asServiceRole.entities.Event.create({
      brand_id: "_platform",
      event_type: "research.bundle.completed",
      source: ORCHESTRATOR_NAME,
      entity_type: "AgentTask",
      entity_id: parent.id,
      agent_task_id: parent.id,
      payload_json: {
        competitor_task: executed[0]?.child_task_id,
        provider_research_task: executed[1]?.child_task_id,
        provider_monitor_task: executed[2]?.child_task_id,
        summaries: executed.map(s => ({ step: s.step, summary: s.output_summary })),
      },
      status: "pending",
    }).catch(() => null);

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