import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_NAME = "seo";
const TASK_TYPE = "seo_keyword_analysis";
const RISK_LEVEL = 1;

async function callClaude(prompt) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("TOOL_NOT_CONFIGURED: añade ANTHROPIC_API_KEY a Base44 secrets para activar este agente");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 2048, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API error: ${data?.error?.message || res.statusText}`);
  return data?.content?.[0]?.text || "";
}

function safeParseJSON(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const match = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* fallthrough */ } }
  return null;
}

// L1 — research interno, no Approval
Deno.serve(async (req) => {
  let task = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const seedKeywords = Array.isArray(body?.keywords) && body.keywords.length
      ? body.keywords
      : ["payment processing fees", "ecommerce infrastructure cost", "shipping rates ecommerce"];
    const location = body?.location || "United Kingdom";

    task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: "_platform",
      agent_name: AGENT_NAME,
      task_type: TASK_TYPE,
      status: "running",
      requires_approval: false,
      risk_level: RISK_LEVEL,
      input_summary: `SEO analysis: ${seedKeywords.length} keywords · ${location}`,
      started_at: new Date().toISOString(),
    });

    const surferKey = Deno.env.get("SURFER_API_KEY");
    let analysis = null;
    let source = "claude_fallback";

    if (surferKey) {
      try {
        const out = [];
        for (const kw of seedKeywords.slice(0, 5)) {
          const res = await fetch(`https://app.surferseo.com/api/v1/keyword_research`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "API-KEY": surferKey },
            body: JSON.stringify({ keyword: kw, location }),
          });
          const data = await res.json();
          if (res.ok) {
            out.push({
              keyword: kw,
              search_volume: data?.volume || data?.search_volume,
              difficulty: data?.difficulty,
              related: (data?.related_keywords || []).slice(0, 10),
            });
          }
        }
        if (out.length) { analysis = { keywords: out }; source = "surfer"; }
      } catch (_) { /* fall through */ }
    }

    if (!analysis) {
      const prompt = [
        "Eres analista SEO de CAMBRA (infraestructura económica para ecommerce independientes).",
        "Para cada keyword da estimación realista basada en tu conocimiento del mercado SaaS B2B / ecommerce.",
        "IMPORTANTE: marca estos volúmenes como ESTIMADOS, no datos verificados.",
        "",
        "Devuelve SOLO JSON con shape:",
        `{"keywords":[{"keyword":"<kw>","estimated_volume":<num>,"estimated_difficulty":"<low|medium|high>","intent":"<informational|commercial|transactional>","content_angle":"<sugerencia de ángulo>","related":["<kw>","<kw>"]}],"summary":"<2-3 líneas con prioridades>"}`,
        "",
        `Keywords: ${JSON.stringify(seedKeywords)}`,
        `Location: ${location}`,
      ].join("\n");
      const text = await callClaude(prompt);
      analysis = safeParseJSON(text);
      if (!analysis) throw new Error(`Claude returned unparseable analysis: ${text.slice(0, 200)}`);
    }

    await base44.asServiceRole.entities.AgentTask.update(task.id, {
      status: "completed",
      output_summary: `SEO analysis (${source}): ${analysis?.keywords?.length || 0} keywords analyzed`,
      output_payload_json: { analysis, source, location, seed_keywords: seedKeywords },
      completed_at: new Date().toISOString(),
    });

    return Response.json({ ok: true, task_id: task.id, source, analysis });
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