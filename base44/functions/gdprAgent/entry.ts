import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const AGENT_NAME = "gdpr";
const TASK_TYPE = "gdpr_review";
const RISK_LEVEL = 1;
const LEGAL_DISCLAIMER = "⚠️ Análisis asistido por IA. NO es asesoramiento legal. Requiere revisión por un abogado humano antes de tomar cualquier decisión legal o de cumplimiento.";

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_STANDARD_MODEL')||'claude-sonnet-5', max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
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

// L1 — ALERTA, no DECIDE. Observa eventos recientes de manejo de datos personales.
// NUNCA crea Approval. NUNCA tiene mode:execute. Solo emite legal.flag.raised events.
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
      input_summary: `GDPR observation: events since ${since}`,
      started_at: new Date().toISOString(),
    });

    // Pull recent events that touched personal data
    const recentEvents = await base44.asServiceRole.entities.Event
      .list("-created_date", 200).catch(() => []);
    const dataTouchingEvents = recentEvents.filter(ev => {
      if (ev.created_date < since) return false;
      const t = ev.event_type || "";
      const s = ev.source || "";
      return t.includes("lead") || t.includes("outreach") || t.includes("crm")
        || t.includes("contact") || t.includes("newsletter") || t.includes("enrichment")
        || s.includes("lead") || s.includes("outreach") || s.includes("crm");
    }).slice(0, 50);

    // Also pull recent OutboundLeads to check consent/source basis
    const recentLeads = await base44.asServiceRole.entities.OutboundLead
      .list("-created_date", 50).catch(() => []);
    const newLeads = recentLeads.filter(l => l.created_date >= since);

    if (dataTouchingEvents.length === 0 && newLeads.length === 0) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "GDPR observation: no data-touching events in window",
        output_payload_json: { disclaimer: LEGAL_DISCLAIMER, findings: [], events_scanned: 0, leads_scanned: 0, window_hours: windowHours },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, findings_count: 0, disclaimer: LEGAL_DISCLAIMER });
    }

    const prompt = [
      "Eres analista de cumplimiento GDPR. Observas eventos recientes de un sistema de agentes que manejan datos personales (leads, opt-ins, CRM).",
      "Para CADA hallazgo de riesgo, devuelve severidad (info/warning/critical) y un análisis breve.",
      "Áreas a vigilar:",
      "- Base legal del procesamiento (consentimiento, interés legítimo, contrato)",
      "- Consentimiento explícito para marketing/newsletter",
      "- Origen de los leads (¿se obtuvieron lícitamente?)",
      "- Retención (¿hay leads viejos que deberían eliminarse?)",
      "- Transferencias internacionales (EU/US)",
      "- Derecho de acceso/borrado",
      "",
      "IMPORTANTE: NO decidas nada. NO autorices nada. Solo ALERTA con análisis razonado.",
      "",
      "Devuelve SOLO JSON con shape:",
      `{"findings":[{"severity":"<info|warning|critical>","area":"<base_legal|consent|source|retention|transfer|rights>","summary":"<1-2 líneas>","affected_entity_type":"<OutboundLead|Lead|Event|other>","affected_entity_id":"<id o null>","recommendation":"<qué debería revisar un humano>"}],"overall_assessment":"<2-3 líneas, neutral>"}`,
      "",
      "DATOS A REVISAR:",
      `Eventos (${dataTouchingEvents.length}):`,
      JSON.stringify(dataTouchingEvents.map(e => ({ type: e.event_type, source: e.source, payload: e.payload_json })).slice(0, 20)),
      `Leads nuevos (${newLeads.length}):`,
      JSON.stringify(newLeads.map(l => ({ id: l.id, source: l.source, email: l.contact_email ? "[REDACTED]" : null, country: l.country, stage: l.stage })).slice(0, 20)),
    ].join("\n");

    const text = await callClaude(prompt);
    const parsed = safeParseJSON(text) || { findings: [], overall_assessment: "Could not parse analysis" };
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

    // Emit a legal.flag.raised Event for each warning/critical finding
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
            cluster: "gdpr",
            severity: f.severity,
            area: f.area,
            summary: f.summary,
            recommendation: f.recommendation,
            affected_entity_type: f.affected_entity_type,
            affected_entity_id: f.affected_entity_id,
            disclaimer: LEGAL_DISCLAIMER,
          },
          status: "pending",
        }).catch(() => null);
        if (ev) flagsEmitted.push(ev.id);
      }
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `GDPR: ${findings.length} findings (${findings.filter(f => f.severity === "critical").length} critical, ${findings.filter(f => f.severity === "warning").length} warning) — ${flagsEmitted.length} flags raised`,
      output_payload_json: {
        disclaimer: LEGAL_DISCLAIMER,
        findings,
        overall_assessment: parsed.overall_assessment,
        events_scanned: dataTouchingEvents.length,
        leads_scanned: newLeads.length,
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