import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "lead_scoring";
const TASK_TYPE = "score_leads";
const RISK_LEVEL = 1;

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

function safeParseJSON(text) {
  if (!text) return null;
  // Strip markdown fences if present
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  // Try to extract the first JSON array/object substring
  const match = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const leadIds = Array.isArray(body?.lead_ids) ? body.lead_ids : null;
    const limit = Math.min(Number(body?.limit) || 25, 50);

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: leadIds ? `Score ${leadIds.length} leads` : `Score latest ${limit} unscored leads`,
      started_at: new Date().toISOString(),
    });

    let leads = [];
    if (leadIds && leadIds.length) {
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ id: { $in: leadIds } }, "-created_date", leadIds.length).catch(() => []);
    } else {
      // Prefer enriched, fall back to any unscored
      leads = await base44.asServiceRole.entities.OutboundLead
        .filter({ score: null }, "-created_date", limit).catch(() => []);
      if (!leads.length) {
        leads = await base44.asServiceRole.entities.OutboundLead
          .list("-created_date", limit).catch(() => []);
      }
    }

    if (!leads.length) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: "No leads to score",
        output_payload_json: { count: 0 },
        completed_at: new Date().toISOString(),
      });
      return Response.json({ ok: true, task_id: task.id, count: 0 });
    }

    // Compact lead payload for Claude
    const compact = leads.map(l => ({
      id: l.id,
      company: l.company_name,
      domain: l.company_domain,
      contact: l.contact_full_name,
      title: l.contact_title,
      country: l.country,
      industry: l.industry,
      enrichment: l.enrichment_json || null,
    }));

    const prompt = [
      "Eres lead scoring engine de CAMBRA (infraestructura económica para ecommerce independientes).",
      "Puntúa cada lead 0-100 con esta rúbrica:",
      "- ICP fit: 40 pts (ecommerce real, founder/CEO, tamaño relevante)",
      "- Overpayment likelihood: 35 pts (señales de stack caro, procesamiento alto, sin optimización)",
      "- Conversion likelihood: 25 pts (alcanzabilidad, momento, señales de intención)",
      "",
      "Devuelve SOLO un JSON array, sin texto extra, con este shape:",
      `[{"id":"<lead_id>","score":<0-100>,"breakdown":{"icp_fit":<0-40>,"overpayment":<0-35>,"conversion":<0-25>},"reasoning":"<1 línea>","next_action":"<acción concreta>"}]`,
      "",
      "Leads:",
      JSON.stringify(compact),
    ].join("\n");

    const text = await callClaude(prompt);
    const scored = safeParseJSON(text);

    if (!Array.isArray(scored)) {
      throw new Error(`Claude returned unparseable response: ${text.slice(0, 200)}`);
    }

    // Apply scores back to OutboundLead
    const updates = scored
      .filter(s => s?.id && typeof s.score === "number")
      .map(s => ({
        id: s.id,
        score: Math.max(0, Math.min(100, Math.round(s.score))),
        score_breakdown_json: { breakdown: s.breakdown, reasoning: s.reasoning },
        next_action: s.next_action || null,
        stage: "scored",
      }));

    if (updates.length) {
      try {
        await base44.asServiceRole.entities.OutboundLead.bulkUpdate(updates);
      } catch (e) {
        for (const u of updates) {
          const { id, ...patch } = u;
          await base44.asServiceRole.entities.OutboundLead.update(id, patch).catch(() => null);
        }
      }
    }

    // Sort by score desc for the response
    const ranked = [...scored].sort((a, b) => (b.score || 0) - (a.score || 0));

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Scored ${updates.length} of ${leads.length} leads`,
      output_payload_json: {
        count: leads.length,
        scored: updates.length,
        top: ranked.slice(0, 10),
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, count: leads.length, scored: updates.length, ranked });
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