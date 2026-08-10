import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const AGENT_NAME = "investor_update";
const TASK_TYPE = "draft_investor_update";
const RISK_LEVEL = 2;
const ACTION_TYPE = "send_investor_update";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_STANDARD_MODEL')||'claude-sonnet-5',
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const month = Number.isInteger(body?.month) ? body.month : now.getUTCMonth() + 1;
    const year = Number.isInteger(body?.year) ? body.year : now.getUTCFullYear();

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: true,
      risk_level: RISK_LEVEL,
      input_summary: `Investor update draft for ${year}-${String(month).padStart(2, "0")}`,
      started_at: new Date().toISOString(),
    });

    // Period bounds (UTC)
    const periodStart = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const periodEnd = new Date(Date.UTC(year, month, 1)).toISOString();

    // Collect metrics
    const [brands, savingsReports, activations, completedTasks] = await Promise.all([
      base44.asServiceRole.entities.Brand.list("-updated_date", 500).catch(() => []),
      base44.asServiceRole.entities.MonthlySavingsReport
        .filter({ created_date: { $gte: periodStart, $lt: periodEnd } }, "-created_date", 500).catch(() => []),
      base44.asServiceRole.entities.DealActivation
        .filter({ created_date: { $gte: periodStart, $lt: periodEnd } }, "-created_date", 500).catch(() => []),
      base44.asServiceRole.entities.AgentTask
        .filter({ status: "completed", created_date: { $gte: periodStart, $lt: periodEnd } }, "-created_date", 500).catch(() => []),
    ]);

    const sum = (arr, key) => arr.reduce((s, x) => s + (Number(x?.[key]) || 0), 0);
    const metrics = {
      period: `${year}-${String(month).padStart(2, "0")}`,
      active_brands: brands.length,
      savings_reports_count: savingsReports.length,
      total_savings_eur: Math.round(sum(savingsReports, "total_savings_eur") || sum(savingsReports, "total_savings") || 0),
      deal_activations: activations.length,
      revenue_pipeline_eur: Math.round(sum(activations, "estimated_savings") || 0),
      tasks_completed: completedTasks.length,
    };

    const prompt = [
      "Redacta un investor update mensual para CAMBRA (infraestructura económica para ecommerce independientes).",
      "Tono: founder honesto, datos primero, sin hype, máx 500 palabras. Español.",
      "Estructura: (1) Resumen 2 líneas. (2) Métricas clave con números. (3) Wins del mes. (4) Lo que no funcionó / lo que aprendimos. (5) Foco del próximo mes. (6) Ask al inversor si aplica.",
      "",
      `Periodo: ${metrics.period}`,
      `Brands activos: ${metrics.active_brands}`,
      `Savings reports generados: ${metrics.savings_reports_count}`,
      `Total savings identificados (EUR): ${metrics.total_savings_eur.toLocaleString()}`,
      `Deal activations: ${metrics.deal_activations}`,
      `Revenue pipeline (EUR): ${metrics.revenue_pipeline_eur.toLocaleString()}`,
      `Tasks de agentes completados: ${metrics.tasks_completed}`,
    ].join("\n");

    const draft = await callClaude(prompt);

    // Create Approval
    const approval = await base44.asServiceRole.entities.Approval.create({
      brand_id: "_platform",
      agent_task_id: task.id,
      action_type: ACTION_TYPE,
      risk_level: RISK_LEVEL,
      draft_content: draft,
      draft_payload_json: { metrics, period: metrics.period },
      status: "pending",
    });

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "waiting_approval",
      requires_approval: true,
      approval_id: approval.id,
      output_summary: `Investor update drafted for ${metrics.period} · awaiting approval`,
      output_payload_json: { metrics },
    });

    return Response.json({ ok: true, task_id: task.id, approval_id: approval.id, period: metrics.period, metrics });
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
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});