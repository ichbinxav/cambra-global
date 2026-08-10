import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const AGENT_NAME = "qa_monitor";
const TASK_TYPE = "qa_monitor";
const RISK_LEVEL = 1;
const ENG_DISCLAIMER = "⚠️ Fix propuesto por IA. Revísalo antes de dárselo a Base44.";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
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

// L1 — vigila runtime. NO APLICA fixes. Solo detecta patrones de fallo.
// Lee AgentTask (failed) + Event log. NUNCA escribe código.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const windowHours = Number(body?.window_hours) || 12;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `QA monitor: runtime since ${since}`,
      started_at: new Date().toISOString(),
    });

    // Read failed AgentTasks in window
    const recentTasks = await base44.asServiceRole.entities.AgentTask
      .list("-created_date", 500).catch(() => []);
    const tasksInWindow = recentTasks.filter(t => t.created_date >= since);
    const failedTasks = tasksInWindow.filter(t => t.status === "failed");
    const recentEvents = await base44.asServiceRole.entities.Event
      .list("-created_date", 300).catch(() => []);
    const failedEvents = recentEvents.filter(e =>
      e.created_date >= since && (e.status === "failed" || (e.event_type || "").includes("error") || (e.event_type || "").includes("failed"))
    );

    // Deterministic aggregation: group by agent_name + first 100 chars of error
    const errorBuckets = {};
    for (const t of failedTasks) {
      const key = `${t.agent_name || "unknown"}::${(t.error || "no_error_msg").slice(0, 100)}`;
      if (!errorBuckets[key]) errorBuckets[key] = { agent_name: t.agent_name, error_pattern: (t.error || "").slice(0, 200), count: 0, sample_ids: [] };
      errorBuckets[key].count += 1;
      if (errorBuckets[key].sample_ids.length < 3) errorBuckets[key].sample_ids.push(t.id);
    }
    const aggregated = Object.values(errorBuckets).sort((a, b) => b.count - a.count);
    const totalRuns = tasksInWindow.length;
    const overallFailureRate = totalRuns > 0 ? (failedTasks.length / totalRuns) : 0;

    if (aggregated.length === 0 && failedEvents.length === 0) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: `QA monitor: no failures in last ${windowHours}h (${totalRuns} runs)`,
        output_payload_json: { disclaimer: ENG_DISCLAIMER, findings: [], total_runs: totalRuns, failure_rate: 0, window_hours: windowHours },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, findings_count: 0 });
    }

    const prompt = [
      "Eres analista de QA/observabilidad. Te paso patrones de fallo agregados de un sistema de agentes.",
      "IMPORTANTE: NO aplicas fixes. NO tienes acceso de escritura al repo. Solo PROPONES con diff + ready_to_paste_prompt cuando tengas alta confianza (si no, sugiere investigación con investigation_steps en vez de fix).",
      "Para cada patrón de fallo identifica: causa probable, severidad, y si propones fix, el diff exacto y un ready_to_paste_prompt.",
      "- ready_to_paste_prompt: instrucción lista para pegar al builder de Base44. Empieza con 'En functions/<nombre>, …' o equivalente. NO pegues el diff dentro.",
      "Sé conservador: runtime fixes son los más arriesgados — prefiere 'risk_of_applying: high' por defecto.",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"findings":[{"id":"<slug>","affected_function":"<nombre>","failure_count":<num>,"failure_rate":<0..1>,"pattern":"<error pattern>","severity":"<info|warning|critical>","probable_cause":"<2 líneas>","proposed_fix_diff":"<diff o null si no propones fix>","ready_to_paste_prompt":"<instrucción para Base44 o null si solo es investigación>","investigation_steps":"<pasos sugeridos si no hay fix claro, o null>","risk_of_applying":"<low|medium|high>","risk_explanation":"<por qué>"}],"summary":"<2 líneas>"}`,
      "",
      `Total runs en ventana: ${totalRuns}, failure rate: ${(overallFailureRate * 100).toFixed(1)}%`,
      "Failure patterns agregados:",
      JSON.stringify(aggregated.slice(0, 15), null, 2),
      `Failed events (${failedEvents.length}):`,
      JSON.stringify(failedEvents.slice(0, 10).map(e => ({ event_type: e.event_type, source: e.source, error: e.error })), null, 2),
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
      output_summary: `QA monitor: ${findings.length} findings · ${failedTasks.length} failed tasks · ${(overallFailureRate * 100).toFixed(1)}% failure rate`,
      output_payload_json: {
        disclaimer: ENG_DISCLAIMER,
        findings,
        summary: parsed.summary,
        total_runs: totalRuns,
        failed_tasks: failedTasks.length,
        failure_rate: overallFailureRate,
        window_hours: windowHours,
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, findings_count: findings.length, failure_rate: overallFailureRate });
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