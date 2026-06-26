import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "founder_copilot";
const TASK_TYPE = "daily_brief";
const RISK_LEVEL = 0;

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
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

    // 1) Create AgentTask in running state
    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: "Daily founder brief — pending approvals + failed tasks 24h + active brands",
      started_at: new Date().toISOString(),
    });

    // 2) Collect inputs via service role
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [pendingApprovals, failedTasks, activeBrands] = await Promise.all([
      base44.asServiceRole.entities.Approval
        .filter({ status: "pending" }, "created_date", 100).catch(() => []),
      base44.asServiceRole.entities.AgentTask
        .filter({ status: "failed", created_date: { $gte: since24h } }, "-created_date", 100).catch(() => []),
      base44.asServiceRole.entities.Brand
        .list("-updated_date", 50).catch(() => []),
    ]);

    const approvalsCount = pendingApprovals.length;
    const approvalsByRisk = {
      L4: pendingApprovals.filter(a => a.risk_level === 4).length,
      L3: pendingApprovals.filter(a => a.risk_level === 3).length,
      L2: pendingApprovals.filter(a => a.risk_level === 2).length,
    };
    const failedCount = failedTasks.length;
    const failedAgents = [...new Set(failedTasks.map(t => t.agent_name).filter(Boolean))];
    const brandsSample = activeBrands.slice(0, 20).map(b => ({
      name: b.name || b.brand_name || b.id,
      next_action: b.next_action || null,
      stage: b.stage || null,
    }));

    // 3) Compose prompt
    const prompt = [
      "Eres el copilot de un founder solo construyendo CAMBRA (infraestructura económica para ecommerce independientes).",
      "Genera un brief diario en español, máximo 300 palabras, formato estricto:",
      "🔴 Urgente — qué exige decisión hoy",
      "🟡 Atención — qué vigilar esta semana",
      "🟢 Pipeline — qué progresa solo",
      "📋 Hoy — 3 a 5 acciones concretas, en orden de impacto",
      "",
      "Tono: directo, sin hype, sin emojis extra fuera del formato. Cero relleno.",
      "",
      "DATOS DE HOY:",
      `- Approvals pendientes: ${approvalsCount} (L4 financiero/legal: ${approvalsByRisk.L4}, L3 externo: ${approvalsByRisk.L3}, L2 client-visible: ${approvalsByRisk.L2})`,
      pendingApprovals.length
        ? `- Tipos de acción pendientes: ${pendingApprovals.slice(0, 10).map(a => a.action_type).join(", ")}`
        : "- Sin approvals pendientes",
      `- Tasks fallidos últimas 24h: ${failedCount}${failedAgents.length ? ` (agentes: ${failedAgents.join(", ")})` : ""}`,
      failedTasks.slice(0, 5).length
        ? `- Errores recientes: ${failedTasks.slice(0, 5).map(t => `[${t.agent_name}] ${(t.error || "").slice(0, 120)}`).join(" | ")}`
        : "",
      `- Brands activos (muestra ${brandsSample.length}): ${brandsSample.map(b => `${b.name}${b.next_action ? ` → ${b.next_action}` : ""}`).join("; ") || "ninguno"}`,
    ].filter(Boolean).join("\n");

    // 4) Call Claude
    const brief = await callClaude(prompt);

    // 5) Mark task completed
    const output = {
      brief,
      counts: {
        pending_approvals: approvalsCount,
        approvals_by_risk: approvalsByRisk,
        failed_tasks_24h: failedCount,
        active_brands_sample: brandsSample.length,
      },
      generated_at: new Date().toISOString(),
    };

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Daily brief generated · ${approvalsCount} approvals · ${failedCount} failed 24h`,
      output_payload_json: output,
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, brief, counts: output.counts });
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