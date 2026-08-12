import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

const AGENT_NAME = "qa";
const TASK_TYPE = "qa_flow_review";
const RISK_LEVEL = 1;

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'standard', maxTokens:2048, svc, eventKey, source:'qaAgent' })).text; }

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const flows = Array.isArray(body?.flows) && body.flows.length
      ? body.flows
      : ["analyzer_run", "stripe_connect", "deal_activation", "savings_report"];

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `QA review for flows: ${flows.join(", ")}`,
      started_at: new Date().toISOString(),
    });

    // Lightweight signal: recent failed tasks over last 7 days as regression signal
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentFailures = await base44.asServiceRole.entities.AgentTask
      .filter({ status: "failed", created_date: { $gte: since7d } }, "-created_date", 50)
      .catch((error:any)=>safeBestEffort(error,{operation:'qaAgent',fallback:[],severity:'secondary'}));

    const failureSummary = recentFailures.length
      ? recentFailures.slice(0, 10).map(t => `[${t.agent_name}] ${t.task_type}: ${(t.error || "").slice(0, 160)}`).join("\n")
      : "Sin fallos de agentes en últimos 7 días.";

    const prompt = [
      "Eres un QA engineer crítico revisando flujos de producto de CAMBRA.",
      "Para cada flujo listado, genera:",
      "1) 3-5 casos de test concretos (input, acción, resultado esperado)",
      "2) Posibles regressions a vigilar",
      "3) Severidad (alta/media/baja)",
      "Sé específico, no genérico. Español.",
      "",
      `Flujos: ${flows.join(", ")}`,
      "",
      "Señales recientes de fallos en agentes (últimos 7 días):",
      failureSummary,
    ].join("\n");

    const report = await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID());

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `QA report generated for ${flows.length} flow(s)`,
      output_payload_json: {
        flows,
        report,
        signals: { recent_failures_7d: recentFailures.length },
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, flows, report });
  } catch (error) {
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
    return internalErrorResponse(error, 'qaAgent');
  }
});
