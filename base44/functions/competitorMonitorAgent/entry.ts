import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { paidProviderFetch } from '../../shared/costGovernance.ts';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

const AGENT_NAME = "competitor_monitor";
const TASK_TYPE = "competitor_monitor";
const RISK_LEVEL = 1;

async function callPerplexity(svc, prompt) {
  const key = Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) return null;
  const res = await paidProviderFetch(svc, { event_key:`api:competitor-monitor:${new Date().toISOString().slice(0,13)}`, category:'api', provider:'perplexity', source:'competitorMonitorAgent' }, "https://api.perplexity.ai/v1/sonar", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Perplexity API error: ${data?.error?.message || res.statusText}`);
  return { content: data?.choices?.[0]?.message?.content || "", citations: data?.citations || [] };
}

async function callClaude(svc, prompt, eventKey) { return (await callCambraClaude(prompt, { tier:'standard', maxTokens:2048, svc, eventKey, source:'competitorMonitorAgent' })).text; }

// L1 — research only, no Approval. Output goes into the Founder Copilot day briefing.
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const competitors = Array.isArray(body?.competitors) && body.competitors.length
      ? body.competitors
      : ["Ramp", "Brex", "Mercury", "Stripe Atlas", "Pilot.com"];
    const sector = body?.sector || "ecommerce infrastructure / spend management / vertical fintech for SMBs";

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Monitor ${competitors.length} competitors · ${sector}`,
      started_at: new Date().toISOString(),
    });

    const prompt = [
      "Eres analista de inteligencia competitiva para CAMBRA (infraestructura económica para ecommerce independientes).",
      "Para cada competidor de la lista, busca novedades de los últimos 30 días: anuncios de producto, rounds, cambios de pricing, pivots, partnerships, contrataciones señaladas, problemas reportados.",
      "Solo eventos relevantes. Si no hay nada relevante, dilo explícitamente.",
      "Devuelve formato:",
      "## <Competidor>",
      "- <Evento concreto> — <fecha aproximada> — <por qué importa a CAMBRA en 1 línea>",
      "(o: 'Sin novedades relevantes')",
      "",
      "Cierra con una sección '## Implicaciones para CAMBRA' (3-5 bullets de qué hacer/observar).",
      "",
      `Competidores: ${competitors.join(", ")}`,
      `Sector: ${sector}`,
    ].join("\n");

    let summary = "";
    let citations = [];
    let source = "perplexity";

    const pplx = await callPerplexity(base44.asServiceRole, prompt).catch((e) => { throw e; });
    if (pplx) {
      summary = pplx.content;
      citations = pplx.citations;
    } else {
      const fallback = await callClaude(base44.asServiceRole,
        prompt + "\n\nNOTA IMPORTANTE: No tienes acceso a internet ni a datos en tiempo real. Marca explícitamente al inicio: '⚠️ Análisis sin datos en tiempo real — basado en conocimiento general del sector hasta tu fecha de corte.' Y no inventes eventos específicos con fechas."
      , task?.id || crypto.randomUUID());
      summary = fallback;
      source = "claude_fallback";
    }

    if (!summary) throw new Error("Empty competitor monitor output");

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Competitor monitor (${source}): ${competitors.length} competitors scanned`,
      output_payload_json: { summary, citations, source, competitors, sector },
      completed_at: new Date().toISOString(),
    });

    // Emit an Event so the founder copilot's day briefing can pick it up.
    await base44.asServiceRole.entities.Event.create({
      brand_id: "_platform",
      event_type: "research.competitor_monitor.completed",
      source: AGENT_NAME,
      entity_type: "AgentTask",
      entity_id: task.id,
      agent_task_id: task.id,
      payload_json: { source, competitors, summary_preview: summary.slice(0, 400) },
      status: "processed",
      processed_at: new Date().toISOString(),
    }).catch((error:any)=>safeBestEffort(error,{operation:'competitorMonitorAgent',fallback:null,severity:'secondary'}));

    return Response.json({ ok: true, task_id: task.id, source, summary, citations });
  } catch (error) {
    if (task?.id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.AgentTask.update(task.id, { status: "failed", error: error.message, completed_at: new Date().toISOString() });
      } catch (_) { /* swallow */ }
    }
    return internalErrorResponse(error, 'competitorMonitorAgent');
  }
});
