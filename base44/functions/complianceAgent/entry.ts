import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';

const AGENT_NAME = "compliance";
const TASK_TYPE = "compliance_review";
const RISK_LEVEL = 1;
const LEGAL_DISCLAIMER = "⚠️ Análisis asistido por IA. NO es asesoramiento legal. Requiere revisión por un abogado humano antes de tomar cualquier decisión legal o de cumplimiento.";

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'high_reasoning', maxTokens:3000, svc, eventKey, source:'complianceAgent' })).text; }

function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

// L1 — vigila controles operativos del sistema. NUNCA decide ni bloquea. Solo alerta.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const windowHours = Number(body?.window_hours) || 24;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Compliance observation: process integrity since ${since}`,
      started_at: new Date().toISOString(),
    });

    // Pull recent AgentTasks and Approvals to check for protocol violations
    const recentTasks = await base44.asServiceRole.entities.AgentTask
      .list("-created_date", 200).catch(() => []);
    const recentInWindow = recentTasks.filter(t => t.created_date >= since);
    const recentApprovals = await base44.asServiceRole.entities.Approval
      .list("-created_date", 100).catch(() => []);
    const approvalsInWindow = recentApprovals.filter(a => a.created_date >= since);

    // Compute structural integrity signals BEFORE asking Claude
    // (these are deterministic — Claude only narrates them)
    const integrity = {
      l3_tasks_without_approval: recentInWindow.filter(t =>
        t.risk_level === 3 && !t.approval_id && t.status === "completed"
      ).map(t => ({ id: t.id, agent: t.agent_name, task_type: t.task_type })),
      l2_tasks_without_approval: recentInWindow.filter(t =>
        t.risk_level === 2 && !t.approval_id && t.status === "completed" && t.requires_approval
      ).map(t => ({ id: t.id, agent: t.agent_name, task_type: t.task_type })),
      approvals_approved_without_user: approvalsInWindow.filter(a =>
        a.status === "approved" && !a.approved_by
      ).map(a => ({ id: a.id, action_type: a.action_type })),
      failed_tasks_count: recentInWindow.filter(t => t.status === "failed").length,
      tasks_scanned: recentInWindow.length,
      approvals_scanned: approvalsInWindow.length,
    };

    const prompt = [
      "Eres analista de compliance operacional. Revisa señales estructurales del sistema de agentes.",
      "IMPORTANTE: NO decides nada. NO bloqueas nada. Solo ALERTAS con análisis.",
      "",
      "Áreas a vigilar:",
      "- Agentes L3 (acción externa) que se ejecutaron SIN Approval registrado → violación crítica del gate",
      "- Agentes L2 que requerían Approval y no lo tienen",
      "- Approvals aprobados sin usuario registrado (audit trail roto)",
      "- Tasa anormal de fallos",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"findings":[{"severity":"<info|warning|critical>","area":"<gate_violation|audit_trail|failure_rate|other>","summary":"<1-2 líneas>","affected_count":<num>,"recommendation":"<qué debería revisar humano>"}],"overall_assessment":"<2-3 líneas neutral>"}`,
      "",
      "Si una categoría tiene count=0, NO la incluyas en findings (no inventes problemas).",
      "",
      "SEÑALES ESTRUCTURALES:",
      JSON.stringify(integrity, null, 2),
    ].join("\n");

    const text = await callClaude(base44.asServiceRole, prompt, task?.id || crypto.randomUUID());
    const parsed = safeParseJSON(text) || { findings: [], overall_assessment: "Could not parse analysis" };
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

    const flagsEmitted = [];
    for (const f of findings) {
      if (f.severity === "warning" || f.severity === "critical") {
        const ev = await base44.asServiceRole.entities.Event.create({
          brand_id: "_platform",
          event_type: "legal.flag.raised",
          source: AGENT_NAME,
          entity_type: "AgentTask",
          entity_id: task.id,
          agent_task_id: task.id,
          payload_json: {
            cluster: "compliance",
            severity: f.severity,
            area: f.area,
            summary: f.summary,
            affected_count: f.affected_count,
            recommendation: f.recommendation,
            disclaimer: LEGAL_DISCLAIMER,
          },
          status: "pending",
        }).catch(() => null);
        if (ev) flagsEmitted.push(ev.id);
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Compliance: ${findings.length} findings — ${flagsEmitted.length} flags raised`,
      output_payload_json: {
        disclaimer: LEGAL_DISCLAIMER,
        findings,
        overall_assessment: parsed.overall_assessment,
        integrity_signals: integrity,
        flags_emitted: flagsEmitted,
        window_hours: windowHours,
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, findings_count: findings.length, flags_emitted: flagsEmitted.length, disclaimer: LEGAL_DISCLAIMER });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "failed", error: error.message, completed_at: new Date().toISOString() });
      } catch (_) { /* swallow */ }
    }
    return Response.json({ ok: false, error: error.message, task_id: task?.id || null }, { status: 500 });
  }
});
