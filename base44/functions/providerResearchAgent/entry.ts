import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "provider_research";
const TASK_TYPE = "provider_research";
const RISK_LEVEL = 1;

async function callPerplexity(prompt) {
  const key = Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      model: "llama-3.1-sonar-large-128k-online",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Perplexity API error: ${data?.error?.message || res.statusText}`);
  return { content: data?.choices?.[0]?.message?.content || "", citations: data?.citations || [] };
}

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY o PERPLEXITY_API_KEY a Base44 secrets");
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

// L1 — feeds the Analyzer's recommendations with real provider data
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const providerName = body?.provider_name;
    const category = body?.category || "payments";
    const country = body?.country || "Spain";
    if (!providerName) return Response.json({ ok: false, error: "provider_name required" }, { status: 400 });

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `Research provider: ${providerName} (${category}, ${country})`,
      started_at: new Date().toISOString(),
    });

    const researchPrompt = [
      `Investiga el proveedor "${providerName}" en la categoría ${category} para clientes ecommerce en ${country}.`,
      "Busca y reporta:",
      "1. Pricing público actual (fees, tiers, gotchas)",
      "2. Reviews recientes (G2, Trustpilot, Reddit) — qué dicen los usuarios",
      "3. Condiciones contractuales (lock-in, exit fees, payout timing)",
      "4. Cambios recientes (precios, producto, problemas reportados)",
      "5. Quién lo usa típicamente (perfil de cliente típico)",
      "",
      "Cita fuentes concretas. Si algo no se puede confirmar públicamente, dilo.",
    ].join("\n");

    let rawResearch = "";
    let citations = [];
    let researchSource = "perplexity";

    const pplx = await callPerplexity(researchPrompt).catch((e) => { throw e; });
    if (pplx) {
      rawResearch = pplx.content;
      citations = pplx.citations;
    } else {
      rawResearch = await callClaude(
        researchPrompt + "\n\n⚠️ NOTA: No tienes acceso a internet. Basa la respuesta en conocimiento general del proveedor hasta tu fecha de corte. No inventes pricing específico ni fechas. Marca claramente qué es conocimiento general vs lo que necesita verificación."
      );
      researchSource = "claude_fallback";
    }

    // Structure it for the Analyzer
    const structurePrompt = [
      "Toma esta investigación y devuelve SOLO JSON con shape estricto:",
      `{"provider":"${providerName}","category":"${category}","country":"${country}",`,
      `"pricing":{"summary":"<2-3 líneas>","fee_examples":[{"label":"<fee>","value":"<valor>"}],"hidden_costs":["<gotcha>"]},`,
      `"reputation":{"score":"<good|mixed|poor|unknown>","themes_positive":["<tema>"],"themes_negative":["<tema>"]},`,
      `"contract":{"lock_in":"<resumen o unknown>","exit_terms":"<resumen o unknown>","payout_timing":"<resumen o unknown>"},`,
      `"recent_changes":["<cambio>"],"typical_customer":"<descripción>","confidence":"<high|medium|low>","sources_quality":"<verified|partial|unverified>"}`,
      "",
      "Si un campo no se puede determinar, usa 'unknown' o array vacío. No inventes.",
      "",
      "INVESTIGACIÓN:",
      rawResearch,
    ].join("\n");

    const structuredText = await callClaude(structurePrompt);
    const structured = safeParseJSON(structuredText);
    if (!structured) throw new Error(`Failed to structure research: ${structuredText.slice(0, 200)}`);

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `Provider research (${researchSource}): ${providerName} — confidence ${structured.confidence || "unknown"}`,
      output_payload_json: {
        provider_name: providerName,
        category,
        country,
        structured,
        raw_research: rawResearch,
        citations,
        research_source: researchSource,
      },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, research_source: researchSource, structured, citations });
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