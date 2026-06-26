import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "security";
const TASK_TYPE = "security_review";
const RISK_LEVEL = 1;
const ENG_DISCLAIMER = "⚠️ Fix propuesto por IA. Revisa el diff antes de aprobar. Aplicar cambios de código tiene riesgo — verifica que entiendes el cambio.";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

// L1 — DETECTA seguridad, no APLICA. Misma garantía estructural que codeReviewAgent.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const codeSnippets = Array.isArray(body?.code_snippets) ? body.code_snippets : [];

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Security review: ${codeSnippets.length} snippets`,
      started_at: new Date().toISOString(),
    });

    if (codeSnippets.length === 0) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "Security review: no snippets provided",
        output_payload_json: { disclaimer: ENG_DISCLAIMER, findings: [] },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, findings_count: 0 });
    }

    const prompt = [
      "Eres auditor de seguridad senior para CAMBRA (datos financieros + GDPR en France — categoría sensible).",
      "",
      "Áreas a vigilar:",
      "- tenant_isolation: queries .list() / .filter() sin brand_id o created_by → cualquier usuario lee data de otro tenant",
      "- exposed_data: datos personales o financieros expuestos en responses, logs, o entregados a usuarios no-admin",
      "- auth: endpoints sin auth.me() o sin check de role en operaciones admin/sensibles",
      "- secrets: API keys, tokens o secrets hardcodeados en código en vez de Deno.env.get",
      "- injection: inputs sin validar usados en queries o llamadas externas",
      "",
      "Para CAMBRA (financiero + GDPR): cualquier fuga de tenant o de PII = severity 'critical'.",
      "",
      "IMPORTANTE: NO aplicas cambios. Solo PROPONES fixes con diff exacto.",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"findings":[{"id":"<slug>","file":"<path>","location":"<línea o función>","security_category":"<tenant_isolation|exposed_data|auth|secrets|injection>","severity":"<info|warning|critical>","problem_description":"<2-3 líneas>","proposed_fix_diff":"<diff before/after>","risk_of_applying":"<low|medium|high>","risk_explanation":"<por qué>"}],"summary":"<2 líneas>"}`,
      "",
      "Si no hay hallazgos: findings: [].",
      "",
      "CÓDIGO A AUDITAR:",
      ...codeSnippets.map((s, i) => `--- Snippet ${i + 1} (${s.file || "unknown"}) ---\n${(s.content || "").slice(0, 4000)}`),
    ].join("\n");

    const text = await callClaude(prompt);
    const parsed = safeParseJSON(text) || { findings: [], summary: "Could not parse" };
    const findings = (Array.isArray(parsed.findings) ? parsed.findings : []).map(f => ({
      ...f,
      source_agent: AGENT_NAME,
      detected_at: new Date().toISOString(),
    }));

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Security: ${findings.length} findings (${findings.filter(f => f.severity === "critical").length} critical)`,
      output_payload_json: { disclaimer: ENG_DISCLAIMER, findings, summary: parsed.summary, snippets_reviewed: codeSnippets.length },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, findings_count: findings.length, disclaimer: ENG_DISCLAIMER });
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