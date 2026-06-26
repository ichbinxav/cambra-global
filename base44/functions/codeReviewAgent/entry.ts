import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "code_review";
const TASK_TYPE = "code_review";
const RISK_LEVEL = 1;
const ENG_DISCLAIMER = "⚠️ Fix propuesto por IA. Revísalo antes de dárselo a Base44.";

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

// L1 — DETECTA, no APLICA. Esta function NO tiene ninguna llamada que escriba código.
// Sólo crea una AgentTask con findings[]. El engineeringReportAgent los consolida en Approvals.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const codeSnippets = Array.isArray(body?.code_snippets) ? body.code_snippets : [];
    const focusAreas = body?.focus_areas || "general code quality, anti-patterns, business logic in frontend, duplicated calculations, single source of truth violations";

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Code review: ${codeSnippets.length} snippets, focus: ${focusAreas.slice(0, 80)}`,
      started_at: new Date().toISOString(),
    });

    if (codeSnippets.length === 0) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "Code review: no snippets provided",
        output_payload_json: { disclaimer: ENG_DISCLAIMER, findings: [] },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, findings_count: 0 });
    }

    const prompt = [
      "Eres revisor senior de código para CAMBRA (plataforma React + Tailwind + Deno backend functions + Base44 SDK).",
      "Reglas del Architecture Bible que debes vigilar:",
      "- Single source of truth: misma lógica de negocio no debe estar duplicada en frontend y backend",
      "- Cálculos financieros/benchmarks viven en backend (scoreEngine.js), nunca en componentes",
      "- Tenant isolation: queries por brand_id o created_by",
      "- No hardcodeo de IDs, secrets ni configuración de entorno en componentes",
      `Focus extra del usuario: ${focusAreas}`,
      "",
      "IMPORTANTE: NO aplicas cambios. NO tienes acceso de escritura al repo. Solo PROPONES fixes que el founder llevará a Base44 manualmente.",
      "Para cada hallazgo da un diff EXACTO (formato unified diff o bloque before/after) Y un ready_to_paste_prompt:",
      "- ready_to_paste_prompt: texto en español que el founder copia tal cual y pega en Base44 builder chat. Debe empezar con la instrucción concreta ('En <file>, ...'), incluir el contexto del problema en 1-2 líneas, y pedir el cambio específico. NO incluyas el diff entero dentro del prompt — Base44 trabaja mejor con instrucciones que con diffs literales.",
      "Sé conservador: si no estás seguro, severity='info', no 'critical'.",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"findings":[{"id":"<slug-único>","file":"<path o snippet name>","location":"<línea o función>","severity":"<info|warning|critical>","problem_description":"<2-3 líneas>","proposed_fix_diff":"<diff before/after>","ready_to_paste_prompt":"<instrucción lista para pegar a Base44>","risk_of_applying":"<low|medium|high>","risk_explanation":"<por qué ese nivel de riesgo>"}],"summary":"<2 líneas>"}`,
      "",
      "Si no hay hallazgos, findings: [].",
      "",
      "CÓDIGO A REVISAR:",
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
      output_summary: `Code review: ${findings.length} findings (${findings.filter(f => f.severity === "critical").length} critical)`,
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