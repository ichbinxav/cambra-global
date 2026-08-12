import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

const ORCHESTRATOR_NAME = "marketing_orchestrator";
const TASK_TYPE = "orchestrate";

const AGENT_MAP = {
  linkedin:   "linkedinAgent",
  x:          "xTwitterAgent",
  twitter:    "xTwitterAgent",
  blog:       "blogAgent",
  newsletter: "newsletterAgent",
  seo:        "seoAgent",
};

// Encadena los agentes de marketing seleccionados sobre un MISMO topic/theme.
// Cada L2 crea su propio Approval → cadena PARA en cada uno.

Deno.serve(async (req) => {
  let parent = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const requested = Array.isArray(body?.agents) && body.agents.length ? body.agents : ["linkedin", "x"];
    const topic = body?.topic || body?.theme || "infraestructura económica de los ecommerce independientes";

    const chain = [];
    for (const a of requested) {
      const fnName = AGENT_MAP[String(a).toLowerCase()];
      if (fnName) chain.push({ key: a, function: fnName });
    }
    if (chain.length === 0) return Response.json({ ok: false, error: "No valid agents in input" }, { status: 400 });

    parent = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: ORCHESTRATOR_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: 1,
      input_summary: `Marketing chain over topic "${topic}": ${chain.map(c => c.function).join(" → ")}`,
      output_payload_json: { chain: chain.map(c => c.function), steps: [], topic },
      started_at: new Date().toISOString(),
    });

    const executed = [];
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      const stepEntry = { step: step.function, child_task_id: null, status: "unknown", error: null, approval_id: null };

      // Map topic to each agent's expected input field
      const payload = step.function === "newsletterAgent" ? { theme: topic }
        : step.function === "blogAgent"                   ? { topic, category: "infrastructure" }
        : step.function === "seoAgent"                    ? { keywords: [topic] }
        : { topic };

      try {
        const res = await base44.functions.invoke(step.function, payload);
        const data = res?.data || res || {};
        stepEntry.child_task_id = data.task_id || null;
        stepEntry.approval_id = data.approval_id || null;
        if (data.task_id) {
          const child = await base44.asServiceRole.entities.AgentTask.get(data.task_id).catch((error:any)=>safeBestEffort(error,{operation:'marketingOrchestrator',fallback:null,severity:'secondary'}));
          stepEntry.status = child?.status || (data.ok === false ? "failed" : "completed");
        } else {
          stepEntry.status = data.ok === false ? "failed" : "completed";
        }
        if (data.ok === false) stepEntry.error = data.error;
      } catch (e) { stepEntry.status = "failed"; stepEntry.error = e.message; }

      executed.push(stepEntry);

      const haltStatuses = ["failed", "waiting_approval", "waiting_input"];
      if (haltStatuses.includes(stepEntry.status)) {
        const parentStatus = stepEntry.status === "failed" ? "failed" : "waiting_approval";
        await base44.asServiceRole.entities.AgentTask.update(parent.id, {
          status: parentStatus,
          output_summary: `Chain halted at step ${i + 1}/${chain.length} (${step.function}): ${stepEntry.status}${stepEntry.error ? " — " + stepEntry.error : ""}`,
          output_payload_json: { ...parent.output_payload_json, steps: executed, halted_at_step: i, halt_reason: stepEntry.status, pending_approval_id: stepEntry.approval_id },
          error: stepEntry.status === "failed" ? stepEntry.error : null,
          completed_at: new Date().toISOString(),
        });
        await base44.asServiceRole.entities.Event.create({
          brand_id: "_platform",
          event_type: `chain.halted.${ORCHESTRATOR_NAME}`,
          source: ORCHESTRATOR_NAME,
          entity_type: "AgentTask",
          entity_id: parent.id,
          agent_task_id: parent.id,
          payload_json: { halted_at: step.function, reason: stepEntry.status, approval_id: stepEntry.approval_id, topic, step_index: i },
          status: "pending",
        }).catch((error:any)=>safeBestEffort(error,{operation:'marketingOrchestrator',fallback:null,severity:'secondary'}));
        return Response.json({ ok: true, parent_task_id: parent.id, status: "halted", halted_at: step.function, reason: stepEntry.status, approval_id: stepEntry.approval_id, executed });
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(parent.id, {
      status: "completed",
      output_summary: `Marketing chain completed (${chain.length} agents)`,
      output_payload_json: { ...parent.output_payload_json, steps: executed },
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
    return internalErrorResponse(error, 'marketingOrchestrator');
  }
});